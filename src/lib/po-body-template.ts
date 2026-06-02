/**
 * PO body template, adapted from the Purchase Order specimen in
 * `20-doc-templates-best-practice.md` §2.
 *
 * Unlike RFQ, this is a BINDING document — the language is deliberately
 * legal and complete. The template is generated at issue time with all
 * project / vendor / line context baked in; only per-recipient
 * placeholders (sender details) stay in [brackets] for substitution.
 *
 * Placeholders substituted at send time:
 *   [supplier contact name]   — vendor's primary contact
 *   [your name]               — sender (issuer)
 *   [your email]              — sender's email
 *
 * `[your role]` was previously emitted in the "Issued by" block but
 * always resolved to an empty string (no per-user role/title field),
 * producing "Name, " in the signature. Removed from the template; the
 * substitution in `procurement.ts` is kept as a safety net should
 * any historic PO body ever contain the literal placeholder.
 */

export type PoBodyContext = {
  poReference: string;
  issuedAtDate: string;       // YYYY-MM-DD
  projectTitle: string;
  projectReference: string;
  deliveryAddress: string;
  deliveryDeadline: string | null;
  freightTerms: string | null;
  freightResponsibleParty: string | null;
  vatRatePercent: number;     // e.g. 25
  subtotalNet: string;        // formatted money string
  vatAmount: string;
  totalGross: string;
  currency: string;
  vendorName: string;
  lines: Array<{
    itemName: string;
    description: string | null;
    manufacturer: string | null;
    sku: string | null;
    quantity: string;
    unit: string;
    unitCostFormatted: string;
    lineTotalFormatted: string;
  }>;
  paymentTermsText: string | null;
  fablabOrgNumber?: string | null;
};

function linesTable(lines: PoBodyContext['lines']): string {
  return lines
    .map((l, i) => {
      const spec = [
        l.manufacturer,
        l.sku ? `SKU ${l.sku}` : null,
        l.description?.trim()
      ].filter(Boolean).join(' · ');
      return (
        `${i + 1}. **${l.itemName}** — ${l.quantity} ${l.unit} × ${l.unitCostFormatted} = ${l.lineTotalFormatted}` +
        (spec ? `\n   ${spec}` : '')
      );
    })
    .join('\n');
}

export function buildPoBodyTemplate(ctx: PoBodyContext): string {
  const reqByLine = ctx.deliveryDeadline
    ? `Required by: ${ctx.deliveryDeadline} — this date is BINDING. The supplier shall notify Fablab in writing immediately if any risk to this date arises.`
    : 'Required-by date: to be confirmed in writing prior to acceptance.';

  const freightLine = ctx.freightTerms
    ? `Incoterms: ${ctx.freightTerms}${ctx.freightResponsibleParty ? ` (${ctx.freightResponsibleParty} is responsible for freight cost)` : ''}.`
    : 'Incoterms to be agreed in writing prior to acceptance.';

  const paymentText =
    ctx.paymentTermsText ??
    '30 days net from receipt of correctly addressed invoice and confirmed receipt of goods in good condition';

  const orgLine = ctx.fablabOrgNumber
    ? `Org. nr. ${ctx.fablabOrgNumber}`
    : '';

  return `Dear [supplier contact name],

**PURCHASE ORDER — BINDING**

PO Reference: ${ctx.poReference}
Date issued: ${ctx.issuedAtDate}
Project: ${ctx.projectTitle} (${ctx.projectReference})
Delivery: ${ctx.deliveryAddress}
${reqByLine}

This document constitutes a binding purchase order from Fablab Design AS to ${ctx.vendorName} for the goods listed below, on the commercial and delivery terms set out in this document and in any accompanying specifications referenced.

By accepting this order (whether by written confirmation, by commencing production, or by shipment), the supplier confirms acceptance of all terms set out below.

### Goods ordered

${linesTable(ctx.lines)}

**Subtotal (ex VAT):** ${ctx.subtotalNet} ${ctx.currency}
**VAT (${ctx.vatRatePercent}%):** ${ctx.vatAmount} ${ctx.currency}
**Total (inc VAT):** ${ctx.totalGross} ${ctx.currency}

### Delivery terms (BINDING)

- Address: ${ctx.deliveryAddress}
- ${reqByLine}
- Late delivery: any delay beyond the required-by date attributable to the supplier shall entitle Fablab to (a) cancel the affected lines without penalty, (b) source replacements with the differential cost recoverable from the supplier, or (c) apply liquidated damages as agreed in writing.
- ${freightLine}

### Packaging requirements

The supplier shall package the goods to a standard appropriate for international freight to Norway, including:

- Shock-absorbent inner packaging for each individual unit
- Outer packaging suitable for handling, stacking and forklift movement
- Wooden crates or pallets for items above 25 kg, fragile items, or oversized items
- Edge and corner protection for items with finished surfaces, glass, mirrored finishes, or polished metal
- Moisture barrier for any item with wood, leather, textile, or finish vulnerable to humidity
- Labelling: each crate/package marked with Fablab PO reference (${ctx.poReference}), item description, "FRAGILE" where applicable, and orientation arrows
- A printed packing list inside the outermost package listing every item with quantity and corresponding PO line

Inadequate packaging shall be grounds for rejection at delivery, with the supplier bearing the cost of return, re-packing, and re-shipment.

### Damage in transit — supplier indemnity

The supplier accepts full responsibility for damage to the goods during all stages of transportation up to and including the point of accepted delivery at the address above. This responsibility applies regardless of the freight forwarder selected or the Incoterms applicable, and is enforceable by Fablab against the supplier directly.

Where goods are received damaged, Fablab shall (at Fablab's discretion):

- Reject and return at supplier's cost, with full refund within 30 days; OR
- Accept the damaged goods at a reduced price agreed in writing; OR
- Require the supplier to provide replacements at no additional cost within an agreed timeframe.

The supplier shall maintain valid cargo insurance covering the full declared value of the shipment for the duration of transit. Proof of cover shall be provided on request.

### Payment terms

- ${paymentText}
- Invoices shall reference PO ${ctx.poReference} and itemise per the lines above
- Fablab reserves the right to withhold payment for any line where delivery, quality, or documentation is incomplete

### Confirmation required

Please confirm acceptance of this order in writing (email is sufficient) within 5 business days of receipt. Acceptance constitutes agreement to all terms in this document. If you require changes to any term, these must be negotiated and agreed in writing BEFORE acceptance — commencing production or shipment after receipt of this PO shall constitute acceptance of the terms as written.

### Issued by

[your name]
Fablab Design AS
[your email]
${orgLine}

controller.fablabdesign.com`;
}
