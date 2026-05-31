/**
 * Element List price math — single source of truth for the cascade.
 *
 * Spec: 18-data-model-v7.md § Derived (computed at render time, not stored)
 *
 * The DB stores per-unit base values; the render layer computes the
 * per-row (qty-aggregated) cascade. Storing the derived values risks
 * staleness when discount or VAT or qty change — compute at render.
 */

export type ItemPriceInputs = {
  unitCost: number | string | null;       // per-unit cost (NOK or item currency); numeric or string from DB
  quantity: number | string | null;
  targetMarginPct: number | string | null;
  itemDiscountPct: number | string | null;
  projectDefaultDiscountPct: number | string | null;
  projectVatRate: number | string;          // e.g. 25 (Norway)
  /** Manual override for items where the unit_cost cascade doesn't apply (e.g. internal labour). */
  manualClientNet?: number | string | null;
};

export type ItemPriceOutputs = {
  unitCost: number | null;
  quantity: number;
  unitTotalValue: number | null;            // = unitCost × quantity
  marginPct: number | null;
  markup: number | null;                    // = unitTotalValue × marginPct
  clientNet: number | null;                 // = unitTotalValue + markup, or manualClientNet
  effectiveDiscountPct: number;             // item ?? project ?? 0
  discountValue: number;                    // clientNet × effectiveDiscountPct
  finalNetPrice: number | null;             // clientNet - discountValue  (≡ Price to Customer ex VAT)
  finalGrossPrice: number | null;           // finalNetPrice × (1 + vatRate)  (≡ Price to Customer inc VAT)
  unitListPrice: number | null;             // = clientNet / quantity (customer view)
  vatAmount: number | null;                 // finalGrossPrice - finalNetPrice
};

function n(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Compute the full price cascade for a single item.
 *
 * If unitCost is null (e.g. internal labour, contingency line), we fall back
 * to manualClientNet (if provided), still apply discount + VAT, and leave
 * upstream fields (markup, unitTotalValue) as null.
 */
export function computeItemPrices(inputs: ItemPriceInputs): ItemPriceOutputs {
  const unitCost = n(inputs.unitCost);
  const quantity = n(inputs.quantity) ?? 1;
  const marginPct = n(inputs.targetMarginPct);
  const vatRate = n(inputs.projectVatRate) ?? 0;

  // Discount fallback chain: item > project default > 0
  const itemDisc = n(inputs.itemDiscountPct);
  const projDisc = n(inputs.projectDefaultDiscountPct);
  const effectiveDiscountPct = itemDisc ?? projDisc ?? 0;

  let unitTotalValue: number | null = null;
  let markup: number | null = null;
  let clientNet: number | null = null;

  if (unitCost !== null && marginPct !== null) {
    // Standard cascade
    unitTotalValue = round2(unitCost * quantity);
    markup = round2(unitTotalValue * (marginPct / 100));
    clientNet = round2(unitTotalValue + markup);
  } else {
    // Manual override path (no derivable cost or margin)
    clientNet = n(inputs.manualClientNet);
  }

  let discountValue = 0;
  let finalNetPrice: number | null = null;
  let finalGrossPrice: number | null = null;
  let unitListPrice: number | null = null;
  let vatAmount: number | null = null;

  if (clientNet !== null) {
    discountValue = round2(clientNet * (effectiveDiscountPct / 100));
    finalNetPrice = round2(clientNet - discountValue);
    finalGrossPrice = round2(finalNetPrice * (1 + vatRate / 100));
    vatAmount = round2(finalGrossPrice - finalNetPrice);
    unitListPrice = quantity > 0 ? round2(clientNet / quantity) : null;
  }

  return {
    unitCost,
    quantity,
    unitTotalValue,
    marginPct,
    markup,
    clientNet,
    effectiveDiscountPct,
    discountValue,
    finalNetPrice,
    finalGrossPrice,
    unitListPrice,
    vatAmount
  };
}

/**
 * Aggregate totals across multiple items for the totals row.
 *
 * Returns the same shape as a single item, with marginPct as a *weighted*
 * average across items where unitTotalValue is non-null.
 */
export function aggregateItemPrices(
  items: ItemPriceOutputs[],
  vatRate: number
): ItemPriceOutputs {
  let unitTotalValue = 0;
  let markup = 0;
  let clientNet = 0;
  let discountValue = 0;
  let finalNetPrice = 0;
  let finalGrossPrice = 0;
  let vatAmount = 0;
  let quantity = 0;
  let weightedMarginNumerator = 0;
  let weightedMarginDenominator = 0;

  for (const it of items) {
    if (it.unitTotalValue !== null) unitTotalValue += it.unitTotalValue;
    if (it.markup !== null) markup += it.markup;
    if (it.clientNet !== null) clientNet += it.clientNet;
    discountValue += it.discountValue;
    if (it.finalNetPrice !== null) finalNetPrice += it.finalNetPrice;
    if (it.finalGrossPrice !== null) finalGrossPrice += it.finalGrossPrice;
    if (it.vatAmount !== null) vatAmount += it.vatAmount;
    quantity += it.quantity;
    if (it.unitTotalValue !== null && it.marginPct !== null) {
      weightedMarginNumerator += it.marginPct * it.unitTotalValue;
      weightedMarginDenominator += it.unitTotalValue;
    }
  }

  const marginPct = weightedMarginDenominator > 0
    ? round2(weightedMarginNumerator / weightedMarginDenominator)
    : null;

  return {
    unitCost: null,
    quantity,
    unitTotalValue: round2(unitTotalValue),
    marginPct,
    markup: round2(markup),
    clientNet: round2(clientNet),
    effectiveDiscountPct: 0,
    discountValue: round2(discountValue),
    finalNetPrice: round2(finalNetPrice),
    finalGrossPrice: round2(finalGrossPrice),
    unitListPrice: null,
    vatAmount: round2(vatAmount)
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Format a number as NOK currency (no symbol, just thousands separator + 2dp).
 *
 * Norwegian convention uses non-breaking spaces for thousands and comma
 * for decimal; for now we use Intl 'nb-NO' locale which handles this.
 */
export function formatNok(n: number | null, opts: { dp?: number } = {}): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: opts.dp ?? 0,
    maximumFractionDigits: opts.dp ?? 2
  }).format(n);
}
