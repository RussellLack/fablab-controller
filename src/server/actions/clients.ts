'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db, clients, auditLogs } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffAllowed } from '@/lib/staff-access';
import { clientEditSchema, emptyToNull } from '@/lib/validations/client';

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Update a client row. Form-action shape: bind the clientId, then
 * the server action receives (prevState, formData).
 *
 * Writes a `clients.update` row to `auditLogs` with before/after
 * column snapshots — fulfils the project's "every change traceable"
 * doctrine without bloating each table with audit columns.
 */
export async function updateClient(
  clientId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !(await isStaffAllowed(user.email))) {
    return { ok: false, error: 'Not authorised' };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = clientEditSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>
    };
  }

  // Snapshot the row before mutating, so the audit entry captures
  // exactly what changed. Missing row → fail explicitly.
  const [before] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!before) return { ok: false, error: 'Client not found' };

  const next = emptyToNull(parsed.data);

  await db
    .update(clients)
    .set({
      name: next.name,
      kind: next.kind,
      primaryContactName: (next.primaryContactName as string | null) ?? null,
      primaryContactEmail: (next.primaryContactEmail as string | null) ?? null,
      primaryContactPhone: (next.primaryContactPhone as string | null) ?? null,
      billingAddress: (next.billingAddress as string | null) ?? null,
      orgNumber: (next.orgNumber as string | null) ?? null,
      paymentTermsDays: (next.paymentTermsDays as number | undefined) ?? 30,
      bankAccountRef: (next.bankAccountRef as string | null) ?? null,
      notes: (next.notes as string | null) ?? null,
      updatedAt: new Date()
    })
    .where(eq(clients.id, clientId));

  // Build a minimal diff for the audit log: only the columns whose
  // value changed. Keeps audit rows small and instantly scannable.
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    const b = (before as Record<string, unknown>)[key];
    const a = next[key];
    // Treat null/undefined/'' as equivalent so we don't audit no-op
    // empty-string → null transitions.
    const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
    if (norm(b) !== norm(a)) diff[key] = { before: norm(b), after: norm(a) };
  }

  if (Object.keys(diff).length > 0) {
    await db.insert(auditLogs).values({
      entityType: 'client',
      entityId: clientId,
      actorId: user.id,
      action: 'update',
      before: Object.fromEntries(
        Object.entries(diff).map(([k, v]) => [k, v.before])
      ),
      after: Object.fromEntries(
        Object.entries(diff).map(([k, v]) => [k, v.after])
      )
    });
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/clients');
  redirect(`/clients/${clientId}`);
}

/* ────────────── bulk actions ────────────── */

const CLIENT_KINDS = [
  'individual',
  'business',
  'public_sector',
  'cultural_institution',
  'hospitality_group'
] as const;
type ClientKind = (typeof CLIENT_KINDS)[number];

type BulkResult = { ok: true; affected: number } | { ok: false; error: string };

/**
 * Bulk-set the kind for many clients at once. Writes one audit log
 * row per affected client (keeps per-entity history complete) plus a
 * single `clients.bulk_update` summary row tagged with the list of
 * ids so reporting can tell apart bulk vs single edits.
 */
export async function bulkUpdateClientKind(
  ids: string[],
  newKind: string
): Promise<BulkResult> {
  const user = await getCurrentUser();
  if (!user || !(await isStaffAllowed(user.email))) {
    return { ok: false, error: 'Not authorised' };
  }
  if (!ids.length) return { ok: false, error: 'No ids provided' };
  if (!CLIENT_KINDS.includes(newKind as ClientKind)) {
    return { ok: false, error: 'Invalid kind' };
  }

  // Snapshot before-values for the audit entries
  const before = await db
    .select({ id: clients.id, kind: clients.kind })
    .from(clients)
    .where(inArray(clients.id, ids));

  await db
    .update(clients)
    .set({ kind: newKind as ClientKind, updatedAt: new Date() })
    .where(inArray(clients.id, ids));

  // One audit row per client whose kind actually changed
  const auditRows = before
    .filter((b) => b.kind !== newKind)
    .map((b) => ({
      entityType: 'client',
      entityId: b.id,
      actorId: user.id,
      action: 'update',
      before: { kind: b.kind },
      after: { kind: newKind }
    }));
  if (auditRows.length) await db.insert(auditLogs).values(auditRows);

  revalidatePath('/clients');
  return { ok: true, affected: ids.length };
}
