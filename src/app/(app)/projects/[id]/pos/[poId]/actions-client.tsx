'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { issuePurchaseOrderAndSend } from '@/server/actions/procurement';
import { cx } from '@/lib/utils';

/**
 * Issue button — calls issuePurchaseOrderAndSend, which:
 *   1. Runs the R3 gate (canIssuePurchaseOrder) inside.
 *   2. Transitions the PO to `issued` (BINDING).
 *   3. Emails the vendor under the team member's Gmail account, CC=Siv
 *      (unless author IS Siv), Bcc=self, with any po_attachments
 *      embedded as multipart/mixed.
 *
 * If the issue itself fails (R3 violation), an alert surfaces the reason
 * and nothing is sent. If issue succeeds but email fails, the PO stays
 * issued and the result banner surfaces the email error for manual resend.
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
  const [result, setResult] = useState<null | {
    issued?: boolean;
    emailSent?: boolean;
    emailError?: string;
  }>(null);

  if (status !== 'draft' && status !== 'ready_for_review') {
    // Once issued, surface any persistent emailError banner here too.
    return result ? <ResultBanner result={result} /> : null;
  }
  const blocked = !!blocker;

  return (
    <div>
      <button
        onClick={() => {
          if (blocked) return;
          startIssue(async () => {
            const res = await issuePurchaseOrderAndSend(poId, projectId);
            setResult({
              issued: 'issued' in res ? res.issued : false,
              emailSent: 'emailSent' in res ? res.emailSent : false,
              emailError: 'emailError' in res ? res.emailError : undefined
            });
            if (res.ok || ('issued' in res && res.issued)) {
              router.refresh();
            } else if (!res.ok) {
              // Pre-issue failure (R3 etc.) — surface as alert
              alert(res.ok ? '' : res.error);
            }
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
        {issuing ? t('action.issuing') : `⚠ ${t('action.issue_po_and_send')}`}
      </button>
      {result && <ResultBanner result={result} />}
    </div>
  );
}

function ResultBanner({
  result
}: {
  result: { issued?: boolean; emailSent?: boolean; emailError?: string };
}) {
  const t = useTranslations();
  if (!result.issued) return null;
  if (result.emailSent) {
    return (
      <div className="mt-3 border border-ok bg-ok-soft text-ok rounded-md px-3 py-2 text-[12px]">
        {t('po.issue_and_send_ok')}
      </div>
    );
  }
  if (result.emailError) {
    return (
      <div className="mt-3 border border-warn bg-warn-soft text-warn rounded-md px-3 py-2 text-[12px]">
        <div className="font-semibold">{t('po.issue_ok_email_failed')}</div>
        <div className="mt-1">{result.emailError}</div>
      </div>
    );
  }
  return null;
}
