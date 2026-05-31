'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql, inArray } from 'drizzle-orm';
import {
  db, vendors, packages, items, rfqs, rfqItems, rfqVendors, quotes,
  purchaseOrders, purchaseOrderLines, projects, vendorCommunications
} from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import {
  newVendorSchema, newPackageSchema, newItemSchema,
  newRfqSchema, recordQuoteSchema, newPoSchema
} from '@/lib/validations/procurement';
import { canIssuePurchaseOrder } from './approvals';
import { applyBillingTrigger } from './finance';
import { getOrRefreshGoogleAccessToken } from '@/server/lib/google-tokens';
import { sendGmail } from '@/server/lib/gmail-send';

/** CC this address on every team-member email. Skipped if author IS this address. */
const SIV_EMAIL = 'siv@fablabdesign.com';

type ActionResult = { ok: true; id?: string; url?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function nextRef(prefix: string, table: 'rfq' | 'po' | 'appr', projectRef?: string): Promise<string> {
  const year = new Date().getFullYear();
  const seqSuffix = projectRef ? projectRef.replace(/^FD-\d{4}-/, '') : String(year);
  const pattern = `${prefix}-${seqSuffix}-%`;
  const tableMap = { rfq: 'rfqs', po: 'purchase_orders', appr: 'approvals' };
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM ${sql.raw(tableMap[table])} WHERE reference LIKE ${pattern}`
  );
  return `${prefix}-${seqSuffix}-${String(row?.next ?? 1).padStart(2, '0')}`;
}

/* ─────────────────────────── VENDOR ─────────────────────────── */

export async function createVendor(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newVendorSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const categories = parsed.data.categories
    ? parsed.data.categories.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const [row] = await db.insert(vendors).values({
    name: parsed.data.name,
    kind: parsed.data.kind,
    categories,
    country: parsed.data.country,
    contactName: parsed.data.contactName,
    contactEmail: parsed.data.contactEmail,
    contactPhone: parsed.data.contactPhone,
    address: parsed.data.address,
    typicalLeadTimeDays: parsed.data.typicalLeadTimeDays ?? null,
    paymentTerms: parsed.data.paymentTerms,
    defaultCurrency: parsed.data.defaultCurrency,
    isInternal: parsed.data.isInternal ?? false,
    notes: parsed.data.notes
  }).returning({ id: vendors.id });

  if (!row) return { ok: false, error: 'Insert failed' };
  revalidatePath('/vendors');
  redirect(`/vendors`);
}

/* ─────────────────────────── PACKAGE ─────────────────────────── */

export async function createPackage(projectId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newPackageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Sequence = max + 1 within project
  const [seq] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM packages WHERE project_id = ${projectId}`
  );

  const [row] = await db.insert(packages).values({
    projectId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    sequence: seq?.next ?? 1,
    status: 'draft',
    budget: parsed.data.budget?.toString()
  }).returning({ id: packages.id });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/packages`);
  return { ok: true, id: row?.id };
}

/* ─────────────────────────── ITEM ─────────────────────────── */

export async function createItem(projectId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Verify the package belongs to this project (security check)
  const [pkg] = await db.select({ id: packages.id })
    .from(packages)
    .where(and(eq(packages.id, parsed.data.packageId), eq(packages.projectId, projectId)))
    .limit(1);
  if (!pkg) return { ok: false, error: 'Package does not belong to this project' };

  const [row] = await db.insert(items).values({
    packageId: parsed.data.packageId,
    name: parsed.data.name,
    description: parsed.data.description,
    itemType: parsed.data.itemType,
    category: parsed.data.category,
    subcategory: parsed.data.subcategory,
    quantity: parsed.data.quantity.toString(),
    unit: parsed.data.unit,
    manufacturer: parsed.data.manufacturer,
    sku: parsed.data.sku,
    countryOfOrigin: parsed.data.countryOfOrigin,
    hsCode: parsed.data.hsCode,
    notes: parsed.data.notes,
    status: 'specified',
    costState: 'estimated'
  }).returning({ id: items.id });

  if (!row) return { ok: false, error: 'Insert failed' };
  revalidatePath(`/projects/${projectId}/packages`);
  redirect(`/projects/${projectId}/items/${row.id}`);
}

/* ─────────────────────────── RFQ ─────────────────────────── */

const DEFAULT_RFQ_DISCLAIMER = 'This is a Request for Quotation. It is for pricing and information purposes only and does not constitute an order or commitment to purchase. Goods or services must not be supplied or considered ordered until a Purchase Order is formally issued.';

export async function createRfq(
  projectId: string,
  projectRef: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newRfqSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Parse multi-value fields manually
  const selectedItemIds = formData.getAll('itemIds').map(String).filter(Boolean);
  const invitedVendorIds = formData.getAll('vendorIds').map(String).filter(Boolean);
  if (selectedItemIds.length === 0) return { ok: false, error: 'Select at least one item' };
  if (invitedVendorIds.length === 0) return { ok: false, error: 'Invite at least one vendor' };

  const reference = await nextRef('RFQ', 'rfq', projectRef);

  const [rfq] = await db.insert(rfqs).values({
    reference,
    projectId,
    packageId: parsed.data.packageId,
    title: parsed.data.title,
    description: parsed.data.description,
    status: 'draft',
    responseDeadline: parsed.data.responseDeadline.toISOString().slice(0, 10),
    disclaimerText: parsed.data.disclaimerText || DEFAULT_RFQ_DISCLAIMER,
    createdBy: userId
  }).returning({ id: rfqs.id });

  if (!rfq) return { ok: false, error: 'Insert failed' };

  // Join rows
  await db.insert(rfqItems).values(selectedItemIds.map(itemId => ({ rfqId: rfq.id, itemId })));
  await db.insert(rfqVendors).values(invitedVendorIds.map(vendorId => ({ rfqId: rfq.id, vendorId })));

  revalidatePath(`/projects/${projectId}/rfqs`);
  redirect(`/projects/${projectId}/rfqs/${rfq.id}`);
}

/**
 * Send an RFQ — creates `pending` Quote rows for every (item × vendor) combo,
 * stamps `sentAt`, logs a VendorCommunication per invited vendor with
 * stage = 'rfq' (R8 staging enforcement).
 */
export async function sendRfq(rfqId: string, projectId: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId)).limit(1);
  if (!rfq) return { ok: false, error: 'RFQ not found' };
  if (rfq.status !== 'draft') return { ok: false, error: 'Only draft RFQs can be sent' };

  const rfqItemRows = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId));
  const rfqVendorRows = await db.select().from(rfqVendors).where(eq(rfqVendors.rfqId, rfqId));

  // Create pending quotes for every (item × vendor) combination
  const quoteRows = rfqItemRows.flatMap(ri =>
    rfqVendorRows.map(rv => ({
      rfqId,
      itemId: ri.itemId,
      vendorId: rv.vendorId,
      status: 'pending' as const
    }))
  );
  if (quoteRows.length > 0) {
    await db.insert(quotes).values(quoteRows);
  }

  // Update RFQ status
  await db.update(rfqs).set({
    status: 'sent',
    sentAt: new Date(),
    updatedAt: new Date()
  }).where(eq(rfqs.id, rfqId));

  // Log a VendorCommunication per invited vendor — stage-labelled (R8 enforced)
  await db.insert(vendorCommunications).values(rfqVendorRows.map(rv => ({
    vendorId: rv.vendorId,
    projectId,
    rfqId,
    direction: 'outbound' as const,
    channel: 'email' as const,
    stage: 'rfq' as const,
    subject: `RFQ ${rfq.reference} — ${rfq.title}`,
    body: `${DEFAULT_RFQ_DISCLAIMER}\n\nRespond by ${rfq.responseDeadline ?? 'TBD'}.`,
    occurredAt: new Date(),
    recordedBy: userId
  })));

  revalidatePath(`/projects/${projectId}/rfqs/${rfqId}`);
  return { ok: true, id: rfqId };
}

/**
 * Wizard-friendly variant of createRfq — same insert logic but
 *   - does NOT redirect (lets the wizard close the drawer + navigate itself)
 *   - optionally chains sendRfq when `andSend === true`
 *   - returns the created rfqId so the caller can router.push to it
 */
export async function createRfqAtomic(
  projectId: string,
  projectRef: string,
  andSend: boolean,
  formData: FormData
): Promise<ActionResult & { rfqId?: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newRfqSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  const selectedItemIds = formData.getAll('itemIds').map(String).filter(Boolean);
  const invitedVendorIds = formData.getAll('vendorIds').map(String).filter(Boolean);
  if (selectedItemIds.length === 0) {
    return { ok: false, error: 'Select at least one item' };
  }
  if (invitedVendorIds.length === 0) {
    return { ok: false, error: 'Invite at least one vendor' };
  }

  const reference = await nextRef('RFQ', 'rfq', projectRef);

  const [rfq] = await db
    .insert(rfqs)
    .values({
      reference,
      projectId,
      packageId: parsed.data.packageId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: 'draft',
      responseDeadline: parsed.data.responseDeadline.toISOString().slice(0, 10),
      disclaimerText: parsed.data.disclaimerText || DEFAULT_RFQ_DISCLAIMER,
      createdBy: userId
    })
    .returning({ id: rfqs.id });

  if (!rfq) return { ok: false, error: 'Insert failed' };

  await db.insert(rfqItems).values(
    selectedItemIds.map((itemId) => ({ rfqId: rfq.id, itemId }))
  );
  await db.insert(rfqVendors).values(
    invitedVendorIds.map((vendorId) => ({ rfqId: rfq.id, vendorId }))
  );

  if (andSend) {
    const sendRes = await sendRfq(rfq.id, projectId);
    if (!sendRes.ok) {
      // RFQ exists as draft; surface the send error but don't roll back
      return { ok: false, error: sendRes.error, rfqId: rfq.id };
    }
  }

  revalidatePath(`/projects/${projectId}/rfqs`);
  return { ok: true, rfqId: rfq.id };
}

/**
 * Send an RFQ via Gmail under the current user's identity.
 *
 * Calls the existing `sendRfq` first (status → sent, pending Quote rows
 * created, VendorCommunication logged). Then iterates the invited
 * vendors, builds a per-vendor personalised email by substituting
 * placeholders in the stored body, and POSTs to Gmail.
 *
 * CC=siv@fablabdesign.com unless the sender IS Siv (case-insensitive
 * email compare). Per-vendor failures are reported but don't roll back
 * the status change — that's intentional: the audit trail of "we tried
 * to send" is more valuable than reverting to draft.
 *
 * Returns counts and a list of per-vendor errors for the caller to
 * surface in the UI.
 */
export async function sendRfqViaGmail(
  rfqId: string,
  projectId: string
): Promise<
  ActionResult & {
    sent?: number;
    failed?: number;
    errors?: { vendor: string; error: string }[];
  }
> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.id) return { ok: false, error: 'Not authenticated' };
  const senderEmail = user.email;
  if (!senderEmail) return { ok: false, error: 'No email on signed-in account' };
  const senderName =
    (user.user_metadata?.full_name as string | undefined) ?? senderEmail;

  // Need an access token to call Gmail. Returns null if the user hasn't
  // granted the scope (or if refresh failed) — surface a clear error.
  const accessToken = await getOrRefreshGoogleAccessToken(user.id);
  if (!accessToken) {
    return {
      ok: false,
      error:
        'No Google authorisation on file. Sign out and back in to grant the Gmail send permission, then try again.'
    };
  }

  // Run the existing status-transition + pending-quotes + comm-log path
  // first. If the RFQ is already sent we tolerate that and re-send emails.
  const transitionRes = await sendRfq(rfqId, projectId);
  const alreadySent = !transitionRes.ok && transitionRes.error === 'Only draft RFQs can be sent';
  if (!transitionRes.ok && !alreadySent) {
    return { ok: false, error: transitionRes.error };
  }

  const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId)).limit(1);
  if (!rfq) return { ok: false, error: 'RFQ not found' };

  const invited = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      contactName: vendors.contactName,
      contactEmail: vendors.contactEmail
    })
    .from(rfqVendors)
    .innerJoin(vendors, eq(rfqVendors.vendorId, vendors.id))
    .where(eq(rfqVendors.rfqId, rfqId));

  // CC=Siv unless sender IS Siv (case-insensitive)
  const cc = senderEmail.toLowerCase() === SIV_EMAIL ? undefined : SIV_EMAIL;

  const subject = `${rfq.reference} — ${rfq.title} (REQUEST FOR QUOTATION — NOT AN ORDER)`;
  const bodyTemplate = rfq.description ?? '';

  let sent = 0;
  let failed = 0;
  const errors: { vendor: string; error: string }[] = [];

  for (const v of invited) {
    if (!v.contactEmail) {
      failed++;
      errors.push({ vendor: v.name, error: 'No contact email on vendor record' });
      continue;
    }

    const body = bodyTemplate
      .replace(/\[supplier contact name\]/g, v.contactName ?? v.name)
      .replace(/\[your name\]/g, senderName)
      .replace(/\[your email\]/g, senderEmail)
      .replace(/\[your role\]/g, ''); // role not in our user metadata yet

    const result = await sendGmail({
      accessToken,
      from: senderEmail,
      fromName: senderName,
      to: v.contactEmail,
      cc,
      subject,
      body
    });

    if (result.ok) {
      sent++;
    } else {
      failed++;
      errors.push({ vendor: v.name, error: result.error });
    }
  }

  revalidatePath(`/projects/${projectId}/rfqs/${rfqId}`);
  if (failed > 0) {
    return {
      ok: false,
      error: `${failed} vendor email(s) failed; see details.`,
      sent,
      failed,
      errors
    };
  }
  return {
    ok: true,
    sent,
    failed,
    errors: undefined
  };
}

/* ─────────────────────────── QUOTE ─────────────────────────── */

/** Record a vendor's response — fills a `pending` Quote with prices/terms. */
export async function recordQuote(
  projectId: string,
  rfqId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = recordQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Compute line total (vendor totals occasionally diverge from unit×qty due to discounts,
  // but the form doesn't expose that nuance — use quoted_quantity × unit_cost as default).
  const qty = parsed.data.quotedQuantity ?? 1;
  const lineTotal = parsed.data.unitCost * qty;

  await db.update(quotes).set({
    status: 'received',
    unitCost: parsed.data.unitCost.toString(),
    quotedQuantity: qty.toString(),
    lineTotal: lineTotal.toString(),
    currency: parsed.data.currency,
    fxRateToProject: parsed.data.fxRateToProject?.toString(),
    leadTimeDays: parsed.data.leadTimeDays ?? null,
    validUntil: parsed.data.validUntil?.toISOString().slice(0, 10) ?? null,
    includesShipping: parsed.data.includesShipping ?? false,
    includesInstall: parsed.data.includesInstall ?? false,
    paymentTerms: parsed.data.paymentTerms,
    notes: parsed.data.notes,
    receivedAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date()
  }).where(eq(quotes.id, parsed.data.quoteId));

  // If all vendors have responded for this RFQ, advance status to responses_received
  const [counts] = await db.execute<{ pending: number; total: number }>(
    sql`SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*)::int AS total
      FROM quotes WHERE rfq_id = ${rfqId}`
  );
  if (counts && counts.pending === 0) {
    await db.update(rfqs).set({ status: 'responses_received', updatedAt: new Date() }).where(eq(rfqs.id, rfqId));
  }

  revalidatePath(`/projects/${projectId}/rfqs/${rfqId}`);
  return { ok: true };
}

/** Select a winning quote for an item. Other quotes for the same item move to `lost`. */
export async function selectWinningQuote(
  projectId: string,
  rfqId: string,
  itemId: string,
  quoteId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  // 1. Demote any existing winner on this item
  await db.update(quotes)
    .set({ status: 'lost', updatedAt: new Date() })
    .where(and(eq(quotes.itemId, itemId), eq(quotes.status, 'winning')));

  // 2. All other received quotes for this item → lost
  await db.update(quotes)
    .set({ status: 'lost', updatedAt: new Date() })
    .where(and(eq(quotes.itemId, itemId), eq(quotes.status, 'received')));

  // 3. The selected one → winning
  await db.update(quotes)
    .set({ status: 'winning', updatedAt: new Date() })
    .where(eq(quotes.id, quoteId));

  // 4. Item.winningQuoteId + status advances from specified → quoted
  await db.update(items).set({
    winningQuoteId: quoteId,
    status: 'quoted',
    costState: 'quoted',
    updatedAt: new Date()
  }).where(eq(items.id, itemId));

  revalidatePath(`/projects/${projectId}/rfqs/${rfqId}`);
  revalidatePath(`/projects/${projectId}/items/${itemId}`);
  return { ok: true };
}

/* ─────────────────────────── PURCHASE ORDER ─────────────────────────── */

/**
 * Create a PO draft from this project's winning quotes for the given vendor.
 * Pulls every Item with a `winning` Quote pointing at this vendor + not yet on
 * a non-cancelled PO. PO starts as `draft`. The user reviews + issues from detail.
 */
export async function createPoDraft(
  projectId: string,
  projectRef: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newPoSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Find items where:
  //   - their winning_quote_id points at a Quote with this vendor
  //   - they're not yet on a non-cancelled PO line
  const candidates = await db.execute<{
    item_id: string; quote_id: string; unit_cost: string; quoted_quantity: string;
  }>(
    sql`SELECT i.id AS item_id, q.id AS quote_id, q.unit_cost, q.quoted_quantity
        FROM items i
        JOIN packages p ON p.id = i.package_id
        JOIN quotes q ON q.id = i.winning_quote_id
        WHERE p.project_id = ${projectId}
          AND q.vendor_id = ${parsed.data.vendorId}
          AND NOT EXISTS (
            SELECT 1 FROM purchase_order_lines pol
            JOIN purchase_orders po ON po.id = pol.purchase_order_id
            WHERE pol.item_id = i.id AND po.status != 'cancelled'
          )`
  );

  if (candidates.length === 0) {
    return { ok: false, error: 'No items with a winning quote against this vendor are available' };
  }

  const subtotal = candidates.reduce((sum, c) =>
    sum + parseFloat(c.unit_cost) * parseFloat(c.quoted_quantity ?? '1'), 0);
  const vatRate = 0.25;                                      // Norway standard
  const vatAmount = subtotal * vatRate;
  const totalGross = subtotal + vatAmount;
  const reference = await nextRef('PO', 'po', projectRef);

  // Default delivery address from project.site_address
  const [project] = await db.select({ siteAddress: projects.siteAddress })
    .from(projects).where(eq(projects.id, projectId)).limit(1);

  const [po] = await db.insert(purchaseOrders).values({
    reference,
    projectId,
    vendorId: parsed.data.vendorId,
    status: 'draft',
    currency: parsed.data.currency,
    subtotalNet: subtotal.toFixed(2),
    vatAmount: vatAmount.toFixed(2),
    totalGross: totalGross.toFixed(2),
    deliveryAddress: parsed.data.deliveryAddress || project?.siteAddress,
    deliveryDeadline: parsed.data.deliveryDeadline?.toISOString().slice(0, 10),
    deliveryInstructions: parsed.data.deliveryInstructions,
    freightTerms: parsed.data.freightTerms,
    freightResponsibleParty: parsed.data.freightResponsibleParty,
    customsRequirements: parsed.data.customsRequirements,
    approvalReferenceId: parsed.data.approvalReferenceId,
    notes: parsed.data.notes,
    terms: parsed.data.terms
  }).returning({ id: purchaseOrders.id });

  if (!po) return { ok: false, error: 'Insert failed' };

  // PO lines from candidates
  await db.insert(purchaseOrderLines).values(candidates.map(c => ({
    purchaseOrderId: po.id,
    itemId: c.item_id,
    quantity: c.quoted_quantity ?? '1',
    unitCost: c.unit_cost,
    lineTotal: (parseFloat(c.unit_cost) * parseFloat(c.quoted_quantity ?? '1')).toFixed(2)
  })));

  revalidatePath(`/projects/${projectId}/pos`);
  redirect(`/projects/${projectId}/pos/${po.id}`);
}

/**
 * Issue a PO — calls the canIssuePurchaseOrder gate from approvals.ts.
 * Refuses if R3 is violated. On success: PO → `issued`, all Items advance
 * to `ordered`, VendorCommunication logged with stage='po_issued'.
 */
export async function issuePurchaseOrder(poId: string, projectId: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  // THE GATE — Rule R3
  const blocker = await canIssuePurchaseOrder(poId);
  if (blocker) {
    return {
      ok: false,
      error: blocker.reason,
      fieldErrors: {
        missingItemIds: blocker.missingItemIds,
        needsAuthorisingApproval: blocker.needsAuthorisingApproval ? ['true'] : []
      }
    };
  }

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) return { ok: false, error: 'PO not found' };
  if (po.status !== 'draft' && po.status !== 'ready_for_review') {
    return { ok: false, error: `Cannot issue PO from status ${po.status}` };
  }

  // Update PO
  await db.update(purchaseOrders).set({
    status: 'issued',
    issuedAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date()
  }).where(eq(purchaseOrders.id, poId));

  // Cascade: items on this PO move from 'quoted' to 'ordered'
  const lines = await db.select({ itemId: purchaseOrderLines.itemId })
    .from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, poId));
  if (lines.length > 0) {
    await db.update(items).set({
      status: 'ordered',
      costState: 'committed',
      orderedAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date()
    }).where(inArray(items.id, lines.map(l => l.itemId)));
  }

  // VendorCommunication — stage = po_issued (binding stage label per R8)
  await db.insert(vendorCommunications).values({
    vendorId: po.vendorId,
    projectId,
    purchaseOrderId: poId,
    direction: 'outbound',
    channel: 'email',
    stage: 'po_issued',
    subject: `PURCHASE ORDER ${po.reference} — BINDING`,
    body: `This is a binding Purchase Order. Goods/services to be supplied as specified.`,
    occurredAt: new Date(),
    recordedBy: userId
  });

  // Fire BillingTrigger events — invoice recommendations surface in the Billing pipeline
  await applyBillingTrigger(projectId, 'po_issued', { poId });
  await applyBillingTrigger(projectId, 'supplier_deposit_required', { poId });

  revalidatePath(`/projects/${projectId}/pos/${poId}`);
  revalidatePath(`/projects/${projectId}/pos`);
  revalidatePath(`/projects/${projectId}/finance`);
  return { ok: true, id: poId };
}
