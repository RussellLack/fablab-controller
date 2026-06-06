'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  acknowledgeRecommendation,
  resolveRecommendation,
  dismissRecommendation
} from '@/server/actions/coach-recommendations';

/**
 * Per-row lifecycle actions on the Coach dashboard.
 *
 * `open` recs show: Ack | Resolve | Dismiss
 * `acknowledged` recs show: Resolve | Dismiss
 *
 * Each action is one click. Errors surface as a tiny inline note that
 * disappears on the next successful action.
 */
export function CoachDashboardActions({
  recId,
  projectId,
  status
}: {
  recId: string;
  projectId: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setError(r.error ?? 'Error');
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {status === 'open' && (
        <button
          onClick={() => run(() => acknowledgeRecommendation(recId, projectId))}
          disabled={isPending}
          className="btn btn-ghost text-[10px] px-1.5 py-1"
          title={t('coach_dashboard.action.ack_title')}
        >
          {t('coach_dashboard.action.ack')}
        </button>
      )}
      <button
        onClick={() => run(() => resolveRecommendation(recId, projectId))}
        disabled={isPending}
        className="btn btn-ghost text-[10px] px-1.5 py-1 text-ok"
        title={t('coach_dashboard.action.resolve_title')}
      >
        {t('coach_dashboard.action.resolve')}
      </button>
      <button
        onClick={() => run(() => dismissRecommendation(recId, projectId))}
        disabled={isPending}
        className="btn btn-ghost text-[10px] px-1.5 py-1 text-ink-3"
        title={t('coach_dashboard.action.dismiss_title')}
      >
        {t('coach_dashboard.action.dismiss')}
      </button>
      {error && (
        <div className="text-[10px] text-warn max-w-[120px] text-right">
          {error}
        </div>
      )}
    </div>
  );
}
