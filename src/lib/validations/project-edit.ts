import { z } from 'zod';

/**
 * Validation schema for /projects/[id]?edit=1 — METADATA ONLY.
 *
 * Stage transitions live in their own lifecycle UI (Advance / Hold
 * buttons in the project layout) and are NOT exposed here. Trying to
 * change a project's stage through this form would bypass the
 * gate-validation + scope-baseline logic those buttons enforce.
 *
 * Reference is also intentionally read-only — it's a stable handle
 * used in PWO imports and document references.
 */
export const projectEditSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional().or(z.literal('')),
  projectType: z.enum([
    'residential',
    'commercial',
    'hospitality',
    'retail',
    'workplace',
    'cultural',
    'mixed'
  ]),
  fablabRole: z.enum([
    'design_advisory_only',
    'design_and_specification',
    'procurement_support',
    'procurement_and_resale',
    'supplier_coordination',
    'delivery_coordination',
    'installation_coordination',
    'full_project_control'
  ]),
  priority: z.enum(['low', 'normal', 'high']),
  siteAddress: z.string().optional().or(z.literal('')),
  budget: z
    .union([z.coerce.number().min(0), z.literal('').transform(() => null as unknown as number | null)])
    .optional(),
  budgetCurrency: z.enum(['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK']),
  targetHandoverDate: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      z.literal('').transform(() => null as unknown as string | null)
    ])
    .optional()
});

export type ProjectEditInput = z.infer<typeof projectEditSchema>;
