'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import {
  db, invoices, invoiceLines, payments, billingTriggers,
  projects, clients, notifications, purchaseOrders
} from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import {
  newInvoiceSchema, recordPaymentSchema, invoiceLineInputSchema
} from '@/lib/validations/finance';

type ActionResult = { ok: true; id?: string; url?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function nextInvoiceReference(projectRef: string): Promise<string> {
  const seqSuffix = projectRef.replace(/^FD-\d{4}-/, ''); // "0142"
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM invoices WHERE reference LIKE ${'INV-' + seqSuffix + '-%'}`
  );
  return `INV-${seqSuffix}-${String(row?.next ?? 1).padStart(2, '0')}`;
}

async function nextPaymentReference(invoiceRef: string): Promise<string> {
  const seqSuffix = invoiceRef.replace(/^INV-/, ''); // "0142-03"
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM payments WHERE reference LIKE ${'PAY-' + seqSuffix + '-%'}`
  );
  return `PAY-${seqSuffix}-${String(row?.next ?? 1).padStart(2, '0')}`;
}

/* ─────────────────────────── INVOICE ─────────────────────────── */

/**
 * Create a draft invoice. Lines arrive as repeated form fields:
 *   line[N][description], line[N][unitPrice], line[N][quantity], line[N][purchaseOrderId], line[N][milestoneType]
 */
export async function createInvoice(
  projectId: string,
  projectRef: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = newInvoiceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Parse the lines from repeated form fields. The form names them line[0][description] etc.
  const lineEntries: Record<number, Record<string, string>> = {};
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^line\[(\d+)\]\[([a-zA-Z]+)\]$/);
    if (match) {
      const [, idxStr, field] = match;
      const idx = parseInt(idxStr!, 10);
      lineEntries[idx] ??= {};
      lineEntries[idx]![field!] = String(value);
    }
  }
  const lineRaws = Object.entries(lineEntries)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([, v]) => v)
    .filter(l => l.description && l.unitPrice);

  if (lineRaws.length === 0) {
    return { ok: false, error: 'At least one invoice line is required' };
  }

  const parsedLines = lineRaws.map(l => invoiceLineInputSchema.safeParse(l));
  const errLine = parsedLines.findIndex(p => !p.success);
  if (errLine >= 0) {
    return { ok: false, error: `Line ${errLine + 1} invalid` };
  }
  const lines = parsedLines.map(p => p.data!);

  // Compute totals
  const subtotalNet = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const vatRate = parsed.data.vatRate;
  const vatAmount = subtotalNet * (vatRate / 100);
  const totalGross = subtotalNet + vatAmount;

  // Fetch project + client for currency + due date defaults
  const [proj] = await db.select({
    clientId: projects.clientId,
    paymentTermsDays: clients.paymentTermsDays
  }).from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) return { ok: false, error: 'Project not found' };

  const issueDate = parsed.data.issueDate ?? new Date();
  const dueDate = parsed.data.dueDate
    ?? new Date(issueDate.getTime() + (proj.paymentTermsDays ?? 30) * 86_400_000);

  const reference = await nextInvoiceReference(projectRef);

  const [invoice] = await db.insert(invoices).values({
    reference,
    projectId,
    clientId: proj.clientId,
    status: 'draft',
    currency: parsed.data.currency,
    issueDate: issueDate.toISOString().slice(0, 10),
    dueDate: dueDate.toISOString().slice(0, 10),
    vatRate: vatRate.toString(),
    subtotalNet: subtotalNet.toFixed(2),
    vatAmount: vatAmount.toFixed(2),
    totalGross: totalGross.toFixed(2),
    amountPaid: '0',
    balanceDue: totalGross.toFixed(2),
    notes: parsed.data.notes,
    terms: parsed.data.terms,
    createdBy: userId
  }).returning({ id: invoices.id });

  if (!invoice) return { ok: false, error: 'Insert failed' };

  await db.insert(invoiceLines).values(lines.map((l, idx) => ({
    invoiceId: invoice.id,
    description: l.description,
    quantity: l.quantity.toString(),
    unitPrice: l.unitPrice.toString(),
    lineTotal: (l.quantity * l.unitPrice).toFixed(2),
    purchaseOrderId: l.purchaseOrderId,
    itemId: l.itemId,
    milestoneType: l.milestoneType,
    displayOrder: idx
  })));

  revalidatePath(`/projects/${projectId}/finance`);
  redirect(`/projects/${projectId}/finance/${invoice.id}`);
}

/** draft → issued. Stamps issueDate if not already set. */
export async function issueInvoice(invoiceId: string, projectId: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return { ok: false, error: 'Invoice not found' };
  if (inv.status !== 'draft') return { ok: false, error: 'Only draft invoices can be issued' };

  await db.update(invoices).set({
    status: 'issued',
    issueDate: inv.issueDate ?? new Date().toISOString().slice(0, 10),
    updatedAt: new Date()
  }).where(eq(invoices.id, invoiceId));

  revalidatePath(`/projects/${projectId}/finance/${invoiceId}`);
  revalidatePath(`/projects/${projectId}/finance`);
  revalidatePath('/finance');
  return { ok: true, id: invoiceId };
}

/** issued → sent. Records that we dispatched it to the client. */
export async function markInvoiceSent(invoiceId: string, projectId: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  await db.update(invoices).set({
    status: 'sent',
    sentAt: new Date(),
    updatedAt: new Date()
  }).where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'issued')));

  revalidatePath(`/projects/${projectId}/finance/${invoiceId}`);
  return { ok: true, id: invoiceId };
}

/** Void an invoice — cannot be a paid invoice. */
export async function voidInvoice(invoiceId: string, projectId: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return { ok: false, error: 'Invoice not found' };
  if (inv.status === 'paid') return { ok: false, error: 'Paid invoices cannot be voided' };

  await db.update(invoices).set({
    status: 'void',
    updatedAt: new Date()
  }).where(eq(invoices.id, invoiceId));

  revalidatePath(`/projects/${projectId}/finance/${invoiceId}`);
  revalidatePath(`/projects/${projectId}/finance`);
  return { ok: true, id: invoiceId };
}

/* ─────────────────────────── PAYMENT ─────────────────────────── */

export async function recordPayment(
  invoiceId: string,
  projectId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = recordPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return { ok: false, error: 'Invoice not found' };
  if (inv.status === 'void') return { ok: false, error: 'Cannot record payment on a void invoice' };

  const reference = await nextPaymentReference(inv.reference);

  await db.insert(payments).values({
    reference,
    invoiceId,
    amount: parsed.data.amount.toString(),
    currency: parsed.data.currency,
    fxRateToProject: parsed.data.fxRateToProject?.toString(),
    receivedDate: parsed.data.receivedDate.toISOString().slice(0, 10),
    clearedDate: parsed.data.clearedDate?.toISOString().slice(0, 10),
    method: parsed.data.method,
    status: 'received',
    bankReference: parsed.data.bankReference,
    notes: parsed.data.notes,
    recordedBy: userId
  });

  // Recompute invoice rollup from authoritative payments (handles cross-currency naively for now)
  const [tot] = await db.execute<{ paid: string }>(
    sql`SELECT COALESCE(SUM(amount), 0)::text AS paid
        FROM payments
        WHERE invoice_id = ${invoiceId}
          AND status IN ('received', 'cleared')`
  );
  const amountPaid = parseFloat(tot?.paid ?? '0');
  const balanceDue = parseFloat(inv.totalGross) - amountPaid;
  const newStatus = balanceDue <= 0.01 ? 'paid'
    : amountPaid > 0 ? 'partially_paid'
    : inv.status;

  await db.update(invoices).set({
    amountPaid: amountPaid.toFixed(2),
    balanceDue: balanceDue.toFixed(2),
    status: newStatus,
    paidAt: newStatus === 'paid' ? new Date() : null,
    updatedAt: new Date()
  }).where(eq(invoices.id, invoiceId));

  revalidatePath(`/projects/${projectId}/finance/${invoiceId}`);
  revalidatePath(`/projects/${projectId}/finance`);
  revalidatePath('/finance');
  return { ok: true };
}

/* ─────────────────────────── BILLING TRIGGERS ─────────────────────────── */

/**
 * Fire a trigger event for a project. Looks up active BillingTriggers
 * matching the event, computes the proposed amount, and creates a
 * Notification of kind `billing_recommendation` for the project lead.
 *
 * Critically: this does NOT auto-create the Invoice. The user reviews
 * the proposal in the Billing pipeline UI and chooses to create or dismiss.
 */
export async function applyBillingTrigger(
  projectId: string,
  eventType:
    | 'retainer_due' | 'design_phase_started' | 'concept_approved' | 'scope_signed'
    | 'procurement_approval_received' | 'po_issued' | 'supplier_deposit_required'
    | 'goods_shipped' | 'goods_delivered' | 'installation_completed'
    | 'change_order_approved' | 'hours_threshold_exceeded' | 'final_handover',
  context: { poId?: string; itemId?: string; approvalId?: string; amount?: number } = {}
): Promise<void> {
  // Active triggers matching this event, scoped to this project or global (project_id IS NULL)
  const matches = await db.select().from(billingTriggers).where(and(
    eq(billingTriggers.triggerEvent, eventType),
    eq(billingTriggers.active, true),
    sql`(${billingTriggers.projectId} = ${projectId} OR ${billingTriggers.projectId} IS NULL)`
  ));

  if (matches.length === 0) return;

  const [project] = await db.select({
    reference: projects.reference,
    title: projects.title,
    budget: projects.budget,
    currentOwnerId: projects.currentOwnerId
  }).from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!project) return;

  for (const trigger of matches) {
    // Compute proposed amount
    let proposed = 0;
    switch (trigger.amountCalculation) {
      case 'fixed':
        proposed = parseFloat(trigger.amountValue ?? '0');
        break;
      case 'percent_of_budget':
        proposed = parseFloat(project.budget ?? '0') * parseFloat(trigger.amountPercent ?? '0') / 100;
        break;
      case 'percent_of_pos':
        if (context.poId) {
          const [po] = await db.select({ subtotal: purchaseOrders.subtotalNet })
            .from(purchaseOrders).where(eq(purchaseOrders.id, context.poId)).limit(1);
          if (po) proposed = parseFloat(po.subtotal) * parseFloat(trigger.amountPercent ?? '0') / 100;
        }
        break;
      // time_and_materials + custom: leave at 0 for user review
    }

    const recipientId = project.currentOwnerId;
    if (!recipientId) continue;

    await db.insert(notifications).values({
      userId: recipientId,
      kind: 'billing_recommendation',
      subject: `Billing trigger fired — ${trigger.name}`,
      body: `Project ${project.reference} (${project.title}) — proposed invoice: ${proposed.toFixed(2)}. Review and create from the Billing pipeline.`,
      link: `/projects/${projectId}/finance?pipeline=1&trigger=${trigger.id}`
    });
  }
}
