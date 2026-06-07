'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, clients, auditLogs } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/auth-helpers';
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
  if (!user || !isStaffEmail(user.email)) {
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
