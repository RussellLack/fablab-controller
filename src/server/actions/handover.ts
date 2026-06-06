'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, items } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

/**
 * Handover server actions — module #9 closes when the linear
 * lifecycle reaches `signed_off` on every item.
 *
 *   installed → signed_off   (sign off — client confirms acceptable)
 *   installed → damaged      (raise snag — item back into exception flow)
 *
 * Handover is the project's last linear gate. When every item on the
 * project has `signed_off_at` set, the project is eligible for the
 * Handover stage closure (a separate Stage advancement action on the
 * project header, already wired up).
 */

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function refreshSurfaces(projectId: string) {
  revalidatePath(`/projects/${projectId}/handover`);
  revalidatePath(`/projects/${projectId}/delivery`);
  revalidatePath(`/projects/${projectId}/items`);
  revalidatePath(`/dashboard`);
}

/**
 * installed → signed_off. Stamps `signedOffAt` and accepts an optional
 * client signature/witness note that gets appended to `items.notes`.
 *
 * Per `00-` §22 doctrine, written sign-off is the load-bearing
 * artefact at this stage. The portal-side brief sign-off (B5) is
 * for the brief; this is per-item sign-off at handover.
 */
export async function signOffItem(
  itemId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const note = formData.get('note')?.toString().trim() || null;

  const [existing] = await db
    .select({ status: items.status, notes: items.notes })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Item not found' };
  if (existing.status !== 'installed') {
    return {
      ok: false,
      error: `Only installed items can be signed off. This one is ${existing.status}.`
    };
  }

  let combinedNotes = existing.notes;
  if (note) {
    const stamp = new Date().toISOString().slice(0, 10);
    const noteLine = `[${stamp}] signed off: ${note}`;
    combinedNotes = existing.notes ? `${existing.notes}\n${noteLine}` : noteLine;
  }

  await db
    .update(items)
    .set({
      status: 'signed_off',
      signedOffAt: new Date().toISOString().slice(0, 10),
      notes: combinedNotes,
      updatedAt: new Date()
    })
    .where(eq(items.id, itemId));

  refreshSurfaces(projectId);
  return { ok: true };
}

/**
 * installed → damaged. Used when an item that was installed turns
 * out to be unacceptable (snag). The item drops back into the
 * Delivery view's Exception section and the staff resolves it from
 * there (replace, rework, etc.). Note is required for audit.
 */
export async function raiseSnag(
  itemId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const note = formData.get('note')?.toString().trim() || null;
  if (!note) {
    return {
      ok: false,
      error: 'Snag description is required for audit.'
    };
  }

  const [existing] = await db
    .select({ status: items.status, notes: items.notes })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Item not found' };
  if (existing.status !== 'installed') {
    return {
      ok: false,
      error: `Only installed items can have snags raised. This one is ${existing.status}.`
    };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const noteLine = `[${stamp}] snag raised at handover: ${note}`;
  const combinedNotes = existing.notes
    ? `${existing.notes}\n${noteLine}`
    : noteLine;

  await db
    .update(items)
    .set({
      status: 'damaged',
      notes: combinedNotes,
      updatedAt: new Date()
    })
    .where(eq(items.id, itemId));

  refreshSurfaces(projectId);
  return { ok: true };
}

/**
 * Undo sign-off on an item (back to installed) — used when sign-off
 * was recorded in error and needs reverting. signedOffAt is cleared.
 */
export async function unsignItem(
  itemId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({ status: items.status })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Item not found' };
  if (existing.status !== 'signed_off') {
    return {
      ok: false,
      error: `Only signed-off items can be unsigned. This one is ${existing.status}.`
    };
  }

  await db
    .update(items)
    .set({
      status: 'installed',
      signedOffAt: null,
      updatedAt: new Date()
    })
    .where(eq(items.id, itemId));

  refreshSurfaces(projectId);
  return { ok: true };
}
