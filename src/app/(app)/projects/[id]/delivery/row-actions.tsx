'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  advanceItemDelivery,
  markItemException,
  resumeItemFromException
} from '@/server/actions/delivery';

const EXCEPTION_VALUES = [
  'on_hold',
  'backorder',
  'damaged',
  'substituted',
  'cancelled'
] as const;

/**
 * Per-row delivery actions:
 *
 *   In a linear state  → "Advance" primary + "Exception" disclosure
 *   In an exception    → "Resume" primary
 *   Already installed  → no action (Handover module takes it from here)
 *
 * Each action is one click; the form panels appear inline when needed
 * (audit notes required for exception + resume).
 */
export function DeliveryRowActions({
  itemId,
  projectId,
  status
}: {
  itemId: string;
  projectId: string;
  status: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'exception' | 'resume'>('idle');

  const isException = (EXCEPTION_VALUES as readonly string[]).includes(status);
  const canAdvance = !isException && status !== 'installed';

  function doAdvance() {
    setError(null);
    startTransition(async () => {
      const r = await advanceItemDelivery(itemId, projectId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  if (status === 'installed') {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0 min-w-[120px]">
      <div className="flex items-center gap-1">
        {canAdvance && (
          <button
            onClick={doAdvance}
            disabled={isPending}
            className="btn btn-ghost text-[11px] py-1 px-2"
            title={t('delivery.advance_title')}
          >
            {isPending ? '…' : t(`delivery.advance_to.${status}`)}
          </button>
        )}
        {!isException ? (
          <button
            onClick={() => {
              setMode('exception');
              setError(null);
            }}
            disabled={isPending}
            className="btn btn-ghost text-[11px] py-1 px-2 text-warn"
            title={t('delivery.exception_title')}
          >
            {t('delivery.exception_cta')}
          </button>
        ) : (
          <button
            onClick={() => {
              setMode('resume');
              setError(null);
            }}
            disabled={isPending}
            className="btn btn-ghost text-[11px] py-1 px-2 text-info"
          >
            {t('delivery.resume_cta')}
          </button>
        )}
      </div>

      {error && (
        <div className="text-[10px] text-warn max-w-[160px] text-right">{error}</div>
      )}

      {mode === 'exception' && (
        <ExceptionForm
          itemId={itemId}
          projectId={projectId}
          onCancel={() => setMode('idle')}
          onDone={() => {
            setMode('idle');
            router.refresh();
          }}
          isPending={isPending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
      {mode === 'resume' && (
        <ResumeForm
          itemId={itemId}
          projectId={projectId}
          onCancel={() => setMode('idle')}
          onDone={() => {
            setMode('idle');
            router.refresh();
          }}
          isPending={isPending}
          startTransition={startTransition}
          setError={setError}
        />
      )}
    </div>
  );
}

function ExceptionForm({
  itemId,
  projectId,
  onCancel,
  onDone,
  isPending,
  startTransition,
  setError
}: {
  itemId: string;
  projectId: string;
  onCancel: () => void;
  onDone: () => void;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  setError: (s: string | null) => void;
}) {
  const t = useTranslations();
  const [exception, setException] = useState<(typeof EXCEPTION_VALUES)[number]>('on_hold');
  const [note, setNote] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await markItemException(itemId, projectId, fd);
      if (!r.ok) setError(r.error);
      else onDone();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-line bg-surface rounded-md p-2 w-[260px] text-left space-y-2 mt-1"
    >
      <select
        name="exception"
        value={exception}
        onChange={(e) => setException(e.target.value as (typeof EXCEPTION_VALUES)[number])}
        className="w-full px-2 py-1 border border-line rounded text-[12px] bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {EXCEPTION_VALUES.map((v) => (
          <option key={v} value={v}>
            {t(`delivery.exception.${v}`)}
          </option>
        ))}
      </select>
      <textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('delivery.exception_note_placeholder')}
        className="w-full px-2 py-1 border border-line rounded text-[12px] bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost text-[11px] py-1 px-2"
          disabled={isPending}
        >
          {t('action.cancel')}
        </button>
        <button
          type="submit"
          className="btn btn-primary text-[11px] py-1 px-2"
          disabled={isPending || !note.trim()}
        >
          {isPending ? '…' : t('delivery.exception_submit')}
        </button>
      </div>
    </form>
  );
}

function ResumeForm({
  itemId,
  projectId,
  onCancel,
  onDone,
  isPending,
  startTransition,
  setError
}: {
  itemId: string;
  projectId: string;
  onCancel: () => void;
  onDone: () => void;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  setError: (s: string | null) => void;
}) {
  const t = useTranslations();
  const [resumeTo, setResumeTo] = useState('ordered');
  const [note, setNote] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await resumeItemFromException(itemId, projectId, fd);
      if (!r.ok) setError(r.error);
      else onDone();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-line bg-surface rounded-md p-2 w-[260px] text-left space-y-2 mt-1"
    >
      <select
        name="resumeTo"
        value={resumeTo}
        onChange={(e) => setResumeTo(e.target.value)}
        className="w-full px-2 py-1 border border-line rounded text-[12px] bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {['ordered', 'in_production', 'ready', 'shipped'].map((v) => (
          <option key={v} value={v}>
            {t(`delivery.resume_to.${v}`)}
          </option>
        ))}
      </select>
      <textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('delivery.resume_note_placeholder')}
        className="w-full px-2 py-1 border border-line rounded text-[12px] bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost text-[11px] py-1 px-2"
          disabled={isPending}
        >
          {t('action.cancel')}
        </button>
        <button
          type="submit"
          className="btn btn-primary text-[11px] py-1 px-2"
          disabled={isPending}
        >
          {isPending ? '…' : t('delivery.resume_submit')}
        </button>
      </div>
    </form>
  );
}
