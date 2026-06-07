'use server';

import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { db, projects, clients, auditLogs } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/auth-helpers';
import { parseCsv, stripBomAndTrim, validateHeaders } from '@/lib/csv-parse';

/**
 * CSV import for /projects — UPDATE-ONLY by Reference.
 *
 * Why update-only:
 *
 *   1. Stage transitions are a state-machine controlled by the
 *      Advance / Hold lifecycle buttons + gate validation. The Stage
 *      column on this CSV is read, compared, and explicitly IGNORED
 *      on write — we surface a per-row "stage column ignored" note
 *      in the preview so users aren't surprised.
 *
 *   2. New projects require fields the export doesn't carry
 *      (projectType, fablabRole, currentOwnerId, leadId, etc.).
 *      Creating them via CSV would either bypass the brief / lead /
 *      gate flow or require a much wider column set. Both are bad
 *      ideas — new projects should come through Leads → Convert.
 *
 * The Client column is matched by name (case-insensitive) — if the
 * new value can't be resolved to an existing client row, the change
 * is flagged as an error in the preview.
 */

type Currency = 'NOK' | 'EUR' | 'USD' | 'GBP' | 'SEK' | 'DKK';
const CURRENCIES: readonly Currency[] = ['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'];

type ParsedRow = {
  reference: string;
  title: string;
  clientName: string;        // for resolution
  resolvedClientId: string;  // looked up by name
  budget: string | null;     // numeric string for the DB column
  budgetCurrency: Currency;
  targetHandoverDate: string | null;
  stageIgnored: string | null; // value from the CSV that we read but won't write
};

export type PreviewItem = {
  rowNumber: number;
  raw: string[];
  parsed?: ParsedRow;
  errors?: string[];
  notes?: string[];
  decision?: 'update' | 'skip';
  existingId?: string;
};

export type PreviewResult =
  | { ok: true; items: PreviewItem[]; updateCount: number; skippedCount: number; errorCount: number }
  | { ok: false; error: string };

const EXPECTED_HEADERS = [
  'Reference',
  'Title',
  'Client',
  'Stage',
  'Budget',
  'Currency',
  'Target handover'
];

function parseRow(
  rowNumber: number,
  cells: string[],
  clientByName: Map<string, string>
): PreviewItem {
  const errors: string[] = [];
  const notes: string[] = [];
  const arr = cells.map((c) => (c ?? '').trim());
  const reference = arr[0] ?? '';
  const title = arr[1] ?? '';
  const clientName = arr[2] ?? '';
  const stageRaw = arr[3] ?? '';
  const budgetRaw = arr[4] ?? '';
  const currencyRaw = arr[5] ?? '';
  const handoverRaw = arr[6] ?? '';

  if (!reference) errors.push('Reference is required (used as match key)');
  if (!title) errors.push('Title is required');
  let resolvedClientId = '';
  if (clientName) {
    const id = clientByName.get(clientName.toLowerCase());
    if (!id) errors.push(`Client "${clientName}" not found in clients table`);
    else resolvedClientId = id;
  } else {
    errors.push('Client is required');
  }
  let budget: string | null = null;
  if (budgetRaw) {
    const n = parseFloat(budgetRaw);
    if (Number.isNaN(n) || n < 0) errors.push(`Budget "${budgetRaw}" must be a non-negative number`);
    else budget = String(n);
  }
  let budgetCurrency: Currency = 'NOK';
  if (currencyRaw) {
    if (!CURRENCIES.includes(currencyRaw as Currency)) {
      errors.push(`Currency "${currencyRaw}" must be one of ${CURRENCIES.join(', ')}`);
    } else {
      budgetCurrency = currencyRaw as Currency;
    }
  }
  let targetHandoverDate: string | null = null;
  if (handoverRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(handoverRaw)) {
      errors.push(`Target handover "${handoverRaw}" must be YYYY-MM-DD`);
    } else {
      targetHandoverDate = handoverRaw;
    }
  }

  // Stage column is read but never written — record it as a note so
  // the preview shows the user we noticed and chose to skip it.
  if (stageRaw) notes.push(`Stage column value "${stageRaw}" ignored (stage is managed by the lifecycle UI)`);

  if (errors.length) return { rowNumber, raw: cells, errors, notes };
  return {
    rowNumber,
    raw: cells,
    notes,
    parsed: {
      reference,
      title,
      clientName,
      resolvedClientId,
      budget,
      budgetCurrency,
      targetHandoverDate,
      stageIgnored: stageRaw || null
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

  // Index existing clients by name for the per-row client lookup.
  const allClients = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const clientByName = new Map<string, string>();
  for (const c of allClients) clientByName.set(c.name.toLowerCase(), c.id);

  const items: PreviewItem[] = [];
  for (let i = 1; i < rows.length; i++) items.push(parseRow(i + 1, rows[i]!, clientByName));

  // Match by reference — projects don't get inserted from CSV.
  const refs = items
    .filter((it) => it.parsed && it.parsed.reference)
    .map((it) => it.parsed!.reference);
  const existing = refs.length
    ? await db
        .select({ id: projects.id, reference: projects.reference })
        .from(projects)
        .where(inArray(projects.reference, refs))
    : [];
  const existingByRef = new Map<string, string>();
  for (const e of existing) existingByRef.set(e.reference, e.id);

  let updateCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  for (const item of items) {
    if (!item.parsed) {
      item.decision = 'skip';
      errorCount++;
      continue;
    }
    const matched = existingByRef.get(item.parsed.reference);
    if (!matched) {
      item.decision = 'skip';
      item.errors = item.errors ?? [];
      item.errors.push(`No existing project with reference "${item.parsed.reference}" — CSV import is update-only`);
      errorCount++;
      // Drop parsed so the preview shows it as an error row
      item.parsed = undefined;
      continue;
    }
    item.decision = 'update';
    item.existingId = matched;
    updateCount++;
  }
  skippedCount = items.length - updateCount - errorCount;

  return { ok: true, items, updateCount, skippedCount, errorCount };
}

export async function previewProjectsCsv(csv: string): Promise<PreviewResult> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) return { ok: false, error: 'Not authorised' };
  return buildPlan(csv);
}

export async function commitProjectsCsv(
  csv: string
): Promise<PreviewResult & { applied?: boolean }> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) return { ok: false, error: 'Not authorised' };

  const plan = await buildPlan(csv);
  if (!plan.ok) return plan;

  for (const item of plan.items) {
    if (!item.parsed || item.decision !== 'update' || !item.existingId) continue;
    const [before] = await db.select().from(projects).where(eq(projects.id, item.existingId)).limit(1);
    if (!before) continue;
    await db
      .update(projects)
      .set({
        title: item.parsed.title,
        clientId: item.parsed.resolvedClientId,
        budget: item.parsed.budget,
        budgetCurrency: item.parsed.budgetCurrency,
        targetHandoverDate: item.parsed.targetHandoverDate,
        updatedAt: new Date()
      })
      .where(eq(projects.id, item.existingId));

    const diff: Record<string, { before: unknown; after: unknown }> = {};
    const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
    const cmp: Array<[string, unknown, unknown]> = [
      ['title', before.title, item.parsed.title],
      ['clientId', before.clientId, item.parsed.resolvedClientId],
      ['budgetCurrency', before.budgetCurrency, item.parsed.budgetCurrency],
      ['targetHandoverDate', before.targetHandoverDate, item.parsed.targetHandoverDate]
    ];
    for (const [k, b, a] of cmp) {
      if (norm(b) !== norm(a)) diff[k] = { before: b, after: a };
    }
    // Budget compared as numbers (DB stores as numeric string).
    if (Number(before.budget ?? 0) !== Number(item.parsed.budget ?? 0)) {
      diff.budget = { before: before.budget, after: item.parsed.budget };
    }

    if (Object.keys(diff).length > 0) {
      await db.insert(auditLogs).values({
        entityType: 'project',
        entityId: item.existingId,
        actorId: user.id,
        action: 'csv_import_update',
        before: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.before])),
        after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))
      });
    }
  }

  revalidatePath('/projects');
  return { ...plan, applied: true };
}
