'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, vendors, auditLogs } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffAllowed } from '@/lib/staff-access';
import { parseCsv, stripBomAndTrim, validateHeaders } from '@/lib/csv-parse';

/**
 * CSV import for /vendors — round-trip companion to the bulk Export CSV.
 *
 * Match key: case-insensitive `name` (vendors have no orgNumber column;
 * name is the natural handle, same as the bulk-update / dual-role logic).
 *
 * Insert path includes a derived defaultCurrency from country (NO→NOK,
 * DK→DKK, SE→SEK, GB→GBP, else→EUR) — matches the PowerOffice importer
 * so new rows look consistent with the rest of the table.
 *
 * Tricky columns:
 *   • Kind is the second column — must match the vendor_kind enum exactly.
 *   • Country is uppercased to its 2-letter ISO form.
 *   • Categories is the LAST column and is `;`-separated inside the cell
 *     (matches the export format).
 *   • Empty Lead time / Rating cells map to null; non-numeric values flag
 *     the row as an error in the preview.
 */

type Kind = 'supplier' | 'fabricator' | 'contractor' | 'internal_workshop';
const KINDS: readonly Kind[] = ['supplier', 'fabricator', 'contractor', 'internal_workshop'];

type Currency = 'NOK' | 'EUR' | 'USD' | 'GBP' | 'SEK' | 'DKK';

type ParsedRow = {
  name: string;
  kind: Kind;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
  typicalLeadTimeDays: number | null;
  rating: number | null;
  categories: string[];
};

export type PreviewItem = {
  rowNumber: number;
  raw: string[];
  parsed?: ParsedRow;
  errors?: string[];
  decision?: 'insert' | 'update' | 'skip';
  existingId?: string;
};

export type PreviewResult =
  | { ok: true; items: PreviewItem[]; insertCount: number; updateCount: number; errorCount: number }
  | { ok: false; error: string };

const EXPECTED_HEADERS = [
  'Name',
  'Kind',
  'Country',
  'Contact',
  'Email',
  'Lead time (days)',
  'Rating',
  'Categories'
];

function currencyFor(country: string | null): Currency {
  switch (country) {
    case 'NO': return 'NOK';
    case 'DK': return 'DKK';
    case 'SE': return 'SEK';
    case 'GB': return 'GBP';
    default: return 'EUR';
  }
}

function parseRow(rowNumber: number, cells: string[]): PreviewItem {
  const errors: string[] = [];
  const arr = cells.map((c) => (c ?? '').trim());
  const name = arr[0] ?? '';
  const kind = arr[1] ?? '';
  const country = arr[2] ?? '';
  const contactName = arr[3] ?? '';
  const contactEmail = arr[4] ?? '';
  const leadRaw = arr[5] ?? '';
  const ratingRaw = arr[6] ?? '';
  const categoriesRaw = arr[7] ?? '';

  if (!name) errors.push('Name is required');
  if (!KINDS.includes(kind as Kind)) {
    errors.push(`Kind "${kind}" is not one of ${KINDS.join(', ')}`);
  }
  let leadDays: number | null = null;
  if (leadRaw) {
    const n = parseInt(leadRaw, 10);
    if (Number.isNaN(n) || n < 0) errors.push(`Lead time "${leadRaw}" must be a non-negative integer`);
    else leadDays = n;
  }
  let rating: number | null = null;
  if (ratingRaw) {
    const n = parseInt(ratingRaw, 10);
    if (Number.isNaN(n) || n < 1 || n > 5) errors.push(`Rating "${ratingRaw}" must be 1–5`);
    else rating = n;
  }
  if (contactEmail && !/^.+@.+\..+$/.test(contactEmail)) {
    errors.push(`Email "${contactEmail}" doesn't look valid`);
  }
  const countryUp = country ? country.toUpperCase() : null;
  if (countryUp && !/^[A-Z]{2}$/.test(countryUp)) {
    errors.push(`Country "${country}" should be a 2-letter ISO code`);
  }
  const categories = categoriesRaw
    ? categoriesRaw.split(';').map((s) => s.trim()).filter(Boolean)
    : [];

  if (errors.length) return { rowNumber, raw: cells, errors };

  return {
    rowNumber,
    raw: cells,
    parsed: {
      name,
      kind: kind as Kind,
      country: countryUp,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      typicalLeadTimeDays: leadDays,
      rating,
      categories
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

  // Build the existing-vendor index for upsert decisions
  const existing = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors);
  const byName = new Map<string, string>();
  for (const v of existing) byName.set(v.name.toLowerCase(), v.id);

  let insertCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  for (const item of items) {
    if (!item.parsed) {
      item.decision = 'skip';
      errorCount++;
      continue;
    }
    const matched = byName.get(item.parsed.name.toLowerCase());
    if (matched) {
      item.decision = 'update';
      item.existingId = matched;
      updateCount++;
    } else {
      item.decision = 'insert';
      insertCount++;
    }
  }

  return { ok: true, items, insertCount, updateCount, errorCount };
}

export async function previewVendorsCsv(csv: string): Promise<PreviewResult> {
  const user = await getCurrentUser();
  if (!user || !(await isStaffAllowed(user.email))) return { ok: false, error: 'Not authorised' };
  return buildPlan(csv);
}

export async function commitVendorsCsv(
  csv: string
): Promise<PreviewResult & { applied?: boolean }> {
  const user = await getCurrentUser();
  if (!user || !(await isStaffAllowed(user.email))) return { ok: false, error: 'Not authorised' };

  const plan = await buildPlan(csv);
  if (!plan.ok) return plan;

  for (const item of plan.items) {
    if (!item.parsed) continue;
    if (item.decision === 'insert') {
      const [inserted] = await db
        .insert(vendors)
        .values({
          name: item.parsed.name,
          kind: item.parsed.kind,
          country: item.parsed.country,
          contactName: item.parsed.contactName,
          contactEmail: item.parsed.contactEmail,
          typicalLeadTimeDays: item.parsed.typicalLeadTimeDays,
          rating: item.parsed.rating,
          categories: item.parsed.categories,
          defaultCurrency: currencyFor(item.parsed.country)
        })
        .returning({ id: vendors.id });
      if (inserted) {
        await db.insert(auditLogs).values({
          entityType: 'vendor',
          entityId: inserted.id,
          actorId: user.id,
          action: 'csv_import_insert',
          before: {},
          after: { ...item.parsed }
        });
      }
    } else if (item.decision === 'update' && item.existingId) {
      const [before] = await db.select().from(vendors).where(eq(vendors.id, item.existingId)).limit(1);
      if (!before) continue;
      await db
        .update(vendors)
        .set({
          name: item.parsed.name,
          kind: item.parsed.kind,
          country: item.parsed.country,
          contactName: item.parsed.contactName,
          contactEmail: item.parsed.contactEmail,
          typicalLeadTimeDays: item.parsed.typicalLeadTimeDays,
          rating: item.parsed.rating,
          categories: item.parsed.categories,
          updatedAt: new Date()
        })
        .where(eq(vendors.id, item.existingId));
      const diff: Record<string, { before: unknown; after: unknown }> = {};
      const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
      const cmp: Array<[string, unknown, unknown]> = [
        ['name', before.name, item.parsed.name],
        ['kind', before.kind, item.parsed.kind],
        ['country', before.country, item.parsed.country],
        ['contactName', before.contactName, item.parsed.contactName],
        ['contactEmail', before.contactEmail, item.parsed.contactEmail],
        ['typicalLeadTimeDays', before.typicalLeadTimeDays, item.parsed.typicalLeadTimeDays],
        ['rating', before.rating, item.parsed.rating]
      ];
      for (const [k, b, a] of cmp) {
        if (norm(b) !== norm(a)) diff[k] = { before: b, after: a };
      }
      // Categories — compare as joined strings; capture full array on change
      if ((before.categories ?? []).join('|') !== item.parsed.categories.join('|')) {
        diff.categories = { before: before.categories, after: item.parsed.categories };
      }
      if (Object.keys(diff).length > 0) {
        await db.insert(auditLogs).values({
          entityType: 'vendor',
          entityId: item.existingId,
          actorId: user.id,
          action: 'csv_import_update',
          before: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.before])),
          after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))
        });
      }
    }
  }

  revalidatePath('/vendors');
  return { ...plan, applied: true };
}
