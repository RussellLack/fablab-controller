import { z } from 'zod';

const currency = z.enum(['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK']);
const optionalString = z.string().optional();
const emptyToUndef = z.literal('').transform(() => undefined);

/* ─────────────────────────── VENDOR ─────────────────────────── */
export const newVendorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: z.enum(['supplier', 'fabricator', 'contractor', 'internal_workshop']),
  categories: z.string().optional(),                          // comma-separated; we split server-side
  country: z.string().length(2).optional().or(emptyToUndef),
  contactName: z.string().min(1, 'Contact name required'),
  contactEmail: z.string().email('Valid email required'),
  contactPhone: optionalString,
  address: optionalString,
  typicalLeadTimeDays: z.coerce.number().int().nonnegative().optional().or(emptyToUndef),
  paymentTerms: optionalString,
  defaultCurrency: currency.optional(),
  notes: optionalString,
  isInternal: z.coerce.boolean().optional()
});

/* ─────────────────────────── PACKAGE ─────────────────────────── */
export const newPackageSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: z.enum(['room', 'category', 'trade', 'phase']),
  budget: z.coerce.number().nonnegative().optional().or(emptyToUndef)
});

/* ─────────────────────────── ITEM ─────────────────────────── */
export const newItemSchema = z.object({
  packageId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  description: optionalString,
  itemType: z.enum(['sourced', 'bespoke']),
  category: z.string().min(1, 'Category is required'),
  subcategory: optionalString,
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1, 'Unit is required'),                // each, set, m, m²
  manufacturer: optionalString,
  sku: optionalString,
  countryOfOrigin: z.string().length(2).optional().or(emptyToUndef),
  hsCode: optionalString,
  notes: optionalString
});

/* ─────────────────────────── RFQ ─────────────────────────── */
export const newRfqSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: optionalString,
  responseDeadline: z.coerce.date(),
  packageId: z.string().uuid().optional().or(emptyToUndef),
  // selectedItems / invitedVendors come through as repeated form fields; we parse those server-side
  disclaimerText: z.string().optional()
});

/* ─────────────────────────── QUOTE ─────────────────────────── */
export const recordQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  unitCost: z.coerce.number().nonnegative(),
  quotedQuantity: z.coerce.number().positive().optional().or(emptyToUndef),
  currency: currency,
  fxRateToProject: z.coerce.number().positive().optional().or(emptyToUndef),
  leadTimeDays: z.coerce.number().int().nonnegative().optional().or(emptyToUndef),
  validUntil: z.coerce.date().optional().or(emptyToUndef),
  includesShipping: z.coerce.boolean().optional(),
  includesInstall: z.coerce.boolean().optional(),
  paymentTerms: optionalString,
  notes: optionalString
});

/* ─────────────────────────── PO ─────────────────────────── */
export const newPoSchema = z.object({
  vendorId: z.string().uuid(),
  currency: currency,
  deliveryAddress: optionalString,
  deliveryDeadline: z.coerce.date().optional().or(emptyToUndef),
  deliveryInstructions: optionalString,
  freightTerms: optionalString,
  freightResponsibleParty: z.enum(['fablab', 'vendor', 'freight_forwarder']).optional(),
  customsRequirements: optionalString,
  approvalReferenceId: z.string().uuid().optional().or(emptyToUndef),
  notes: optionalString,
  terms: optionalString
});
