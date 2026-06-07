import { z } from 'zod';

/**
 * Validation schema for /vendors/[id] edit form. Mirrors the
 * `vendors` table — kind enum carries the colour-pill semantics.
 */
export const vendorEditSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(['supplier', 'fabricator', 'contractor', 'internal_workshop']),
  country: z
    .string()
    .max(2)
    .regex(/^[A-Z]{2}$/, 'ISO 3166 country code (2 letters, uppercase)')
    .optional()
    .or(z.literal('')),
  defaultCurrency: z
    .enum(['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'])
    .optional()
    .or(z.literal('')),
  contactName: z.string().max(200).optional().or(z.literal('')),
  contactEmail: z.string().email('Invalid email').max(320).optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  typicalLeadTimeDays: z
    .union([z.coerce.number().int().min(0).max(3650), z.literal('').transform(() => null as unknown as number | null)])
    .optional(),
  paymentTerms: z.string().max(120).optional().or(z.literal('')),
  rating: z
    .union([z.coerce.number().int().min(1).max(5), z.literal('').transform(() => null as unknown as number | null)])
    .optional(),
  active: z
    .union([z.literal('on'), z.literal('off'), z.literal('true'), z.literal('false'), z.literal('')])
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
  // Comma-separated string in the form, split on save
  categoriesRaw: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal(''))
});

export type VendorEditInput = z.infer<typeof vendorEditSchema>;
