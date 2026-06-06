'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  startMitigation,
  markRiskMitigated,
  acceptRisk,
  closeRisk,
  reopenRisk
} from '@/server/actions/risk';

/**
 * State-aware Risk actions. Each status surfaces the single most
 * common forward transition + an accept-the-risk option where it
 * applies.
 *
 *   identified | assessed       → Plan mitigation (link to edit page later
 *                                 — for v1 we surface Start mitigation
 *                                 only if a plan already exists, plus
 *                                 Accept)
 *   mitigation_planned          → Start mitigation, Accept
 *   mitigation_in_progress      → Mark mitigated (form for residual L/I)
 *   mitigated                   → Close, Re-assess
 *   accepted                    → Close
 *   closed                      → Reopen
 */
export function RiskActions({
  riskId,
  projectId,
  status
}: {
  riskId: string;
  projectId: string;
  status: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'mitigated' | 'accept'>('idle');

  function withRefresh(p: Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await p;
      if (!r.ok) setError(r.error ?? 'Error');
      else {
        setMode('idle');
        router.refresh();
      }
    });
  }

  function withFormRefresh(p: Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await p;
      if (!r.ok) setError(r.error ?? 'Error');
      else {
        setMode('idle');
        router.refresh();
      }
    });
  }

  const buttons: JSX.Element[] = [];

  if (status === 'mitigation_planned') {
    buttons.push(
      <button
        key="start"
        onClick={() => withRefresh(startMitigation(riskId, projectId))}
        disabled={isPending}
        className="btn btn-primary text-[12px]"
      >
        {t('risk.action.start_mitigation')}
      </button>
    );
  }
  if (status === 'mitigation_in_progress') {
    buttons.push(
      <button
        key="mitigated"
        onClick={() => setMode('mitigated')}
        disabled={isPending}
        className="btn btn-primary text-[12px]"
      >
        {t('risk.action.mark_mitigated')}
      </button>
    );
  }
  if (
    ['identified', 'assessed', 'mitigation_planned'].includes(status)
  ) {
    buttons.push(
      <button
        key="accept"
        onClick={() => setMode('accept')}
        disabled={isPending}
        className="btn btn-ghost text-[12px] text-warn"
      >
        {t('risk.action.accept')}
      </button>
    );
  }
  if (['mitigated', 'accepted'].includes(status)) {
    buttons.push(
      <button
        key="close"
        onClick={() => withRefresh(closeRisk(riskId, projectId))}
        disabled={isPending}
        className="btn btn-primary text-[12px]"
      >
        {t('risk.action.close')}
      </button>
    );
  }
  if (status === 'closed') {
    buttons.push(
      <button
        key="reopen"
        onClick={() => withRefresh(reopenRisk(riskId, projectId))}
        disabled={isPending}
        className="btn btn-ghost text-[12px]"
      >
        {t('risk.action.reopen')}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 min-w-[200px]">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {buttons}
      </div>
      {error && (
        <div className="text-[11px] text-warn bg-warn-soft border border-warn/20 rounded px-2 py-1">
          {error}
        </div>
      )}

      {mode === 'mitigated' && (
        <ResidualForm
          riskId={riskId}
          projectId={projectId}
          onCancel={() => setMode('idle')}
          onSubmit={(fd) => withFormRefresh(markRiskMitigated(riskId, projectId, fd))}
          isPending={isPending}
        />
      )}
      {mode === 'accept' && (
        <AcceptForm
          riskId={riskId}
          projectId={projectId}
          onCancel={() => setMode('idle')}
          onSubmit={(fd) => withFormRefresh(acceptRisk(riskId, projectId, fd))}
          isPending={isPending}
        />
      )}
    </div>
  );
}

function ResidualForm({
  onCancel,
  onSubmit,
  isPending
}: {
  riskId: string;
  projectId: string;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
}) {
  const t = useTranslations();
  const [residualL, setResidualL] = useState(1);
  const [residualI, setResidualI] = useState(1);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-line bg-bg rounded-md p-3 w-full text-left space-y-2"
    >
      <p className="text-[12px] leading-snug">{t('risk.residual_intro')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-ink-2 mb-1 uppercase tracking-wider">
            {t('risk.field_likelihood')} (1–5)
          </label>
          <input
            type="number"
            min={1}
            max={5}
            name="residualLikelihood"
            value={residualL}
            onChange={(e) => setResidualL(Number(e.target.value))}
            className="w-full px-2 py-1 border border-line rounded text-[13px]"
          />
        </div>
        <div>
          <label className="block text-[11px] text-ink-2 mb-1 uppercase tracking-wider">
            {t('risk.field_impact')} (1–5)
          </label>
          <input
            type="number"
            min={1}
            max={5}
            name="residualImpact"
            value={residualI}
            onChange={(e) => setResidualI(Number(e.target.value))}
            className="w-full px-2 py-1 border border-line rounded text-[13px]"
          />
        </div>
      </div>
      <p className="text-[11px] text-ink-3">
        {t('risk.residual_preview')}: {residualL * residualI}
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
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
          {isPending ? '…' : t('risk.action.mark_mitigated')}
        </button>
      </div>
    </form>
  );
}

function AcceptForm({
  onCancel,
  onSubmit,
  isPending
}: {
  riskId: string;
  projectId: string;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  isPending: boolean;
}) {
  const t = useTranslations();
  const [note, setNote] = useState('');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-line bg-bg rounded-md p-3 w-full text-left space-y-2"
    >
      <p className="text-[12px] leading-snug">{t('risk.accept_intro')}</p>
      <textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('risk.accept_note_placeholder')}
        className="w-full px-2 py-1 border border-line rounded text-[12px] resize-none"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost text-[12px]"
          disabled={isPending}
        >
          {t('action.cancel')}
        </button>
        <button
          type="submit"
          className="btn btn-primary text-[12px]"
          disabled={isPending || !note.trim()}
        >
          {isPending ? '…' : t('risk.action.accept')}
        </button>
      </div>
    </form>
  );
}
