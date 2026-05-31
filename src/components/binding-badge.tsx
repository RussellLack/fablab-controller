'use client';

import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

/**
 * The visual contract for binding state, per `20-doc-templates-best-practice.md`
 * and Phase 1.5 of `21-ux-design.md`.
 *
 * Renders a small persistent pill that survives next to the reference / status
 * on every PO, RFQ, and Approval. The strings already existed in the messages
 * files — this component centralises the *visual* treatment so users see the
 * same shape for the same meaning everywhere in the app.
 *
 *   - `binding`        — red, bold; PO is issued and the contract is live.
 *   - `not-binding`    — neutral; PO in pre-issue or quote selected, no commitment.
 *   - `not-an-order`   — neutral; RFQ is a price request, not an order.
 *   - `awaiting`       — amber; Approval has been sent, response pending.
 *
 * Client component so it can be used inside both server and client
 * components (NextIntlClientProvider is mounted at the app root).
 */
export type BindingState = 'binding' | 'not-binding' | 'not-an-order' | 'awaiting';

const TONES: Record<BindingState, string> = {
  'binding':      'bg-danger text-surface border border-danger',
  'not-binding':  'bg-bg text-ink-3 border border-line-strong',
  'not-an-order': 'bg-bg text-ink-3 border border-line-strong',
  'awaiting':     'bg-warn-soft text-warn border border-warn'
};

const LABEL_KEYS: Record<BindingState, string> = {
  'binding':      'binding.binding',
  'not-binding':  'binding.not_binding',
  'not-an-order': 'binding.not_an_order',
  'awaiting':     'binding.awaiting_written'
};

export function BindingBadge({ state, className }: { state: BindingState; className?: string }) {
  const t = useTranslations();
  return (
    <span
      className={cx(
        'inline-block text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-sm',
        TONES[state],
        className
      )}
    >
      {t(LABEL_KEYS[state])}
    </span>
  );
}

/** Convenience: map a PO status to its binding state. */
export function poStatusToBinding(status: string): BindingState {
  if (
    status === 'issued' ||
    status === 'confirmed' ||
    status === 'partially_fulfilled' ||
    status === 'fulfilled'
  ) {
    return 'binding';
  }
  return 'not-binding';
}
