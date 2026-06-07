'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, clients, auditLogs } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/auth-helpers';
import { parseCsv, stripBomAndTrim, validateHeaders } from '@/lib/csv-parse';

/**
 * CSV import for /clients — symmetric with the bulk Export CSV.
 *
 * Two-step UX:
 *   1. previewClientsCsv(csv) → returns a plan of inserts/updates
 *      with row-level errors. NO DB writes.
 *   2. commitClientsCsv(csv)  → re-parses, applies the plan, writes
 *      audit log rows per affected client. Returns the same plan
 *      shape with `applied: true` so the UI can show success.
 *
 * Dedup matches the export shape: by Org no. when present, otherwise
 * by exact case-insensitive name. Mirrors the PowerOffice importer
 * logic so a refresh round-trip (export → edit → import) just
 * updates the rows you touched.
 */

type Kind = 'individual' | 'business' | 'public_sector' | 'cultural_institution' | 'hospitality_group';
const KINDS: readonly Kind[] = [
  'individual',
  'business',
  'public_sector',
  'cultural_institution',
  'hospitality_group'
];

export type CsvRow = {
  name: string;
  kind: Kind;
  orgNumber: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  paymentTermsDays: number;
  activeProjectsIgnored: string; // last column on export but write-once on read
};

export type PreviewItem = {
  rowNumber: number;
  raw: string[];
  parsed?: CsvRow;
  errors?: string[];
  // What the planner decided to do with this row
  decision?: 'insert' | 'update' | 'skip';
  existingId?: string;
};

export type PreviewResult =
  | { ok: true; items: PreviewItem[]; insertCount: number; updateCount: number; errorCount: number }
  | { ok: false; error: string };

const EXPECTED_HEADERS = [
  'Name',
  'Kind',
  'Org no.',
  'Contact',
  'Email',
  'Phone',
  'Payment terms (days)',
  'Active projects'
];

function parseRow(rowNumber: number, cells: string[]): PreviewItem {
  const errors: string[] = [];
  if (cells.length < 2) {
    return { rowNumber, raw: cells, errors: ['Row has too few columns'] };
  }
  const arr = cells.map((c) => (c ?? '').trim());
  const name = arr[0] ?? '';
  const kind = arr[1] ?? '';
  const orgNumber = arr[2] ?? '';
  const contact = arr[3] ?? '';
  const email = arr[4] ?? '';
  const phone = arr[5] ?? '';
  const termsRaw = arr[6] ?? '';

  if (!name) errors.push('Name is required');
  if (!KINDS.includes(kind as Kind)) {
    errors.push(`Kind "${kind}" is not one of ${KINDS.join(', ')}`);
  }
  let paymentTermsDays = 30;
  if (termsRaw) {
    const parsed = parseInt(termsRaw, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 365) {
      errors.push(`Payment terms "${termsRaw}" must be a number between 0 and 365`);
    } else {
      paymentTermsDays = parsed;
    }
  }
  if (email && !/^.+@.+\..+$/.test(email)) {
    errors.push(`Email "${email}" doesn't look valid`);
  }

  if (errors.length) return { rowNumber, raw: cells, errors };

  return {
    rowNumber,
    raw: cells,
    parsed: {
      name,
      kind: kind as Kind,
      orgNumber: orgNumber || null,
      primaryContactName: contact || null,
      primaryContactEmail: email || null,
      primaryContactPhone: phone || null,
      paymentTermsDays,
      activeProjectsIgnored: '' // present in export, ignored on import
    }
  };
}

async function buildPlan(csv: string): Promise<PreviewResult> {
  const trimmed = stripBomAndTrim(csv);
  if (!trimmed) return { ok: false, error: 'CSV is empty' };
  const rows = parseCsv(trimmed).filter((r) => r.some((c) => c.trim().length > 0));
  if (rows.length === 0) return { ok: false, error: 'No rows found' };

  const headerErr = validateHeaders(rows[0]!, EXPECTED_HEADERS);
  if (headerErr) return { ok: false, error: headerErr };

  const items: PreviewItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    items.push(parseRow(i + 1, rows[i]!));
  }

  // Decide insert vs update for each valid parsed row by matching
  // existing clients on org no. (preferred) then name.
  const existingByOrg = new Map<string, string>();
  const existingByName = new Map<string, string>();
  const allClients = await db
    .select({ id: clients.id, name: clients.name, orgNumber: clients.orgNumber })
    .from(clients);
  for (const c of allClients) {
    if (c.orgNumber) existingByOrg.set(c.orgNumber, c.id);
    existingByName.set(c.name.toLowerCase(), c.id);
  }

  let insertCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  for (const item of items) {
    if (!item.parsed) {
      item.decision = 'skip';
      errorCount++;
      continue;
    }
    const orgMatch = item.parsed.orgNumber ? existingByOrg.get(item.parsed.orgNumber) : undefined;
    const nameMatch = existingByName.get(item.parsed.name.toLowerCase());
    const matchedId = orgMatch ?? nameMatch;
    if (matchedId) {
      item.decision = 'update';
      item.existingId = matchedId;
      updateCount++;
    } else {
      item.decision = 'insert';
      insertCount++;
    }
  }

  return { ok: true, items, insertCount, updateCount, errorCount };
}

export async function previewClientsCsv(csv: string): Promise<PreviewResult> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) return { ok: false, error: 'Not authorised' };
  return buildPlan(csv);
}

export async function commitClientsCsv(
  csv: string
): Promise<PreviewResult & { applied?: boolean }> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) return { ok: false, error: 'Not authorised' };

  const plan = await buildPlan(csv);
  if (!plan.ok) return plan;

  for (const item of plan.items) {
    if (!item.parsed) continue;
    if (item.decision === 'insert') {
      const [inserted] = await db
        .insert(clients)
        .values({
          name: item.parsed.name,
          kind: item.parsed.kind,
          orgNumber: item.parsed.orgNumber,
          primaryContactName: item.parsed.primaryContactName,
          primaryContactEmail: item.parsed.primaryContactEmail,
          primaryContactPhone: item.parsed.primaryContactPhone,
          paymentTermsDays: item.parsed.paymentTermsDays
        })
        .returning({ id: clients.id });
      if (inserted) {
        await db.insert(auditLogs).values({
          entityType: 'client',
          entityId: inserted.id,
          actorId: user.id,
          action: 'csv_import_insert',
          before: {},
          after: { ...item.parsed, activeProjectsIgnored: undefined }
        });
      }
    } else if (item.decision === 'update' && item.existingId) {
      const [before] = await db.select().from(clients).where(eq(clients.id, item.existingId)).limit(1);
      if (!before) continue;
      await db
        .update(clients)
        .set({
          name: item.parsed.name,
          kind: item.parsed.kind,
          orgNumber: item.parsed.orgNumber,
          primaryContactName: item.parsed.primaryContactName,
          primaryContactEmail: item.parsed.primaryContactEmail,
          primaryContactPhone: item.parsed.primaryContactPhone,
          paymentTermsDays: item.parsed.paymentTermsDays,
          updatedAt: new Date()
        })
        .where(eq(clients.id, item.existingId));
      const diff: Record<string, { before: unknown; after: unknown }> = {};
      const cmp: Array<[string, unknown, unknown]> = [
        ['name', before.name, item.parsed.name],
        ['kind', before.kind, item.parsed.kind],
        ['orgNumber', before.orgNumber, item.parsed.orgNumber],
        ['primaryContactName', before.primaryContactName, item.parsed.primaryContactName],
        ['primaryContactEmail', before.primaryContactEmail, item.parsed.primaryContactEmail],
        ['primaryContactPhone', before.primaryContactPhone, item.parsed.primaryContactPhone],
        ['paymentTermsDays', before.paymentTermsDays, item.parsed.paymentTermsDays]
      ];
      for (const [k, b, a] of cmp) {
        const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
        if (norm(b) !== norm(a)) diff[k] = { before: b, after: a };
      }
      if (Object.keys(diff).length > 0) {
        await db.insert(auditLogs).values({
          entityType: 'client',
          entityId: item.existingId,
          actorId: user.id,
          action: 'csv_import_update',
          before: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.before])),
          after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))
        });
      }
    }
  }

  revalidatePath('/clients');
  return { ...plan, applied: true };
}
