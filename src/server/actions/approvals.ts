'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import {
  db, approvals, items, scopeBaselineVersions, quotes, purchaseOrders
} from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import { newApprovalSchema, responseSchema, type ApprovalTargetType } from '@/lib/validations/approval';

type ActionResult = { ok: true; id?: string; url?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function nextApprovalReference(projectRef: string): Promise<string> {
  const seqSuffix = projectRef.replace(/^FD-\d{4}-/, ''); // "0142"
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM approvals WHERE reference LIKE ${'APPR-' + seqSuffix + '-%'}`
  );
  return `APPR-${seqSuffix}-${String(row?.next ?? 1).padStart(4, '0')}`;
}

/**
 * Create an Approval — server-side enforcement of the polymorphic constraint.
 * Status starts as `draft`. Use sendApproval() to dispatch to the client.
 */
export async function createApproval(
  projectId: string,
  projectRef: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newApprovalSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Map the polymorphic target type → the right FK column
  const fkColumn = (() => {
    switch (parsed.data.targetType) {
      case 'scope_baseline_version': return { scopeBaselineVersionId: parsed.data.targetId };
      case 'item':                    return { itemId: parsed.data.targetId };
      case 'quote':                   return { quoteId: parsed.data.targetId };
      case 'purchase_order':          return { purchaseOrderId: parsed.data.targetId };
      case 'change_order':            return { changeOrderId: parsed.data.targetId };
      case 'budget_baseline':         return { budgetBaselineId: parsed.data.targetId };
    }
  })();

  const reference = await nextApprovalReference(projectRef);

  try {
    const [row] = await db.insert(approvals).values({
      reference,
      projectId,
      subject: parsed.data.subject,
      description: parsed.data.description,
      version: parsed.data.version,
      price: parsed.data.price?.toString(),
      priceCurrency: parsed.data.priceCurrency,
      freightAssumptions: parsed.data.freightAssumptions,
      customsAssumptions: parsed.data.customsAssumptions,
      leadTimeDays: parsed.data.leadTimeDays,
      supplierName: parsed.data.supplierName,
      approvalConsequence: parsed.data.approvalConsequence,
      approverName: parsed.data.approverName,
      approverEmail: parsed.data.approverEmail,
      approvalChannel: parsed.data.approvalChannel,
      validUntil: parsed.data.validUntil?.toISOString().slice(0, 10) ?? null,
      status: 'draft',
      requestedBy: userId,
      ...fkColumn
    }).returning({ id: approvals.id });

    if (!row) return { ok: false, error: 'Insert failed' };

    revalidatePath(`/projects/${projectId}/approvals`);
    redirect(`/projects/${projectId}/approvals/${row.id}`);
  } catch (e) {
    // The DB check constraint will fire if more than one target FK is set somehow
    return { ok: false, error: (e as Error).message };
  }
}

/** Send a draft Approval — moves status to `sent_for_approval` and stamps `sent_at`. */
export async function sendApproval(approvalId: string, projectId: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [appr] = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
  if (!appr) return { ok: false, error: 'Approval not found' };
  if (appr.status !== 'draft') return { ok: false, error: 'Only draft approvals can be sent' };

  await db.update(approvals).set({
    status: 'sent_for_approval',
    sentAt: new Date(),
    updatedAt: new Date()
  }).where(eq(approvals.id, approvalId));

  // In a real build this is where the email/portal notification fires.
  revalidatePath(`/projects/${projectId}/approvals/${approvalId}`);
  revalidatePath(`/projects/${projectId}/approvals`);
  return { ok: true, id: approvalId };
}

/** Log the client's response — closes the loop. */
export async function recordApprovalResponse(
  approvalId: string,
  projectId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const [appr] = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
  if (!appr) return { ok: false, error: 'Approval not found' };
  if (appr.status !== 'sent_for_approval') {
    return { ok: false, error: 'Only sent-for-approval items can record a response' };
  }

  const newStatus = parsed.data.decision === 'approved' ? 'approved'
    : parsed.data.decision === 'approved_with_conditions' ? 'approved_with_conditions'
    : 'rejected';

  await db.update(approvals).set({
    status: newStatus,
    conditions: parsed.data.conditions ?? null,
    approvalChannel: parsed.data.approvalChannel,
    respondedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(approvals.id, approvalId));

  // Side effect: if the approval targeted a ScopeBaselineVersion and was approved,
  // promote that version's status to `approved` (Wave 1 closes the scope-gate loop).
  if (appr.scopeBaselineVersionId && newStatus === 'approved') {
    await db.update(scopeBaselineVersions)
      .set({ status: 'approved', approvedAt: new Date(), approvalId })
      .where(eq(scopeBaselineVersions.id, appr.scopeBaselineVersionId));
    revalidatePath(`/projects/${projectId}`);
  }

  revalidatePath(`/projects/${projectId}/approvals/${approvalId}`);
  revalidatePath(`/projects/${projectId}/approvals`);
  return { ok: true, id: approvalId };
}

/**
 * The PO issuance gate — Rule R3.
 *
 * Returns null if the PO can be issued, or a structured reason if not.
 * Server actions handling PO `draft → issued` must call this and refuse
 * the transition if it returns non-null.
 *
 * Conditions for issuance:
 *   1. Every Item on the PO has an `approved` or `approved_with_conditions`
 *      Approval row against it (unless legacy_no_approval is true on the PO)
 *   2. The PO itself has an authorising Approval (approval_reference_id set)
 *      OR is exempted via legacy_no_approval
 */
export async function canIssuePurchaseOrder(
  poId: string
): Promise<null | { reason: string; missingItemIds: string[]; needsAuthorisingApproval: boolean }> {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) return { reason: 'PO not found', missingItemIds: [], needsAuthorisingApproval: false };
  if (po.legacyNoApproval) return null; // grandfathered

  // Items on this PO (via purchase_order_lines)
  const lines = await db.execute<{ item_id: string }>(
    sql`SELECT item_id FROM purchase_order_lines WHERE purchase_order_id = ${poId}`
  );
  const itemIds = lines.map(l => l.item_id);
  if (itemIds.length === 0) {
    return { reason: 'PO has no line items', missingItemIds: [], needsAuthorisingApproval: !po.approvalReferenceId };
  }

  // Items missing an approved Approval
  const missing = await db.execute<{ id: string }>(
    sql`SELECT i.id FROM items i
        WHERE i.id = ANY(${sql.raw(`ARRAY['${itemIds.join(`','`)}']::uuid[]`)})
        AND NOT EXISTS (
          SELECT 1 FROM approvals a
          WHERE a.item_id = i.id
            AND a.status IN ('approved', 'approved_with_conditions')
        )`
  );

  const needsAuthorisingApproval = !po.approvalReferenceId;
  const missingItemIds = missing.map(m => m.id);

  if (missingItemIds.length === 0 && !needsAuthorisingApproval) return null;

  return {
    reason: missingItemIds.length > 0
      ? `${missingItemIds.length} item(s) lack a client-approved Approval (R3)`
      : 'PO has no authorising Approval reference (R3)',
    missingItemIds,
    needsAuthorisingApproval
  };
}

/** Convenience: derive an item's approval state for UI display. */
export async function getItemApprovalState(itemId: string): Promise<'approved' | 'pending' | 'rejected' | 'none'> {
  const [row] = await db.select({ status: approvals.status })
    .from(approvals)
    .where(and(
      eq(approvals.itemId, itemId),
      sql`${approvals.status} IN ('approved', 'approved_with_conditions', 'sent_for_approval', 'rejected')`
    ))
    .orderBy(sql`CASE
      WHEN ${approvals.status} = 'approved' THEN 1
      WHEN ${approvals.status} = 'approved_with_conditions' THEN 2
      WHEN ${approvals.status} = 'sent_for_approval' THEN 3
      WHEN ${approvals.status} = 'rejected' THEN 4
      ELSE 5 END`)
    .limit(1);

  if (!row) return 'none';
  if (row.status === 'approved' || row.status === 'approved_with_conditions') return 'approved';
  if (row.status === 'sent_for_approval') return 'pending';
  return 'rejected';
}
