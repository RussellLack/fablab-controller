'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, items } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

/**
 * Delivery-module server actions (module #9 in `00-` §18).
 *
 * The Delivery module is responsible for moving items through the
 * post-procurement lifecycle:
 *
 *   ordered → in_production → ready → shipped → received → installed
 *
 * Plus side states the item can fall into at any point:
 *
 *   on_hold | backorder | damaged | substituted | cancelled
 *
 * (`signed_off` is the Handover phase — a separate module.)
 *
 * Doctrine: an item that's stuck shouldn't be invisible. Exceptions
 * become explicit statuses with a note explaining why, and they
 * show up on the Delivery page until a staff member resumes the
 * item back into the linear flow.
 */

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Forward path for advanceItemDelivery — strict linear progression. */
const FORWARD_NEXT: Record<string, { next: string; stampDate?: 'actualDeliveryAt' | 'installedAt' }> = {
  ordered: { next: 'in_production' },
  in_production: { next: 'ready' },
  ready: { next: 'shipped' },
  // Stamp actualDeliveryAt when the item is actually received on site —
  // matches §12 of the data model.
  shipped: { next: 'received', stampDate: 'actualDeliveryAt' },
  received: { next: 'installed', stampDate: 'installedAt' }
};

const EXCEPTION_VALUES = [
  'on_hold',
  'backorder',
  'damaged',
  'substituted',
  'cancelled'
] as const;
type ExceptionStatus = (typeof EXCEPTION_VALUES)[number];

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function refreshSurfaces(projectId: string) {
  // Delivery list, Today view (item-in-flight queue), per-item page.
  revalidatePath(`/projects/${projectId}/delivery`);
  revalidatePath(`/projects/${projectId}/items`);
  revalidatePath(`/dashboard`);
}

/**
 * Advance a single item to the next state in the linear delivery
 * chain. Stamps the appropriate date column on the way through.
 *
 * Refuses on:
 *   - items not in a forward-traversable state (e.g. already installed,
 *     or in an exception state — use `resumeItemFromException` first)
 *   - missing item
 */
export async function advanceItemDelivery(
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

  const step = FORWARD_NEXT[existing.status];
  if (!step) {
    return {
      ok: false,
      error: `Cannot advance an item in ${existing.status}.${
        EXCEPTION_VALUES.includes(existing.status as ExceptionStatus)
          ? ' Resume from exception first.'
          : ''
      }`
    };
  }

  const updateValues: Record<string, unknown> = {
    status: step.next,
    updatedAt: new Date()
  };
  if (step.stampDate) {
    updateValues[step.stampDate] = new Date().toISOString().slice(0, 10);
  }

  await db.update(items).set(updateValues).where(eq(items.id, itemId));
  refreshSurfaces(projectId);
  return { ok: true };
}

/**
 * Move an item into an exception state with a required note. Used when
 * a delivery hiccups in flight — staff records *why* and keeps the
 * audit trail clean. The note is appended to `items.notes` with a
 * timestamp so the history isn't overwritten on subsequent updates.
 *
 * substituted = vendor swapped product, original spec invalid; the
 *               replacement should be a separate item.
 * cancelled   = item no longer in scope; the PO line stays for audit.
 */
export async function markItemException(
  itemId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const exceptionRaw = (formData.get('exception')?.toString() ?? '').trim();
  if (!EXCEPTION_VALUES.includes(exceptionRaw as ExceptionStatus)) {
    return {
      ok: false,
      error: `Invalid exception type: ${exceptionRaw}`
    };
  }
  const exception = exceptionRaw as ExceptionStatus;

  const note = formData.get('note')?.toString().trim() || null;
  if (!note) {
    return {
      ok: false,
      error: 'A short note explaining the exception is required for audit.'
    };
  }

  const [existing] = await db
    .select({ status: items.status, notes: items.notes })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Item not found' };

  const stamp = new Date().toISOString().slice(0, 10);
  const noteLine = `[${stamp}] ${exception}: ${note}`;
  const combinedNotes = existing.notes
    ? `${existing.notes}\n${noteLine}`
    : noteLine;

  await db
    .update(items)
    .set({
      status: exception,
      notes: combinedNotes,
      updatedAt: new Date()
    })
    .where(eq(items.id, itemId));

  refreshSurfaces(projectId);
  return { ok: true };
}

/**
 * Resume an item from an exception state back into the linear flow.
 * Doctrine choice: we don't try to be clever about *where* in the
 * linear flow it should re-enter — the staff knows. For v1 we resume
 * to `ordered` (start of the delivery chain) and let the user advance
 * from there. Override via `resumeTo` if a different state is meant.
 */
export async function resumeItemFromException(
  itemId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const resumeToRaw = (formData.get('resumeTo')?.toString() ?? 'ordered').trim();
  const VALID_RESUME = ['ordered', 'in_production', 'ready', 'shipped'] as const;
  type ResumeTarget = (typeof VALID_RESUME)[number];
  if (!VALID_RESUME.includes(resumeToRaw as ResumeTarget)) {
    return {
      ok: false,
      error: 'Invalid resume target state'
    };
  }
  const resumeTo = resumeToRaw as ResumeTarget;

  const note = formData.get('note')?.toString().trim() || null;

  const [existing] = await db
    .select({ status: items.status, notes: items.notes })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Item not found' };
  if (!EXCEPTION_VALUES.includes(existing.status as ExceptionStatus)) {
    return {
      ok: false,
      error: `Item is not in an exception state (currently ${existing.status}).`
    };
  }

  let combinedNotes = existing.notes;
  if (note) {
    const stamp = new Date().toISOString().slice(0, 10);
    const noteLine = `[${stamp}] resumed to ${resumeTo}: ${note}`;
    combinedNotes = existing.notes ? `${existing.notes}\n${noteLine}` : noteLine;
  }

  await db
    .update(items)
    .set({
      status: resumeTo,
      notes: combinedNotes,
      updatedAt: new Date()
    })
    .where(eq(items.id, itemId));

  refreshSurfaces(projectId);
  return { ok: true };
}
