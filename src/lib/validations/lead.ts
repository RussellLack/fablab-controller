import { z } from 'zod';

/**
 * The 16 required intake fields per §2 of `00-industry-best-practices.md`.
 * This is the single source of truth for the intake completeness gate.
 * The order matches the doc's enumeration — used for the "missing fields" display.
 */
export const REQUIRED_INTAKE_FIELDS = [
  'prospectiveClientName',
  'clientKind',
  'primaryContactName',
  'primaryContactEmail',
  'primaryContactPhone',
  'propertyAddress',
  'projectType',
  'roomsOrZones',
  'desiredOutcome',
  'budgetExpectation',
  'timelineExpectation',
  'decisionMakers',
  'approvalProcess',
  'existingSuppliers',
  'knownConstraints',
  'designStylePreferences',
  'procurementExpectations',
  'deliveryInstallExpectations',
  'fablabExpectedRole'
] as const;

export type IntakeField = (typeof REQUIRED_INTAKE_FIELDS)[number];

/** Loose schema used while a lead is being filled in — every field optional. */
export const leadDraftSchema = z.object({
  prospectiveClientName: z.string().optional(),
  clientKind: z.enum(['individual', 'business', 'public_sector', 'cultural_institution', 'hospitality_group']).optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  primaryContactPhone: z.string().optional(),
  propertyAddress: z.string().optional(),
  projectType: z.enum(['residential', 'commercial', 'hospitality', 'retail', 'workplace', 'cultural', 'mixed']).optional(),
  roomsOrZones: z.string().optional(),
  desiredOutcome: z.string().optional(),
  budgetExpectation: z.coerce.number().nonnegative().optional().or(z.literal('').transform(() => undefined)),
  budgetCurrency: z.enum(['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK']).optional(),
  timelineExpectation: z.string().optional(),
  decisionMakers: z.string().optional(),
  approvalProcess: z.string().optional(),
  existingSuppliers: z.string().optional(),
  knownConstraints: z.string().optional(),
  designStylePreferences: z.string().optional(),
  procurementExpectations: z.string().optional(),
  deliveryInstallExpectations: z.string().optional(),
  fablabExpectedRole: z.enum([
    'design_advisory_only', 'design_and_specification', 'procurement_support',
    'procurement_and_resale', 'supplier_coordination', 'delivery_coordination',
    'installation_coordination', 'full_project_control'
  ]).optional(),
  source: z.enum(['referral', 'direct_inquiry', 'repeat_client', 'partner', 'website', 'other']).optional(),
  notes: z.string().optional()
});

export type LeadDraft = z.infer<typeof leadDraftSchema>;

/** Strict schema enforced at the conversion gate — every required field must be set. */
export const leadCompleteSchema = leadDraftSchema.extend({
  prospectiveClientName: z.string().min(1),
  clientKind: z.enum(['individual', 'business', 'public_sector', 'cultural_institution', 'hospitality_group']),
  primaryContactName: z.string().min(1),
  primaryContactEmail: z.string().email(),
  primaryContactPhone: z.string().min(1),
  propertyAddress: z.string().min(1),
  projectType: z.enum(['residential', 'commercial', 'hospitality', 'retail', 'workplace', 'cultural', 'mixed']),
  roomsOrZones: z.string().min(1),
  desiredOutcome: z.string().min(1),
  budgetExpectation: z.coerce.number().nonnegative(),
  timelineExpectation: z.string().min(1),
  decisionMakers: z.string().min(1),
  approvalProcess: z.string().min(1),
  existingSuppliers: z.string().min(1),
  knownConstraints: z.string().min(1),
  designStylePreferences: z.string().min(1),
  procurementExpectations: z.string().min(1),
  deliveryInstallExpectations: z.string().min(1),
  fablabExpectedRole: z.enum([
    'design_advisory_only', 'design_and_specification', 'procurement_support',
    'procurement_and_resale', 'supplier_coordination', 'delivery_coordination',
    'installation_coordination', 'full_project_control'
  ])
});

/**
 * Inspect a lead row and return the list of required intake fields that
 * are still empty. Empty list = ready to convert. Used by both the UI
 * (to show "n of 16 complete") and the server gate (to refuse conversion).
 */
export function missingIntakeFields(lead: Record<string, unknown>): IntakeField[] {
  return REQUIRED_INTAKE_FIELDS.filter(f => {
    const v = lead[f];
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  });
}

/** Convenience: count for the completeness meter. */
export function intakeCompleteness(lead: Record<string, unknown>) {
  const missing = missingIntakeFields(lead);
  const total = REQUIRED_INTAKE_FIELDS.length;
  return { complete: total - missing.length, total, missing, percent: Math.round(((total - missing.length) / total) * 100) };
}
