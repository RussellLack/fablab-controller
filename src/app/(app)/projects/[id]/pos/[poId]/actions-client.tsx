'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { issuePurchaseOrder } from '@/server/actions/procurement';
import { cx } from '@/lib/utils';

/**
 * Issue button — calls issuePurchaseOrder which itself calls the
 * canIssuePurchaseOrder gate. If the gate refuses (R3 violation),
 * a toast-like alert surfaces the reason.
 */
export function PoActions({
  poId,
  projectId,
  status,
  blocker
}: {
  poId: string;
  projectId: string;
  status: string;
  blocker: null | { reason: string; missingItemIds: string[]; needsAuthorisingApproval: boolean };
}) {
  const t = useTranslations();
  const router = useRouter();
  const [issuing, startIssue] = useTransition();

  if (status !== 'draft' && status !== 'ready_for_review') return null;
  const blocked = !!blocker;

  return (
    <button
      onClick={() => {
        if (blocked) return;
        startIssue(async () => {
          const res = await issuePurchaseOrder(poId, projectId);
          if (res.ok) router.refresh();
          else alert(res.error);
        });
      }}
      disabled={issuing || blocked}
      className={cx(
        'btn btn-primary',
        (issuing || blocked) && 'opacity-50 cursor-not-allowed',
        !blocked && 'bg-accent border-accent hover:bg-accent/90'
      )}
      title={blocked ? blocker!.reason : ''}
    >
      {issuing ? t('action.issuing') : `⚠ ${t('action.issue_po')}`}
    </button>
  );
}
