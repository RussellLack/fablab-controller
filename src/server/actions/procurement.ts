'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql, inArray } from 'drizzle-orm';
import {
  db, vendors, packages, items, rfqs, rfqItems, rfqVendors, quotes,
  purchaseOrders, purchaseOrderLines, projects, vendorCommunications,
  rfqAttachments, poAttachments
} from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import {
  newVendorSchema, newPackageSchema, newItemSchema,
  newRfqSchema, recordQuoteSchema, newPoSchema
} from '@/lib/validations/procurement';
import { canIssuePurchaseOrder } from './approvals';
import { applyBillingTrigger } from './finance';
import { getOrRefreshGoogleAccessToken } from '@/server/lib/google-tokens';
import { sendGmail, type GmailAttachment } from '@/server/lib/gmail-send';
import { buildPoBodyTemplate } from '@/lib/po-body-template';
import { formatMoney } from '@/lib/utils';

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
  projectId: string,
  /** Optional vendor filter — when provided, only those vendor ids are emailed. Used for retry-failed-only. */
  vendorIdFilter?: string[]
): Promise<
  ActionResult & {
    sent?: number;
    failed?: number;
    errors?: { vendorId: string; vendor: string; error: string }[];
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

  const invitedAll = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      contactName: vendors.contactName,
      contactEmail: vendors.contactEmail
    })
    .from(rfqVendors)
    .innerJoin(vendors, eq(rfqVendors.vendorId, vendors.id))
    .where(eq(rfqVendors.rfqId, rfqId));

  // Apply optional retry-failed-only filter
  const invited = vendorIdFilter
    ? invitedAll.filter((v) => vendorIdFilter.includes(v.id))
    : invitedAll;

  if (invited.length === 0) {
    return { ok: false, error: 'No vendors to send to', sent: 0, failed: 0 };
  }

  // CC=Siv unless sender IS Siv (case-insensitive)
  const cc = senderEmail.toLowerCase() === SIV_EMAIL ? undefined : SIV_EMAIL;

  const subject = `${rfq.reference} — ${rfq.title} (REQUEST FOR QUOTATION — NOT AN ORDER)`;
  const bodyTemplate = rfq.description ?? '';

  // Fetch attachments from Supabase Storage once — same set goes to every vendor.
  // Use the supabase client already obtained for auth.
  const attachmentRows = await db
    .select()
    .from(rfqAttachments)
    .where(eq(rfqAttachments.rfqId, rfqId));
  const attachments: GmailAttachment[] = [];
  for (const att of attachmentRows) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('rfq-attachments')
      .download(att.storagePath);
    if (dlErr || !blob) continue;          // skip silently — surfaced as missing in email
    const buf = Buffer.from(await blob.arrayBuffer());
    attachments.push({
      filename: att.filename,
      mimeType: att.mimeType,
      content: buf
    });
  }

  let sent = 0;
  let failed = 0;
  const errors: { vendorId: string; vendor: string; error: string }[] = [];

  for (const v of invited) {
    if (!v.contactEmail) {
      failed++;
      errors.push({ vendorId: v.id, vendor: v.name, error: 'No contact email on vendor record' });
      continue;
    }

    const body = bodyTemplate
      .replace(/\[supplier contact name\]/g, v.contactName ?? v.name)
      .replace(/\[your name\]/g, senderName)
      .replace(/\[your email\]/g, senderEmail)
      // Safety net for legacy RFQ drafts whose `rfqs.description` was
      // generated when the template still emitted [your role]. New
      // drafts no longer contain the placeholder; this strips it from
      // any historic body so the signature renders cleanly.
      .replace(/\[your role\]\n?/g, '');

    const result = await sendGmail({
      accessToken,
      from: senderEmail,
      fromName: senderName,
      to: v.contactEmail,
      cc,
      bcc: senderEmail, // bcc the sender for their own records
      subject,
      body,
      attachments: attachments.length > 0 ? attachments : undefined
    });

    if (result.ok) {
      sent++;
    } else {
      failed++;
      errors.push({ vendorId: v.id, vendor: v.name, error: result.error });
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
 * Wizard-friendly variant of createPoDraft.
 *
 * Same insert logic but returns the new poId in the result instead of
 * redirecting, so the PO wizard can close its drawer and navigate
 * client-side. Always creates a DRAFT — issuing (which is BINDING per R3)
 * is still a separate action on the PO detail page behind canIssuePurchaseOrder.
 */
export async function createPoDraftAtomic(
  projectId: string,
  projectRef: string,
  formData: FormData
): Promise<ActionResult & { poId?: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newPoSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

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
  const vatRate = 0.25;
  const vatAmount = subtotal * vatRate;
  const totalGross = subtotal + vatAmount;
  const reference = await nextRef('PO', 'po', projectRef);

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

  await db.insert(purchaseOrderLines).values(candidates.map(c => ({
    purchaseOrderId: po.id,
    itemId: c.item_id,
    quantity: c.quoted_quantity ?? '1',
    unitCost: c.unit_cost,
    lineTotal: (parseFloat(c.unit_cost) * parseFloat(c.quoted_quantity ?? '1')).toFixed(2)
  })));

  revalidatePath(`/projects/${projectId}/pos`);
  return { ok: true, poId: po.id };
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

/**
 * Issue a PO AND email it to the vendor via Gmail.
 *
 * Chains:
 *   1. issuePurchaseOrder — enforces R3 gate, transitions status to
 *      `issued` (BINDING), advances items to `ordered`, logs
 *      VendorCommunication, fires billing triggers.
 *   2. If the issue succeeded, fetches the vendor + project + lines +
 *      attachments, builds the PO body from the §2 specimen template,
 *      and sends one multipart/mixed email to the vendor's contact
 *      email.
 *
 * If the issue itself fails (R3 violation, wrong status, etc.), no
 * email goes. If the issue succeeds but the email fails (vendor lacks
 * an email, Gmail API error, no Google authorisation), the PO STAYS
 * issued — the binding event has happened; the email is just the
 * messenger. Email failure is surfaced for the user to resend manually.
 */
export async function issuePurchaseOrderAndSend(
  poId: string,
  projectId: string
): Promise<
  ActionResult & {
    issued?: boolean;
    emailSent?: boolean;
    emailError?: string;
  }
> {
  // Step 1: issue (R3 gate inside)
  const issueRes = await issuePurchaseOrder(poId, projectId);
  if (!issueRes.ok) {
    return { ok: false, error: issueRes.error, issued: false };
  }

  // Step 2: email the issued PO to the vendor.
  const emailRes = await sendIssuedPoEmail(poId, projectId);
  if (emailRes.ok) {
    return { ok: true, issued: true, emailSent: true };
  }
  return {
    ok: false,
    error: 'PO issued, but email could not be sent.',
    issued: true,
    emailSent: false,
    emailError: emailRes.emailError
  };
}

/**
 * Resend the BINDING PO email to the vendor (same body, same attachments).
 *
 * Use case: the original issue-and-send succeeded at the binding moment
 * but the Gmail delivery failed (vendor email typo since corrected,
 * Gmail transient error, no Google authorisation at the time). The PO
 * is already legally issued — this just re-attempts the delivery so
 * the audit trail shows the vendor was successfully notified.
 *
 * Refuses on draft/ready_for_review POs: those should go through the
 * normal Issue-and-email path so the binding event itself is recorded.
 */
export async function resendPurchaseOrderEmail(
  poId: string,
  projectId: string
): Promise<
  ActionResult & { emailSent?: boolean; emailError?: string }
> {
  const [po] = await db
    .select({ status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId))
    .limit(1);
  if (!po) return { ok: false, error: 'PO not found' };
  if (po.status !== 'issued') {
    return {
      ok: false,
      error:
        'Only issued POs can be re-emailed. For a draft, use Issue and email vendor.'
    };
  }

  const res = await sendIssuedPoEmail(poId, projectId);
  if (res.ok) {
    return { ok: true, emailSent: true };
  }
  return {
    ok: false,
    error: 'Email failed to send.',
    emailSent: false,
    emailError: res.emailError
  };
}

/* ────────────────────── PO confirmation tracking ────────────────────── */

const PO_CONFIRMATION_CHANNELS = [
  'email',
  'portal',
  'phone',
  'in_person',
  'letter',
  'other'
] as const;
type PoConfirmationChannel = (typeof PO_CONFIRMATION_CHANNELS)[number];

/**
 * Record that the vendor has confirmed acceptance of the BINDING PO.
 *
 * Per the PO body template (§20- §2 specimen), the supplier is asked
 * to confirm in writing within 5 business days of receipt. This action
 * captures that confirmation — moves the PO from `issued` to
 * `confirmed`, stamps `confirmedAt`, and logs the inbound communication
 * to `vendorCommunications` with stage = `po_confirmation` so the
 * audit trail records *how* the confirmation arrived (email reply,
 * signed PDF, phone callback, etc.).
 *
 * Only the BINDING-state PO can be confirmed. Draft / ready-for-review
 * POs need to go through Issue first; cancelled / fulfilled POs are
 * past the confirmation window.
 */
export async function recordPoConfirmation(
  poId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      vendorId: purchaseOrders.vendorId,
      reference: purchaseOrders.reference
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId))
    .limit(1);
  if (!po) return { ok: false, error: 'PO not found' };
  if (po.status !== 'issued') {
    return {
      ok: false,
      error: `Only an issued PO can be confirmed. This one is ${po.status}.`
    };
  }

  // Parse + validate the form.
  const dateRaw = (formData.get('confirmedAt')?.toString() ?? '').trim();
  const channelRaw = (formData.get('channel')?.toString() ?? 'email').trim();
  const notes = formData.get('notes')?.toString().trim() || null;

  const today = new Date().toISOString().slice(0, 10);
  const confirmedAt = dateRaw || today;
  // YYYY-MM-DD regex
  if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedAt)) {
    return { ok: false, error: 'Confirmation date must be YYYY-MM-DD' };
  }
  if (confirmedAt > today) {
    return {
      ok: false,
      error: 'Confirmation date cannot be in the future.'
    };
  }
  const channel: PoConfirmationChannel = PO_CONFIRMATION_CHANNELS.includes(
    channelRaw as PoConfirmationChannel
  )
    ? (channelRaw as PoConfirmationChannel)
    : 'email';

  try {
    await db
      .update(purchaseOrders)
      .set({
        status: 'confirmed',
        confirmedAt,
        updatedAt: new Date()
      })
      .where(eq(purchaseOrders.id, poId));

    await db.insert(vendorCommunications).values({
      vendorId: po.vendorId,
      projectId,
      purchaseOrderId: poId,
      direction: 'inbound',
      channel,
      stage: 'po_confirmation',
      subject: `PO ${po.reference} — vendor confirmation`,
      body:
        notes ??
        `Vendor confirmed acceptance of PO ${po.reference} via ${channel}.`,
      // occurredAt = the date the vendor confirmed. Default to midnight UTC
      // of the confirmation date so the timeline orders correctly.
      occurredAt: new Date(`${confirmedAt}T00:00:00Z`),
      recordedBy: userId
    });

    revalidatePath(`/projects/${projectId}/pos/${poId}`);
    revalidatePath(`/dashboard`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unknown error recording confirmation'
    };
  }
}

/**
 * Undo a confirmation logged in error — moves the PO back to `issued`,
 * clears `confirmedAt`. Does NOT delete the `vendorCommunications`
 * audit row: the record of "we previously believed this was confirmed"
 * stays, and the user can log a corrected inbound row separately.
 */
export async function clearPoConfirmation(
  poId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [po] = await db
    .select({ status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId))
    .limit(1);
  if (!po) return { ok: false, error: 'PO not found' };
  if (po.status !== 'confirmed') {
    return {
      ok: false,
      error: `Only a confirmed PO can have its confirmation undone. This one is ${po.status}.`
    };
  }

  try {
    await db
      .update(purchaseOrders)
      .set({
        status: 'issued',
        confirmedAt: null,
        updatedAt: new Date()
      })
      .where(eq(purchaseOrders.id, poId));
    revalidatePath(`/projects/${projectId}/pos/${poId}`);
    revalidatePath(`/dashboard`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unknown error clearing confirmation'
    };
  }
}

/**
 * Internal: build + send the BINDING PO email for an already-issued PO.
 * Shared by `issuePurchaseOrderAndSend` (called immediately after the
 * status transition) and `resendPurchaseOrderEmail` (called later from
 * the PO detail page if the initial send failed or needs re-delivery).
 *
 * Does NOT change PO status, does NOT do the R3 gate — those are the
 * caller's responsibility. This function is *only* the email step.
 */
async function sendIssuedPoEmail(
  poId: string,
  projectId: string
): Promise<{ ok: true; emailSent: true } | { ok: false; emailSent: false; emailError: string }> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return {
      ok: false,
      emailSent: false,
      emailError: 'No sender email on signed-in account.'
    };
  }
  const senderEmail = user.email;
  const senderName =
    (user.user_metadata?.full_name as string | undefined) ?? senderEmail;

  const accessToken = await getOrRefreshGoogleAccessToken(user.id);
  if (!accessToken) {
    return {
      ok: false,
      emailSent: false,
      emailError:
        'No Google authorisation on file. Sign out and back in to re-authorise, then try again.'
    };
  }

  // Fetch the PO + vendor + project + lines + attachments
  const [poRow] = await db
    .select({
      po: purchaseOrders,
      vendorName: vendors.name,
      vendorContactName: vendors.contactName,
      vendorContactEmail: vendors.contactEmail,
      projectTitle: projects.title,
      projectReference: projects.reference,
      projectVatRate: projects.vatRate
    })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .leftJoin(projects, eq(purchaseOrders.projectId, projects.id))
    .where(eq(purchaseOrders.id, poId))
    .limit(1);
  if (!poRow) {
    return { ok: false, emailSent: false, emailError: 'PO not found' };
  }
  const po = poRow.po;

  if (!poRow.vendorContactEmail) {
    return {
      ok: false,
      emailSent: false,
      emailError: `Vendor "${poRow.vendorName ?? '—'}" has no contact email — email not sent.`
    };
  }

  const lineRows = await db
    .select({
      itemName: items.name,
      description: items.description,
      manufacturer: items.manufacturer,
      sku: items.sku,
      unit: items.unit,
      quantity: purchaseOrderLines.quantity,
      unitCost: purchaseOrderLines.unitCost,
      lineTotal: purchaseOrderLines.lineTotal
    })
    .from(purchaseOrderLines)
    .innerJoin(items, eq(purchaseOrderLines.itemId, items.id))
    .where(eq(purchaseOrderLines.purchaseOrderId, poId));

  const vatRatePercent = Math.round(parseFloat(poRow.projectVatRate ?? '0.25') * 100);

  const body = buildPoBodyTemplate({
    poReference: po.reference,
    issuedAtDate: po.issuedAt ?? new Date().toISOString().slice(0, 10),
    projectTitle: poRow.projectTitle ?? '',
    projectReference: poRow.projectReference ?? '',
    deliveryAddress: po.deliveryAddress ?? '—',
    deliveryDeadline: po.deliveryDeadline,
    freightTerms: po.freightTerms,
    freightResponsibleParty: po.freightResponsibleParty,
    vatRatePercent,
    subtotalNet: formatMoney(po.subtotalNet, po.currency),
    vatAmount: formatMoney(po.vatAmount, po.currency),
    totalGross: formatMoney(po.totalGross, po.currency),
    currency: po.currency,
    vendorName: poRow.vendorName ?? '—',
    lines: lineRows.map(l => ({
      itemName: l.itemName,
      description: l.description,
      manufacturer: l.manufacturer,
      sku: l.sku,
      quantity: l.quantity,
      unit: l.unit,
      unitCostFormatted: formatMoney(l.unitCost, po.currency),
      lineTotalFormatted: formatMoney(l.lineTotal, po.currency)
    })),
    paymentTermsText: null
  });

  // Substitute per-recipient placeholders
  const personalised = body
    .replace(/\[supplier contact name\]/g, poRow.vendorContactName ?? poRow.vendorName ?? 'Supplier')
    .replace(/\[your name\]/g, senderName)
    .replace(/\[your email\]/g, senderEmail)
    // Safety net for historic PO bodies — the active template no
    // longer emits this placeholder.
    .replace(/, \[your role\]|\[your role\]\n?/g, '');

  // Fetch attachments
  const attRows = await db
    .select()
    .from(poAttachments)
    .where(eq(poAttachments.poId, poId));
  const attachments: GmailAttachment[] = [];
  for (const att of attRows) {
    const { data: blob } = await supabase.storage
      .from('po-attachments')
      .download(att.storagePath);
    if (!blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    attachments.push({
      filename: att.filename,
      mimeType: att.mimeType,
      content: buf
    });
  }

  const cc = senderEmail.toLowerCase() === SIV_EMAIL ? undefined : SIV_EMAIL;
  const subject = `PURCHASE ORDER · ${po.reference} · ${poRow.projectReference ?? ''} — BINDING ORDER`;

  const sendRes = await sendGmail({
    accessToken,
    from: senderEmail,
    fromName: senderName,
    to: poRow.vendorContactEmail,
    cc,
    bcc: senderEmail,
    subject,
    body: personalised,
    attachments: attachments.length > 0 ? attachments : undefined
  });

  revalidatePath(`/projects/${projectId}/pos/${poId}`);

  if (!sendRes.ok) {
    return { ok: false, emailSent: false, emailError: sendRes.error };
  }
  return { ok: true, emailSent: true };
}
