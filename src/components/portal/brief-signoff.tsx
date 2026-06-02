'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { postBriefSignoff } from '@/server/actions/brief-signoff';

/**
 * Customer-facing brief sign-off card on the portal brief page.
 *
 * Three states drive the UI:
 *   - `none` — no sign-off has ever been recorded for this customer.
 *     Show the sign-off CTA with binding language.
 *   - `current` — the latest sign-off's snapshot equals the brief as it
 *     stands today. Show the green ✓ confirmation + date.
 *   - `drifted` — a sign-off exists, but the staff have edited the brief
 *     since. Show a warning + the CTA so the customer can re-sign.
 *
 * The sign-off doctrine is from `00-industry-best-practices.md` §22
 * ("approval is the contract") — verbal sign-off doesn't count;
 * written confirmation does. Wording here is deliberately load-bearing.
 *
 * Two-step confirm: clicking the CTA reveals a confirmation panel
 * with explicit binding language and a final Confirm/Cancel pair, so
 * the customer never sign-offs by accident.
 */

export type BriefSignoffState = 'none' | 'current' | 'drifted';

type Props = {
  projectId: string;
  state: BriefSignoffState;
  /** ISO timestamp of latest sign-off if any. */
  latestSignedAt: string | null;
  /** Whether the current user has an active invitation — false suppresses CTA. */
  canSign: boolean;
};

export function BriefSignoff({
  projectId,
  state,
  latestSignedAt,
  canSign
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState<'idle' | 'confirming'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function doSignoff() {
    setError(null);
    startTransition(async () => {
      const r = await postBriefSignoff(projectId);
      if (!r.ok) {
        setError(r.error);
      } else {
        setStep('idle');
        router.refresh();
      }
    });
  }

  // The "current" green state shows the confirmation and offers a
  // re-sign affordance for completeness (e.g. customer wants to re-
  // confirm after a comment exchange).
  if (state === 'current') {
    return (
      <div className="card border-l-2 border-ok bg-ok-soft/30">
        <h3 className="card-title mb-2">{t('brief_signoff.title')}</h3>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-ok text-[14px]">✓</span>
          <span className="text-[13px] font-semibold text-ok">
            {t('brief_signoff.state_signed')}
          </span>
        </div>
        {latestSignedAt && (
          <p className="text-[12px] text-ink-2">
            {t('brief_signoff.signed_at', {
              date: formatTimestamp(latestSignedAt)
            })}
          </p>
        )}
        <p className="text-[12px] text-ink-2 mt-2 leading-snug">
          {t('brief_signoff.signed_body')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`card ${
        state === 'drifted' ? 'border-l-2 border-warn bg-warn-soft/20' : ''
      }`}
    >
      <h3 className="card-title mb-2">{t('brief_signoff.title')}</h3>

      {state === 'drifted' && (
        <div className="mb-3">
          <div className="text-[13px] font-semibold text-warn mb-1">
            {t('brief_signoff.state_drifted')}
          </div>
          {latestSignedAt && (
            <p className="text-[12px] text-ink-2">
              {t('brief_signoff.previous_signed_at', {
                date: formatTimestamp(latestSignedAt)
              })}
            </p>
          )}
          <p className="text-[12px] text-ink-2 mt-1 leading-snug">
            {t('brief_signoff.drifted_body')}
          </p>
        </div>
      )}

      {state === 'none' && (
        <p className="text-[12px] text-ink-2 mb-3 leading-snug">
          {t('brief_signoff.intro')}
        </p>
      )}

      {!canSign ? (
        <p className="text-[12px] text-ink-3 italic">
          {t('brief_signoff.cannot_sign')}
        </p>
      ) : step === 'idle' ? (
        <button
          onClick={() => {
            setStep('confirming');
            setError(null);
          }}
          className="btn btn-primary text-[13px]"
          disabled={isPending}
        >
          {state === 'drifted'
            ? t('brief_signoff.resign_cta')
            : t('brief_signoff.sign_cta')}
        </button>
      ) : (
        <div className="border border-line rounded-md bg-bg p-3 space-y-3">
          <p className="text-[13px] leading-snug">
            {t('brief_signoff.confirm_body')}
          </p>
          <p className="text-[11px] text-ink-3 leading-snug">
            {t('brief_signoff.confirm_legal')}
          </p>
          {error && (
            <div className="text-[12px] text-warn bg-warn-soft border border-warn/20 rounded px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setError(null);
              }}
              className="btn btn-ghost text-[12px]"
              disabled={isPending}
            >
              {t('action.cancel')}
            </button>
            <button
              type="button"
              onClick={doSignoff}
              className="btn btn-primary text-[12px]"
              disabled={isPending}
            >
              {isPending
                ? t('brief_signoff.signing')
                : t('brief_signoff.confirm_submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
