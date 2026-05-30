'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sendApproval, recordApprovalResponse } from '@/server/actions/approvals';
import { cx } from '@/lib/utils';

/**
 * Inline action panel — shape changes with status:
 *   draft       → [Send for approval] button
 *   sent        → [Approve | With conditions | Reject] modal-style form
 *   anything else → nothing actionable (terminal states)
 */
export function ApprovalActions({
  approvalId,
  projectId,
  status
}: {
  approvalId: string;
  projectId: string;
  status: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [sending, startSend] = useTransition();
  const [showResponse, setShowResponse] = useState(false);

  const respondBound = recordApprovalResponse.bind(null, approvalId, projectId);
  const [respState, respAction, respPending] = useActionState(respondBound, null);

  if (status === 'draft') {
    return (
      <button
        className="btn btn-primary"
        disabled={sending}
        onClick={() => startSend(async () => {
          await sendApproval(approvalId, projectId);
          router.refresh();
        })}
      >
        {sending ? t('action.sending') : t('action.send_for_approval')}
      </button>
    );
  }

  if (status === 'sent_for_approval') {
    if (!showResponse) {
      return (
        <button className="btn btn-primary" onClick={() => setShowResponse(true)}>
          {t('action.record_response')}
        </button>
      );
    }
    return (
      <div className="card bg-info-soft border-info p-3 min-w-[320px]">
        <form action={respAction} className="space-y-2">
          {respState && !respState.ok && (
            <div className="text-[12px] text-danger">{respState.error}</div>
          )}
          <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
            <label className="text-[12px] text-info">{t('approval.decision')}</label>
            <select name="decision" required className="px-2 py-1.5 border border-line rounded-md text-[13px]">
              <option value="approved">{t('approval.decision.approved')}</option>
              <option value="approved_with_conditions">{t('approval.decision.with_conditions')}</option>
              <option value="rejected">{t('approval.decision.rejected')}</option>
            </select>
            <label className="text-[12px] text-info">{t('approval.channel')}</label>
            <select name="approvalChannel" required defaultValue="email" className="px-2 py-1.5 border border-line rounded-md text-[13px]">
              <option value="email">{t('approval.channel.email')}</option>
              <option value="portal">{t('approval.channel.portal')}</option>
              <option value="in_person">{t('approval.channel.in_person')}</option>
              <option value="phone_confirmed_in_writing">{t('approval.channel.phone')}</option>
              <option value="signed_document">{t('approval.channel.signed')}</option>
            </select>
          </div>
          <div>
            <label className="text-[12px] text-info block mb-1">{t('approval.conditions_label')}</label>
            <textarea name="conditions" rows={2} className="w-full px-2 py-1.5 border border-line rounded-md text-[13px]" placeholder={t('approval.conditions_placeholder')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowResponse(false)} className="btn btn-ghost">{t('action.cancel')}</button>
            <button type="submit" disabled={respPending} className={cx('btn btn-primary', respPending && 'opacity-60')}>
              {respPending ? t('action.saving') : t('action.log_response')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Terminal states — no further actions
  return null;
}
