'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db, vendors, auditLogs } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/auth-helpers';
import { vendorEditSchema } from '@/lib/validations/vendor';

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateVendor(
  vendorId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) {
    return { ok: false, error: 'Not authorised' };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = vendorEditSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>
    };
  }

  const [before] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!before) return { ok: false, error: 'Vendor not found' };

  const d = parsed.data;
  const categories = (d.categoriesRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const next = {
    name: d.name,
    kind: d.kind,
    country: d.country ? d.country.toUpperCase() : null,
    defaultCurrency: d.defaultCurrency ? d.defaultCurrency : null,
    contactName: d.contactName || null,
    contactEmail: d.contactEmail || null,
    contactPhone: d.contactPhone || null,
    address: d.address || null,
    typicalLeadTimeDays: d.typicalLeadTimeDays ?? null,
    paymentTerms: d.paymentTerms || null,
    rating: d.rating ?? null,
    active: d.active,
    categories,
    notes: d.notes || null
  };

  await db.update(vendors).set({ ...next, updatedAt: new Date() }).where(eq(vendors.id, vendorId));

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    const b = (before as Record<string, unknown>)[key];
    const a = next[key];
    // Arrays need shallow-compare since norm() doesn't deep-equal them.
    if (Array.isArray(b) && Array.isArray(a)) {
      if (b.join('|') === a.join('|')) continue;
    } else if (norm(b) === norm(a)) {
      continue;
    }
    diff[key] = { before: b, after: a };
  }
  if (Object.keys(diff).length > 0) {
    await db.insert(auditLogs).values({
      entityType: 'vendor',
      entityId: vendorId,
      actorId: user.id,
      action: 'update',
      before: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.before])),
      after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))
    });
  }

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath('/vendors');
  redirect(`/vendors/${vendorId}`);
}

/* ────────────── bulk actions ────────────── */

type BulkResult = { ok: true; affected: number } | { ok: false; error: string };

/**
 * Bulk-flip the `active` flag on many vendors. Used to deactivate a
 * batch of obsolete suppliers in one go (or restore them). Writes one
 * audit log row per vendor whose flag actually flipped.
 */
export async function bulkSetVendorActive(
  ids: string[],
  active: boolean
): Promise<BulkResult> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) {
    return { ok: false, error: 'Not authorised' };
  }
  if (!ids.length) return { ok: false, error: 'No ids provided' };

  const before = await db
    .select({ id: vendors.id, active: vendors.active })
    .from(vendors)
    .where(inArray(vendors.id, ids));

  await db
    .update(vendors)
    .set({ active, updatedAt: new Date() })
    .where(inArray(vendors.id, ids));

  const auditRows = before
    .filter((b) => b.active !== active)
    .map((b) => ({
      entityType: 'vendor',
      entityId: b.id,
      actorId: user.id,
      action: 'update',
      before: { active: b.active },
      after: { active }
    }));
  if (auditRows.length) await db.insert(auditLogs).values(auditRows);

  revalidatePath('/vendors');
  return { ok: true, affected: ids.length };
}
