import { z } from 'zod';

export const APPROVAL_TARGET_TYPES = [
  'scope_baseline_version',
  'item',
  'quote',
  'purchase_order',
  'change_order',
  'budget_baseline'
] as const;
export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPES)[number];

export const APPROVAL_CHANNELS = [
  'email', 'portal', 'in_person', 'phone_confirmed_in_writing', 'signed_document'
] as const;

/** New approval — what the request-approval form posts. */
export const newApprovalSchema = z.object({
  targetType: z.enum(APPROVAL_TARGET_TYPES),
  targetId: z.string().uuid(),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
  version: z.string().optional(),
  price: z.coerce.number().nonnegative().optional().or(z.literal('').transform(() => undefined)),
  priceCurrency: z.enum(['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK']).optional(),
  freightAssumptions: z.string().optional(),
  customsAssumptions: z.string().optional(),
  leadTimeDays: z.coerce.number().int().nonnegative().optional().or(z.literal('').transform(() => undefined)),
  supplierName: z.string().optional(),
  approvalConsequence: z.string().min(1, 'State what happens on approval'),
  approverName: z.string().min(1, 'Who is being asked to approve'),
  approverEmail: z.string().email('Approver email required'),
  approvalChannel: z.enum(APPROVAL_CHANNELS),
  validUntil: z.coerce.date().optional().or(z.literal('').transform(() => undefined))
});

export type NewApproval = z.infer<typeof newApprovalSchema>;

/** Logging the client response — what the response form posts. */
export const responseSchema = z.object({
  decision: z.enum(['approved', 'approved_with_conditions', 'rejected']),
  conditions: z.string().optional(),
  approvalChannel: z.enum(APPROVAL_CHANNELS),
  // approval_evidence_file_id wired separately when file upload lands
  notes: z.string().optional()
}).refine(d => d.decision !== 'approved_with_conditions' || (d.conditions && d.conditions.trim().length > 0), {
  message: 'Conditions are required when approving with conditions',
  path: ['conditions']
});

export type ApprovalResponse = z.infer<typeof responseSchema>;
