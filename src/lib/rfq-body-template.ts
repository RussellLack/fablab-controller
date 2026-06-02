/**
 * RFQ body template, adapted from the Price Request specimen in
 * `20-doc-templates-best-practice.md` §1.
 *
 * `22-wizards.md` line 185 noted the RFQ body as a documented gap —
 * the docs only ship a Price Request template, and the RFQ banner +
 * structural requirements live in `18-data-model-v7.md` line 293.
 * This file fills that gap.
 *
 * The body is generated with `[bracketed placeholders]` for per-vendor
 * variables that get substituted at send time:
 *   [supplier contact name]   — the vendor's primary contact
 *   [your name]               — the sender (RFQ author)
 *   [your email]              — the sender's email (reply-to)
 *
 * `[your role]` was previously emitted in the signature but always
 * resolved to an empty string (no per-user role/title field), leaving
 * a stray empty line. Removed from the template; the substitution in
 * `procurement.ts` is kept as a safety net for legacy RFQ drafts whose
 * body already has the literal placeholder baked into `rfqs.description`.
 *
 * Project- and items-level variables are baked in at template-build time
 * (project ref, items table, delivery country, etc.) so the user sees
 * the final body in the wizard's preview / editor.
 */

export type RfqBodyContext = {
  projectRef: string;
  projectTitle: string;
  itemsForBody: Array<{
    name: string;
    quantity: string;
    unit: string;
    description?: string | null;
    manufacturer?: string | null;
    sku?: string | null;
  }>;
  deliveryCountry?: string | null;
  responseDeadline: string; // YYYY-MM-DD
  invitedVendorsCount: number;
};

function itemsTable(items: RfqBodyContext['itemsForBody']): string {
  return items
    .map((it, i) => {
      const spec = [
        it.manufacturer,
        it.sku ? `SKU ${it.sku}` : null,
        it.description?.trim()
      ]
        .filter(Boolean)
        .join(' · ');
      return `${i + 1}. **${it.name}** — ${it.quantity} ${it.unit}${spec ? `\n   ${spec}` : ''}`;
    })
    .join('\n');
}

export function buildRfqBodyTemplate(ctx: RfqBodyContext): string {
  const deliveryLine = ctx.deliveryCountry
    ? `Target delivery location: ${ctx.deliveryCountry}.`
    : 'Target delivery location to be confirmed at order.';

  return `Dear [supplier contact name],

**REQUEST FOR QUOTATION — NOT A PURCHASE ORDER**

This is a formal Request for Quotation. It is NOT a purchase order, places no obligation on either party, and does not authorise the production or shipment of any goods. Only a separately issued, signed Purchase Order from Fablab Design AS constitutes an order.

We are scoping ${ctx.projectTitle} (${ctx.projectRef}) and invite your pricing for the items below. You are one of ${ctx.invitedVendorsCount} suppliers being asked; the successful response will be evaluated against price, lead time, terms, and fit with our specification before any award.

### Items

${itemsTable(ctx.itemsForBody)}

${deliveryLine}

### Response requested

- Firm unit price (currency: your preferred trading currency)
- Confirmed lead time from order
- Any volume / package discounts
- Standard payment terms
- Standard delivery terms (Incoterms)
- Validity period of the quotation

### Evaluation criteria

Quotations will be evaluated on price, lead time, payment and delivery terms, fit with the specification, and prior delivery reliability. We will inform every responder of the outcome.

### Response format

Please reply by email to [your email] referencing ${ctx.projectRef}. An itemised PDF or spreadsheet attachment is preferred.

### Response deadline

Please respond by ${ctx.responseDeadline}. If you cannot respond by this date, a brief note acknowledging the enquiry is still appreciated.

### Important

This document does not constitute an order, a commitment to purchase, or an authorisation to ship. Any production or shipment based on this enquiry alone is at the supplier's own risk and will not be accepted or paid for by Fablab Design AS. Goods will only be procured under a separately issued, signed Purchase Order.

Best regards,

[your name]
Fablab Design AS
[your email]
controller.fablabdesign.com`;
}
