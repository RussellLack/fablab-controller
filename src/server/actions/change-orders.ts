'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db, changeOrders, approvals, projects } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

/**
 * Change-control server actions (module #8 in `00-` §18).
 *
 * Lifecycle (see `changeOrderStatusEnum` in schema):
 *
 *   requested → under_review → priced → sent_for_approval → approved → implemented → closed
 *                                                       ↘ rejected
 *                                  any pre-implemented   ↘ withdrawn
 *
 * Doctrine: every change after Brief sign-off must be recorded,
 * priced, and approved BEFORE it's implemented in items/POs. The status
 * gate stops "we just did it" from becoming the audit trail.
 *
 * v1 scope: top-level cost/time impact on the change_orders row.
 * The `change_order_impacts` table (per-item / per-package delta rows)
 * is in the schema but not yet exposed in the UI — adding line-item
 * impacts later doesn't require a data migration.
 */

type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const REQUESTED_BY_VALUES = [
  'client',
  'designer',
  'vendor',
  'site_condition',
  'regulatory',
  'cost_pressure',
  'client_taste_change',
  'other'
] as const;
type RequestedBy = (typeof REQUESTED_BY_VALUES)[number];

const CURRENCY_VALUES = ['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'] as const;
type Currency = (typeof CURRENCY_VALUES)[number];

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Next change-order reference, e.g. CO-2026-001. Year-scoped sequence. */
async function nextChangeOrderReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM change_orders WHERE reference LIKE ${'CO-' + year + '-%'}`
  );
  return `CO-${year}-${String(row?.next ?? 1).padStart(3, '0')}`;
}

function bothRevalidations(projectId: string, coId?: string) {
  revalidatePath(`/projects/${projectId}/change-control`);
  if (coId) revalidatePath(`/projects/${projectId}/change-control/${coId}`);
  // The Today view picks up open COs — keep it fresh.
  revalidatePath(`/dashboard`);
}

/* ─────────────────────────── CREATE ─────────────────────────── */

/**
 * Create a change order in `requested` state. Wizard-shaped FormData;
 * all impact fields are optional at creation — they get filled in
 * during the under_review → priced transition via `updateChangeOrderPricing`.
 */
export async function createChangeOrder(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const title = (formData.get('title')?.toString() ?? '').trim();
  if (!title) {
    return {
      ok: false,
      error: 'Title is required',
      fieldErrors: { title: ['Title is required'] }
    };
  }
  if (title.length > 300) {
    return { ok: false, error: 'Title is too long (max 300 chars)' };
  }

  const description = formData.get('description')?.toString().trim() || null;
  const reason = formData.get('reason')?.toString().trim() || null;

  const requestedByRaw = (formData.get('requestedBy')?.toString() ?? 'client').trim();
  const requestedBy: RequestedBy = REQUESTED_BY_VALUES.includes(
    requestedByRaw as RequestedBy
  )
    ? (requestedByRaw as RequestedBy)
    : 'client';

  const requestedByExternal =
    formData.get('requestedByExternal')?.toString().trim() || null;

  const dateRequestedRaw = (formData.get('dateRequested')?.toString() ?? '').trim();
  const today = new Date().toISOString().slice(0, 10);
  const dateRequested = dateRequestedRaw || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRequested)) {
    return { ok: false, error: 'dateRequested must be YYYY-MM-DD' };
  }

  // Optional impact at-create time. If filled, status jumps straight
  // to `priced`; otherwise stays at `requested` and the user prices it
  // later via the detail page.
  const costRaw = (formData.get('costImpactAmount')?.toString() ?? '').trim();
  const costImpactAmount = costRaw ? Number(costRaw) : null;
  if (costRaw && (Number.isNaN(costImpactAmount) || costImpactAmount === null)) {
    return { ok: false, error: 'Cost impact must be a number' };
  }

  const costCurrencyRaw = (formData.get('costImpactCurrency')?.toString() ?? 'NOK').trim();
  const costImpactCurrency: Currency = CURRENCY_VALUES.includes(
    costCurrencyRaw as Currency
  )
    ? (costCurrencyRaw as Currency)
    : 'NOK';

  const timeRaw = (formData.get('timeImpactDays')?.toString() ?? '').trim();
  const timeImpactDays = timeRaw ? Math.trunc(Number(timeRaw)) : null;
  if (timeRaw && Number.isNaN(timeImpactDays)) {
    return { ok: false, error: 'Time impact must be a whole number of days' };
  }

  const affectsSupplier = formData.get('affectsSupplier') === 'on';
  const affectsFreightCustoms = formData.get('affectsFreightCustoms') === 'on';
  const affectsInstall = formData.get('affectsInstall') === 'on';

  const startStatus = costImpactAmount !== null ? 'priced' : 'requested';

  try {
    const reference = await nextChangeOrderReference();
    const [row] = await db
      .insert(changeOrders)
      .values({
        reference,
        projectId,
        title,
        description,
        reason,
        requestedBy,
        requestedByUserId: requestedBy === 'designer' ? userId : null,
        requestedByExternal,
        dateRequested,
        costImpactAmount:
          costImpactAmount !== null ? costImpactAmount.toString() : null,
        costImpactCurrency: costImpactAmount !== null ? costImpactCurrency : null,
        timeImpactDays,
        affectsSupplier,
        affectsFreightCustoms,
        affectsInstall,
        status: startStatus
      })
      .returning({ id: changeOrders.id });

    bothRevalidations(projectId, row?.id);
    return { ok: true, id: row?.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unknown error creating change order'
    };
  }
}

/* ─────────────────────────── PRICING ─────────────────────────── */

/**
 * Set / update the cost + time impact, optionally transitioning to
 * `priced` if the change order is currently `requested` or
 * `under_review`. Refuses on already-implemented / closed / withdrawn
 * COs (those need a new CO instead).
 */
export async function updateChangeOrderPricing(
  coId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({ status: changeOrders.status })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Change order not found' };

  const EDITABLE_STATES = ['requested', 'under_review', 'priced'];
  if (!EDITABLE_STATES.includes(existing.status)) {
    return {
      ok: false,
      error: `Cannot re-price a ${existing.status} change order. Create a follow-up CO instead.`
    };
  }

  const costRaw = (formData.get('costImpactAmount')?.toString() ?? '').trim();
  const costImpactAmount = costRaw ? Number(costRaw) : null;
  if (costRaw && (Number.isNaN(costImpactAmount) || costImpactAmount === null)) {
    return { ok: false, error: 'Cost impact must be a number' };
  }
  const costCurrencyRaw = (formData.get('costImpactCurrency')?.toString() ?? 'NOK').trim();
  const costImpactCurrency: Currency = CURRENCY_VALUES.includes(
    costCurrencyRaw as Currency
  )
    ? (costCurrencyRaw as Currency)
    : 'NOK';

  const timeRaw = (formData.get('timeImpactDays')?.toString() ?? '').trim();
  const timeImpactDays = timeRaw ? Math.trunc(Number(timeRaw)) : null;
  if (timeRaw && Number.isNaN(timeImpactDays)) {
    return { ok: false, error: 'Time impact must be a whole number' };
  }

  const affectsSupplier = formData.get('affectsSupplier') === 'on';
  const affectsFreightCustoms = formData.get('affectsFreightCustoms') === 'on';
  const affectsInstall = formData.get('affectsInstall') === 'on';

  await db
    .update(changeOrders)
    .set({
      costImpactAmount:
        costImpactAmount !== null ? costImpactAmount.toString() : null,
      costImpactCurrency: costImpactAmount !== null ? costImpactCurrency : null,
      timeImpactDays,
      affectsSupplier,
      affectsFreightCustoms,
      affectsInstall,
      status: costImpactAmount !== null ? 'priced' : existing.status,
      updatedAt: new Date()
    })
    .where(eq(changeOrders.id, coId));

  bothRevalidations(projectId, coId);
  return { ok: true };
}

/* ─────────────────────────── STATUS TRANSITIONS ─────────────────────────── */

/** requested → under_review (no other state changes; just a marker). */
export async function startChangeOrderReview(
  coId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({ status: changeOrders.status })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Change order not found' };
  if (existing.status !== 'requested') {
    return {
      ok: false,
      error: `Only requested change orders move to under_review. This one is ${existing.status}.`
    };
  }

  await db
    .update(changeOrders)
    .set({ status: 'under_review', updatedAt: new Date() })
    .where(eq(changeOrders.id, coId));
  bothRevalidations(projectId, coId);
  return { ok: true };
}

/**
 * priced → sent_for_approval. Creates a draft `approvals` row with
 * target = changeOrderId so the user can complete + send it from the
 * Approvals tab (which already handles email / channel / approver
 * details). Sets the CO's approvalId pointer so the detail page can
 * link straight to it.
 */
export async function sendChangeOrderForApproval(
  coId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [proj] = await db
    .select({ reference: projects.reference })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) return { ok: false, error: 'Project not found' };

  const [co] = await db
    .select({
      id: changeOrders.id,
      reference: changeOrders.reference,
      title: changeOrders.title,
      description: changeOrders.description,
      reason: changeOrders.reason,
      costImpactAmount: changeOrders.costImpactAmount,
      costImpactCurrency: changeOrders.costImpactCurrency,
      timeImpactDays: changeOrders.timeImpactDays,
      status: changeOrders.status,
      approvalId: changeOrders.approvalId
    })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!co) return { ok: false, error: 'Change order not found' };
  if (co.status !== 'priced') {
    return {
      ok: false,
      error: `Only priced change orders can be sent for approval. This one is ${co.status}. Add a cost impact first.`
    };
  }
  if (co.approvalId) {
    return {
      ok: false,
      error:
        'A draft approval has already been created for this change order — open Approvals to complete it.'
    };
  }

  // Mint a project-scoped approval reference. Same shape as
  // nextApprovalReference in approvals.ts (kept inline so we don't
  // export private helpers across action files).
  const seqSuffix = proj.reference.replace(/^FD-\d{4}-/, '');
  const [refRow] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM approvals WHERE reference LIKE ${'APPR-' + seqSuffix + '-%'}`
  );
  const approvalReference = `APPR-${seqSuffix}-${String(refRow?.next ?? 1).padStart(4, '0')}`;

  const subject = `Change order ${co.reference} — ${co.title}`;
  const impactLines: string[] = [];
  if (co.costImpactAmount !== null) {
    impactLines.push(`Cost impact: ${co.costImpactAmount} ${co.costImpactCurrency ?? 'NOK'}`);
  }
  if (co.timeImpactDays !== null) {
    impactLines.push(`Time impact: ${co.timeImpactDays} day(s)`);
  }
  if (co.reason) impactLines.push(`Reason: ${co.reason}`);
  if (co.description) impactLines.push('', co.description);
  const description = impactLines.join('\n');

  try {
    const [appr] = await db
      .insert(approvals)
      .values({
        reference: approvalReference,
        projectId,
        subject,
        description,
        status: 'draft',
        requestedBy: userId,
        changeOrderId: coId,
        price:
          co.costImpactAmount !== null ? co.costImpactAmount.toString() : null,
        priceCurrency: co.costImpactCurrency ?? null
      })
      .returning({ id: approvals.id });
    if (!appr) return { ok: false, error: 'Failed to create approval' };

    await db
      .update(changeOrders)
      .set({
        status: 'sent_for_approval',
        approvalId: appr.id,
        updatedAt: new Date()
      })
      .where(eq(changeOrders.id, coId));

    bothRevalidations(projectId, coId);
    revalidatePath(`/projects/${projectId}/approvals`);
    revalidatePath(`/projects/${projectId}/approvals/${appr.id}`);
    return { ok: true, id: appr.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unknown error sending change order for approval'
    };
  }
}

/**
 * sent_for_approval → approved | rejected. Manual click — the Approval
 * workflow has its own response-recording UI; this is the parallel
 * mirror on the change-order side so users can drive everything from
 * one place. `finalDecision` is required when rejecting (audit).
 */
export async function recordChangeOrderDecision(
  coId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const decisionRaw = (formData.get('decision')?.toString() ?? '').trim();
  if (decisionRaw !== 'approved' && decisionRaw !== 'rejected') {
    return { ok: false, error: 'Decision must be approved or rejected' };
  }
  const finalDecision = formData.get('finalDecision')?.toString().trim() || null;
  if (decisionRaw === 'rejected' && !finalDecision) {
    return {
      ok: false,
      error: 'Rejection reason is required for audit.'
    };
  }

  const [existing] = await db
    .select({ status: changeOrders.status })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Change order not found' };
  if (existing.status !== 'sent_for_approval') {
    return {
      ok: false,
      error: `Only sent-for-approval change orders can record a decision. This one is ${existing.status}.`
    };
  }

  await db
    .update(changeOrders)
    .set({
      status: decisionRaw as 'approved' | 'rejected',
      finalDecision,
      updatedAt: new Date()
    })
    .where(eq(changeOrders.id, coId));

  bothRevalidations(projectId, coId);
  return { ok: true };
}

/**
 * approved → implemented. Stamps `implementedAt` + `implementedBy`.
 * Doctrine: implementation is the moment the change becomes real in
 * the project's items / POs / scope. The action doesn't *cascade* —
 * implementation cascades (mutating linked items, POs, regenerating
 * scope) are out of scope for v1. The stamp is the audit; the
 * actual mutation is staff work on the items / POs / scope pages.
 */
export async function markChangeOrderImplemented(
  coId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({ status: changeOrders.status })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Change order not found' };
  if (existing.status !== 'approved') {
    return {
      ok: false,
      error: `Only approved change orders can be marked implemented. This one is ${existing.status}.`
    };
  }

  await db
    .update(changeOrders)
    .set({
      status: 'implemented',
      implementedAt: new Date(),
      implementedBy: userId,
      updatedAt: new Date()
    })
    .where(eq(changeOrders.id, coId));

  bothRevalidations(projectId, coId);
  return { ok: true };
}

/** implemented → closed. */
export async function closeChangeOrder(
  coId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({ status: changeOrders.status })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Change order not found' };
  if (existing.status !== 'implemented') {
    return {
      ok: false,
      error: `Only implemented change orders can be closed. This one is ${existing.status}.`
    };
  }

  await db
    .update(changeOrders)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(changeOrders.id, coId));
  bothRevalidations(projectId, coId);
  return { ok: true };
}

/**
 * Withdraw at any pre-implemented state. Used when the change is
 * dropped before it becomes binding work — equivalent to "this change
 * never happened" but the row is kept for the audit trail.
 */
export async function withdrawChangeOrder(
  coId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const reason = formData.get('reason')?.toString().trim() || null;
  if (!reason) {
    return {
      ok: false,
      error: 'A short reason for withdrawal is required for audit.'
    };
  }

  const [existing] = await db
    .select({ status: changeOrders.status })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Change order not found' };
  const TERMINAL = ['implemented', 'closed', 'withdrawn'];
  if (TERMINAL.includes(existing.status)) {
    return {
      ok: false,
      error: `Cannot withdraw a ${existing.status} change order.`
    };
  }

  await db
    .update(changeOrders)
    .set({
      status: 'withdrawn',
      finalDecision: reason,
      updatedAt: new Date()
    })
    .where(eq(changeOrders.id, coId));

  bothRevalidations(projectId, coId);
  return { ok: true };
}
