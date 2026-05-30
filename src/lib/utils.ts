/** Tiny class-name joiner. shadcn-style without the cn() dep. */
export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Format a money number for display. Locale-aware. */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = 'NOK',
  locale: string = 'nb-NO'
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

/** Format a date for display. */
export function formatDate(d: Date | string | null | undefined, locale: string = 'nb-NO'): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
