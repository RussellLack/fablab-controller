'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  recordPoConfirmation,
  clearPoConfirmation
} from '@/server/actions/procurement';

/**
 * Sidebar card on the PO detail page that tracks the vendor's
 * confirmation of acceptance (the 5-business-day clause from the
 * §2 PO template).
 *
 * Three states:
 *   - status === 'issued' & no confirmedAt: show the "Record vendor
 *     confirmation" inline form (date, channel, notes).
 *   - status === 'confirmed': show the ✓ confirmation row with date +
 *     channel + notes + a small "Undo" affordance for mistakes.
 *   - any other status: not rendered (parent decides whether to mount).
 */

const CHANNELS = ['email', 'portal', 'phone', 'in_person', 'letter', 'other'] as const;
type Channel = (typeof CHANNELS)[number];

type Props = {
  poId: string;
  projectId: string;
  status: string;
  confirmedAt: string | null;        // YYYY-MM-DD
  issuedAt: string | null;           // YYYY-MM-DD — used to compute "X days since issue"
  /** Existing inbound po_confirmation comm so we can render channel + notes. */
  latestConfirmationComm: {
    channel: Channel;
    body: string | null;
  } | null;
};

export function PoConfirmationCard({
  poId,
  projectId,
  status,
  confirmedAt,
  issuedAt,
  latestConfirmationComm
}: Props) {
  const t = useTranslations();
  if (status !== 'issued' && status !== 'confirmed') return null;

  if (status === 'confirmed' && confirmedAt) {
    return <ConfirmedState
      poId={poId}
      projectId={projectId}
      confirmedAt={confirmedAt}
      latestConfirmationComm={latestConfirmationComm}
      t={t}
    />;
  }

  return <IssuedState
    poId={poId}
    projectId={projectId}
    issuedAt={issuedAt}
    t={t}
  />;
}

function ConfirmedState({
  poId,
  projectId,
  confirmedAt,
  latestConfirmationComm,
  t
}: {
  poId: string;
  projectId: string;
  confirmedAt: string;
  latestConfirmationComm: { channel: Channel; body: string | null } | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function doUndo() {
    if (!window.confirm(t('po_confirmation.undo_confirm'))) return;
    setError(null);
    startTransition(async () => {
      const r = await clearPoConfirmation(poId, projectId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="card border-l-2 border-ok">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="card-title">{t('po_confirmation.title')}</h3>
        <span className="pill text-ok bg-ok-soft">
          {t('po_confirmation.pill_confirmed')}
        </span>
      </div>
      <p className="text-[13px] text-ok font-semibold">
        ✓ {t('po_confirmation.confirmed_on', { date: confirmedAt })}
      </p>
      {latestConfirmationComm && (
        <p className="text-[12px] text-ink-2 mt-1">
          {t(`po_confirmation.channel_${latestConfirmationComm.channel}`)}
        </p>
      )}
      {latestConfirmationComm?.body && (
        <p className="text-[12px] text-ink-2 mt-2 whitespace-pre-wrap leading-snug">
          {latestConfirmationComm.body}
        </p>
      )}
      {error && (
        <div className="text-[11px] text-warn mt-2">{error}</div>
      )}
      <button
        onClick={doUndo}
        disabled={isPending}
        className="btn btn-ghost text-[11px] mt-2 px-2 py-1"
      >
        {isPending ? t('po_confirmation.undoing') : t('po_confirmation.undo')}
      </button>
    </div>
  );
}

function IssuedState({
  poId,
  projectId,
  issuedAt,
  t
}: {
  poId: string;
  projectId: string;
  issuedAt: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'form'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Days since issue — purely for the doctrine reminder.
  const daysSinceIssue = issuedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(issuedAt).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      )
    : null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await recordPoConfirmation(poId, projectId, fd);
      if (!r.ok) setError(r.error);
      else {
        setMode('idle');
        router.refresh();
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="card-title">{t('po_confirmation.title')}</h3>
        <span className="pill text-warn bg-warn-soft">
          {t('po_confirmation.pill_awaiting')}
        </span>
      </div>
      <p className="text-[12px] text-ink-2 leading-snug">
        {t('po_confirmation.awaiting_body')}
      </p>
      {daysSinceIssue !== null && (
        <p className="text-[11px] text-ink-3 mt-1">
          {t('po_confirmation.days_since_issue', { n: daysSinceIssue })}
        </p>
      )}

      {mode === 'idle' ? (
        <button
          onClick={() => {
            setMode('form');
            setError(null);
          }}
          className="btn btn-primary text-[12px] mt-3"
          disabled={isPending}
        >
          {t('po_confirmation.record_cta')}
        </button>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <div>
            <label className="block text-[11px] text-ink-2 mb-1 uppercase tracking-wider">
              {t('po_confirmation.field_date')}
            </label>
            <input
              type="date"
              name="confirmedAt"
              required
              defaultValue={today}
              max={today}
              className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-[11px] text-ink-2 mb-1 uppercase tracking-wider">
              {t('po_confirmation.field_channel')}
            </label>
            <select
              name="channel"
              defaultValue="email"
              className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`po_confirmation.channel_${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-ink-2 mb-1 uppercase tracking-wider">
              {t('po_confirmation.field_notes')}
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder={t('po_confirmation.notes_placeholder')}
              className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
            />
          </div>
          {error && (
            <div className="text-[12px] text-warn bg-warn-soft border border-warn/20 rounded px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setError(null);
              }}
              className="btn btn-ghost text-[12px]"
              disabled={isPending}
            >
              {t('action.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary text-[12px]"
              disabled={isPending}
            >
              {isPending
                ? t('po_confirmation.recording')
                : t('po_confirmation.record_submit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
