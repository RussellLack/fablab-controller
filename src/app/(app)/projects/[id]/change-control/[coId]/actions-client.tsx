'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  startChangeOrderReview,
  sendChangeOrderForApproval,
  recordChangeOrderDecision,
  markChangeOrderImplemented,
  closeChangeOrder,
  withdrawChangeOrder
} from '@/server/actions/change-orders';

/**
 * State-aware action panel for a change order. Each status flips on a
 * different combination of buttons; secondary actions (Withdraw,
 * Re-price) live behind a small disclosure.
 *
 * "Update pricing" itself isn't in here — it's a separate form on the
 * detail page in a follow-up slice. For v1 the user prices at create
 * time via the wizard; if they didn't, the CO sits at `requested` and
 * the wizard can be re-opened (or a follow-up form added later).
 */
export function CoActions({
  coId,
  projectId,
  status,
  hasCost
}: {
  coId: string;
  projectId: string;
  status: string;
  /** Whether costImpactAmount is set — `priced` state requires it. */
  hasCost: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    null | 'withdraw' | 'decision' | 'send' | 'implement' | 'close' | 'review'
  >(null);

  function reset() {
    setConfirming(null);
    setError(null);
  }

  function withRefresh<T extends { ok: boolean; error?: string }>(p: Promise<T>) {
    startTransition(async () => {
      const r = await p;
      if (!r.ok) setError(r.error ?? 'Unknown error');
      else {
        reset();
        router.refresh();
      }
    });
  }

  // What primary action does the current status enable?
  const primary = pickPrimary(status, hasCost);

  return (
    <div className="flex flex-col items-end gap-2 min-w-[200px]">
      {primary && (
        <button
          onClick={() => {
            setConfirming(primary);
            setError(null);
          }}
          disabled={isPending}
          className="btn btn-primary"
        >
          {t(`change_order.action.${primary}`)}
        </button>
      )}

      {/* Secondary: Withdraw is available at every pre-implemented state. */}
      {!['implemented', 'closed', 'withdrawn'].includes(status) && (
        <button
          onClick={() => {
            setConfirming('withdraw');
            setError(null);
          }}
          disabled={isPending}
          className="btn btn-ghost text-[12px] text-warn"
        >
          {t('change_order.action.withdraw')}
        </button>
      )}

      {/* Inline confirmation panel — keeps the action a single click away
          but stops accidental status changes (every one of these is audit-
          relevant). */}
      {confirming === 'review' && (
        <ConfirmPanel
          bodyKey="change_order.confirm.review"
          submitKey="change_order.action.review"
          onCancel={reset}
          onConfirm={() => withRefresh(startChangeOrderReview(coId, projectId))}
          isPending={isPending}
          error={error}
          t={t}
        />
      )}
      {confirming === 'send' && (
        <ConfirmPanel
          bodyKey="change_order.confirm.send"
          submitKey="change_order.action.send"
          onCancel={reset}
          onConfirm={() => withRefresh(sendChangeOrderForApproval(coId, projectId))}
          isPending={isPending}
          error={error}
          t={t}
        />
      )}
      {confirming === 'decision' && (
        <DecisionPanel
          coId={coId}
          projectId={projectId}
          onCancel={reset}
          onDone={() => {
            reset();
            router.refresh();
          }}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
      {confirming === 'implement' && (
        <ConfirmPanel
          bodyKey="change_order.confirm.implement"
          submitKey="change_order.action.implement"
          onCancel={reset}
          onConfirm={() => withRefresh(markChangeOrderImplemented(coId, projectId))}
          isPending={isPending}
          error={error}
          t={t}
        />
      )}
      {confirming === 'close' && (
        <ConfirmPanel
          bodyKey="change_order.confirm.close"
          submitKey="change_order.action.close"
          onCancel={reset}
          onConfirm={() => withRefresh(closeChangeOrder(coId, projectId))}
          isPending={isPending}
          error={error}
          t={t}
        />
      )}
      {confirming === 'withdraw' && (
        <WithdrawPanel
          onCancel={reset}
          onSubmit={(reason) => {
            const fd = new FormData();
            fd.set('reason', reason);
            withRefresh(withdrawChangeOrder(coId, projectId, fd));
          }}
          isPending={isPending}
          error={error}
        />
      )}
    </div>
  );
}

function pickPrimary(
  status: string,
  hasCost: boolean
): 'review' | 'send' | 'decision' | 'implement' | 'close' | null {
  switch (status) {
    case 'requested':
      return 'review';
    case 'under_review':
      return hasCost ? 'send' : null; // need to price first
    case 'priced':
      return 'send';
    case 'sent_for_approval':
      return 'decision';
    case 'approved':
      return 'implement';
    case 'implemented':
      return 'close';
    default:
      return null;
  }
}

function ConfirmPanel({
  bodyKey,
  submitKey,
  onCancel,
  onConfirm,
  isPending,
  error,
  t
}: {
  bodyKey: string;
  submitKey: string;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
  error: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="border border-line bg-bg rounded-md p-3 w-full text-left space-y-2">
      <p className="text-[12px] leading-snug">{t(bodyKey)}</p>
      {error && (
        <div className="text-[11px] text-warn bg-warn-soft border border-warn/20 rounded px-2 py-1">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="btn btn-ghost text-[12px]"
          disabled={isPending}
        >
          {t('action.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="btn btn-primary text-[12px]"
          disabled={isPending}
        >
          {isPending ? '…' : t(submitKey)}
        </button>
      </div>
    </div>
  );
}

function DecisionPanel({
  coId,
  projectId,
  onCancel,
  onDone,
  isPending,
  startTransition
}: {
  coId: string;
  projectId: string;
  onCancel: () => void;
  onDone: () => void;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [finalDecision, setFinalDecision] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await recordChangeOrderDecision(coId, projectId, fd);
      if (!r.ok) setError(r.error);
      else onDone();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-line bg-bg rounded-md p-3 w-full text-left space-y-2"
    >
      <p className="text-[12px] leading-snug">
        {t('change_order.confirm.decision')}
      </p>
      <div className="flex gap-3 text-[12px]">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="decision"
            value="approved"
            checked={decision === 'approved'}
            onChange={() => setDecision('approved')}
          />
          {t('change_order.decision.approved')}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="decision"
            value="rejected"
            checked={decision === 'rejected'}
            onChange={() => setDecision('rejected')}
          />
          {t('change_order.decision.rejected')}
        </label>
      </div>
      <textarea
        name="finalDecision"
        rows={2}
        value={finalDecision}
        onChange={(e) => setFinalDecision(e.target.value)}
        placeholder={
          decision === 'rejected'
            ? t('change_order.decision.reason_required')
            : t('change_order.decision.reason_optional')
        }
        className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[12px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
      />
      {error && (
        <div className="text-[11px] text-warn bg-warn-soft border border-warn/20 rounded px-2 py-1">
          {error}
        </div>
      )}
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
          disabled={isPending || (decision === 'rejected' && !finalDecision.trim())}
        >
          {isPending ? '…' : t('change_order.action.record_decision')}
        </button>
      </div>
    </form>
  );
}

function WithdrawPanel({
  onCancel,
  onSubmit,
  isPending,
  error
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
  error: string | null;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState('');
  return (
    <div className="border border-line bg-bg rounded-md p-3 w-full text-left space-y-2">
      <p className="text-[12px] leading-snug">{t('change_order.confirm.withdraw')}</p>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('change_order.withdraw_reason_placeholder')}
        className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[12px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
      />
      {error && (
        <div className="text-[11px] text-warn bg-warn-soft border border-warn/20 rounded px-2 py-1">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="btn btn-ghost text-[12px]"
          disabled={isPending}
        >
          {t('action.cancel')}
        </button>
        <button
          onClick={() => onSubmit(reason.trim())}
          className="btn btn-primary text-[12px] text-warn"
          disabled={isPending || !reason.trim()}
        >
          {isPending ? '…' : t('change_order.action.withdraw')}
        </button>
      </div>
    </div>
  );
}
