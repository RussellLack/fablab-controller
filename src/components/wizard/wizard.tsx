'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cx } from '@/lib/utils';

/**
 * Generic drawer-mounted multi-step wizard.
 *
 * Each step declares its own `isValid(state)` predicate; the Next button is
 * disabled until that returns true. The wizard holds state in a single
 * object updated via patch (shallow merge). Submission is atomic — the
 * configured `onSubmit` is only called from the final step's Create
 * button. Cancelling mid-wizard discards everything.
 *
 * Drawer: 480px on desktop, full-width on narrow viewports (`max-w-full`).
 * Backdrop click and Escape both close.
 */

export type WizardStepDef<S> = {
  /** Stable id, used as React key. */
  id: string;
  /** i18n key for the step title shown in the indicator. */
  titleKey: string;
  /** Returns true when this step's required fields are filled. Drives Next. */
  isValid: (state: S) => boolean;
  /** Step body component; receives the state + an `update` patcher. */
  Component: React.ComponentType<{
    state: S;
    update: (patch: Partial<S>) => void;
  }>;
};

export type WizardResult = { ok: boolean; error?: string };

export type WizardProps<S> = {
  open: boolean;
  onClose: () => void;
  /** i18n key for the drawer title (e.g. "wizard.items.title"). */
  titleKey: string;
  /** Fresh state every time the wizard opens. */
  initialState: S;
  steps: WizardStepDef<S>[];
  /** Single-submit final action. */
  onSubmit: (state: S) => Promise<WizardResult>;
  /**
   * Optional secondary submit shown next to the main one on the final step
   * (e.g. "Create and add another"). Should return a fresh state to restart
   * the wizard with (typically preserving some fields like packageId).
   */
  onSubmitAndContinue?: {
    labelKey: string;
    handler: (state: S) => Promise<WizardResult & { nextState?: S }>;
  };
  /** Optional "skip to flat form" link in the footer. */
  flatFormHref?: string;
  /** Label override for the final Create button. */
  submitLabelKey?: string;
};

export function Wizard<S>({
  open,
  onClose,
  titleKey,
  initialState,
  steps,
  onSubmit,
  onSubmitAndContinue,
  flatFormHref,
  submitLabelKey
}: WizardProps<S>) {
  const t = useTranslations();
  const [state, setState] = useState<S>(initialState);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when the drawer opens fresh
  useEffect(() => {
    if (open) {
      setState(initialState);
      setStepIndex(0);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes (with confirm if dirty — but we accept atomic discard)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const step = steps[stepIndex];
  if (!step) return null;
  const StepComponent = step.Component;
  const isLast = stepIndex === steps.length - 1;
  const valid = step.isValid(state);

  const update = (patch: Partial<S>) =>
    setState((s) => ({ ...s, ...patch }));

  const handleNext = () => {
    if (!valid) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };
  const handleBack = () => {
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await onSubmit(state);
      if (!res.ok) {
        setError(res.error ?? t('wizard.generic_error'));
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAndContinue = async () => {
    if (!onSubmitAndContinue) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await onSubmitAndContinue.handler(state);
      if (!res.ok) {
        setError(res.error ?? t('wizard.generic_error'));
        return;
      }
      // Restart wizard with the returned state (or initial if not given)
      setState(res.nextState ?? initialState);
      setStepIndex(0);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 z-50 h-screen w-[480px] max-w-full bg-surface border-l border-line flex flex-col"
        role="dialog"
        aria-label={t(titleKey)}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-[14px]">{t(titleKey)}</h2>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink cursor-pointer text-xl leading-none w-6 h-6 flex items-center justify-center"
            aria-label={t('wizard.close')}
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-4 py-3 border-b border-line">
          <div className="flex items-center gap-1.5 mb-1.5">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={cx(
                  'h-1.5 flex-1 rounded-full',
                  i < stepIndex && 'bg-accent',
                  i === stepIndex && 'bg-accent',
                  i > stepIndex && 'bg-line'
                )}
              />
            ))}
          </div>
          <div className="text-[11px] text-ink-3 uppercase tracking-wider">
            {t('wizard.step_of', {
              current: stepIndex + 1,
              total: steps.length
            })}{' · '}
            <span className="text-ink-2">{t(step.titleKey)}</span>
          </div>
        </div>

        {/* Body — scrolls if content overflows */}
        <div className="flex-1 overflow-y-auto p-4">
          <StepComponent state={state} update={update} />
          {error && (
            <div className="mt-3 text-[12px] text-danger border border-danger bg-danger-soft rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface border-t border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={stepIndex === 0 ? onClose : handleBack}
              className="btn btn-ghost text-[12px]"
              disabled={submitting}
            >
              {stepIndex === 0 ? t('wizard.cancel') : t('wizard.back')}
            </button>
            <div className="flex items-center gap-2">
              {!isLast && (
                <button
                  onClick={handleNext}
                  disabled={!valid || submitting}
                  className={cx('btn btn-primary text-[12px]', !valid && 'opacity-50')}
                >
                  {t('wizard.next')} →
                </button>
              )}
              {isLast && onSubmitAndContinue && (
                <button
                  onClick={handleSubmitAndContinue}
                  disabled={!valid || submitting}
                  className={cx('btn btn-ghost text-[12px]', !valid && 'opacity-50')}
                >
                  {t(onSubmitAndContinue.labelKey)}
                </button>
              )}
              {isLast && (
                <button
                  onClick={handleSubmit}
                  disabled={!valid || submitting}
                  className={cx('btn btn-primary text-[12px]', !valid && 'opacity-50')}
                >
                  {submitting ? '…' : t(submitLabelKey ?? 'wizard.create')}
                </button>
              )}
            </div>
          </div>
          {flatFormHref && (
            <div className="mt-2 text-center">
              <Link href={flatFormHref} className="text-[11px] text-ink-3 hover:text-ink underline">
                {t('wizard.skip_to_flat_form')}
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
