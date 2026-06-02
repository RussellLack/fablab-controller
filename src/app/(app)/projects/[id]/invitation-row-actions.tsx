'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  resendProjectCustomerInvitation,
  revokeProjectCustomerInvitation
} from '@/server/actions/customer-portal';

/**
 * Per-row actions on the Customer activity card. Resend re-fires the
 * magic link; Revoke soft-deletes the invitation row. Revoked rows
 * collapse to a "Revoked" pill with no actions.
 */
export function InvitationRowActions({
  invitationId,
  revoked
}: {
  invitationId: string;
  revoked: boolean;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (revoked) return null;

  function doResend() {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const r = await resendProjectCustomerInvitation(invitationId);
      if (r.ok) setFlash(t('customer_portal.row_resent'));
      else setError(r.error);
    });
  }

  function doRevoke() {
    if (!window.confirm(t('customer_portal.revoke_confirm'))) return;
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const r = await revokeProjectCustomerInvitation(invitationId);
      if (!r.ok) setError(r.error);
      // On success, the server revalidates and the row re-renders as "revoked".
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-1">
        <button
          onClick={doResend}
          disabled={isPending}
          className="btn btn-ghost text-[11px] py-1 px-2"
        >
          {isPending ? t('customer_portal.row_sending') : t('customer_portal.row_resend')}
        </button>
        <button
          onClick={doRevoke}
          disabled={isPending}
          className="btn btn-ghost text-[11px] py-1 px-2 text-warn hover:text-warn"
        >
          {t('customer_portal.row_revoke')}
        </button>
      </div>
      {flash && <div className="text-[10px] text-ok">{flash}</div>}
      {error && <div className="text-[10px] text-warn max-w-[180px] text-right">{error}</div>}
    </div>
  );
}
