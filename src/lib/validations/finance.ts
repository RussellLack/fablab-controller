import { z } from 'zod';

const currency = z.enum(['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK']);
const emptyToUndef = z.literal('').transform(() => undefined);

/* ─────────────────────────── INVOICE ─────────────────────────── */
export const newInvoiceSchema = z.object({
  currency: currency,
  issueDate: z.coerce.date().optional().or(emptyToUndef),       // defaults to today server-side
  dueDate: z.coerce.date().optional().or(emptyToUndef),         // defaults to issueDate + clientPaymentTerms
  vatRate: z.coerce.number().min(0).max(100).default(25),
  notes: z.string().optional(),
  terms: z.string().optional()
  // Lines arrive as repeated form fields — parsed server-side
});

export const invoiceLineInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().nonnegative(),
  milestoneType: z.string().optional(),
  purchaseOrderId: z.string().uuid().optional().or(emptyToUndef),
  itemId: z.string().uuid().optional().or(emptyToUndef)
});

export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>;

/* ─────────────────────────── PAYMENT ─────────────────────────── */
export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  currency: currency,
  fxRateToProject: z.coerce.number().positive().optional().or(emptyToUndef),
  receivedDate: z.coerce.date(),
  clearedDate: z.coerce.date().optional().or(emptyToUndef),
  method: z.enum(['bank_transfer', 'card', 'cheque', 'cash', 'credit_note', 'other']),
  bankReference: z.string().optional(),
  notes: z.string().optional()
});

/* ─────────────────────────── BILLING TRIGGER ─────────────────────────── */
export const newBillingTriggerSchema = z.object({
  name: z.string().min(1),
  triggerEvent: z.enum([
    'retainer_due', 'design_phase_started', 'concept_approved', 'scope_signed',
    'procurement_approval_received', 'po_issued', 'supplier_deposit_required',
    'goods_shipped', 'goods_delivered', 'installation_completed',
    'change_order_approved', 'hours_threshold_exceeded', 'final_handover'
  ]),
  amountCalculation: z.enum(['fixed', 'percent_of_budget', 'percent_of_pos', 'time_and_materials', 'custom']),
  amountValue: z.coerce.number().nonnegative().optional().or(emptyToUndef),
  amountPercent: z.coerce.number().min(0).max(100).optional().or(emptyToUndef),
  amountBasis: z.enum(['project_budget', 'package_budget', 'po_total', 'committed_cost']).optional(),
  descriptionTemplate: z.string().optional()
});
