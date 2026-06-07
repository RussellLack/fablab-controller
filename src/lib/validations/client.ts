import { z } from 'zod';

/**
 * Validation schema for the /clients/[id] edit form.
 *
 * Mirrors the columns of the `clients` table that staff can edit
 * directly. The id column is supplied separately via the server
 * action's bound argument; reference fields (createdAt/updatedAt)
 * are managed by the database, not the form.
 *
 * Mode is "draft" — every field optional, empty strings coerce to
 * null on save. The kind enum has a non-optional element list so
 * the type pill always resolves to a valid value when present.
 */
export const clientEditSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  kind: z.enum([
    'individual',
    'business',
    'public_sector',
    'cultural_institution',
    'hospitality_group'
  ]),
  primaryContactName: z.string().max(200).optional().or(z.literal('')),
  primaryContactEmail: z.string().email('Invalid email').max(320).optional().or(z.literal('')),
  primaryContactPhone: z.string().max(40).optional().or(z.literal('')),
  billingAddress: z.string().optional().or(z.literal('')),
  orgNumber: z.string().max(40).optional().or(z.literal('')),
  paymentTermsDays: z
    .union([z.coerce.number().int().min(0).max(365), z.literal('').transform(() => 30)])
    .optional()
    .default(30),
  bankAccountRef: z.string().max(60).optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal(''))
});

export type ClientEditInput = z.infer<typeof clientEditSchema>;

/** Coerce empty strings to null for nullable columns at save time. */
export function emptyToNull<T extends Record<string, unknown>>(input: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(input)) {
    out[k] = v === '' ? null : v;
  }
  return out as T;
}
