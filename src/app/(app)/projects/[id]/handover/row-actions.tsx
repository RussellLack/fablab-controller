'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  signOffItem,
  raiseSnag,
  unsignItem
} from '@/server/actions/handover';

/**
 * Per-row Handover actions:
 *   installed   → Sign off + Raise snag (inline forms)
 *   signed_off  → Unsign (audit-friendly undo for accidental sign-off)
 */
export function HandoverRowActions({
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
  const [mode, setMode] = useState<'idle' | 'signoff' | 'snag'>('idle');

  function doUnsign() {
    if (!window.confirm(t('handover.unsign_confirm'))) return;
    setError(null);
    startTransition(async () => {
      const r = await unsignItem(itemId, projectId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  if (status === 'signed_off') {
    return (
      <div className="flex items-end gap-1 shrink-0">
        <button
          onClick={doUnsign}
          disabled={isPending}
          className="btn btn-ghost text-[11px] py-1 px-2 text-ink-3"
          title={t('handover.unsign_title')}
        >
          {isPending ? '…' : t('handover.unsign_cta')}
        </button>
      </div>
    );
  }

  if (status !== 'installed') return null;

  return (
    <div className="flex flex-col items-end gap-1 shrink-0 min-w-[140px]">
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            setMode('signoff');
            setError(null);
          }}
          disabled={isPending}
          className="btn btn-primary text-[11px] py-1 px-2"
        >
          {t('handover.signoff_cta')}
        </button>
        <button
          onClick={() => {
            setMode('snag');
            setError(null);
          }}
          disabled={isPending}
          className="btn btn-ghost text-[11px] py-1 px-2 text-warn"
        >
          {t('handover.snag_cta')}
        </button>
      </div>

      {error && (
        <div className="text-[10px] text-warn max-w-[160px] text-right">{error}</div>
      )}

      {mode === 'signoff' && (
        <NoteForm
          itemId={itemId}
          projectId={projectId}
          serverAction={signOffItem}
          noteRequired={false}
          placeholderKey="handover.signoff_note_placeholder"
          submitKey="handover.signoff_submit"
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
      {mode === 'snag' && (
        <NoteForm
          itemId={itemId}
          projectId={projectId}
          serverAction={raiseSnag}
          noteRequired={true}
          placeholderKey="handover.snag_note_placeholder"
          submitKey="handover.snag_submit"
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

function NoteForm({
  itemId,
  projectId,
  serverAction,
  noteRequired,
  placeholderKey,
  submitKey,
  onCancel,
  onDone,
  isPending,
  startTransition,
  setError
}: {
  itemId: string;
  projectId: string;
  serverAction: (id: string, pid: string, fd: FormData) => Promise<{ ok: boolean; error?: string }>;
  noteRequired: boolean;
  placeholderKey: string;
  submitKey: string;
  onCancel: () => void;
  onDone: () => void;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  setError: (s: string | null) => void;
}) {
  const t = useTranslations();
  const [note, setNote] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await serverAction(itemId, projectId, fd);
      if (!r.ok) setError(r.error ?? 'Error');
      else onDone();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-line bg-surface rounded-md p-2 w-[260px] text-left space-y-2 mt-1"
    >
      <textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t(placeholderKey)}
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
          disabled={isPending || (noteRequired && !note.trim())}
        >
          {isPending ? '…' : t(submitKey)}
        </button>
      </div>
    </form>
  );
}
