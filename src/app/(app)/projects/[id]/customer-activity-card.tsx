import { getTranslations } from 'next-intl/server';
import { desc, eq } from 'drizzle-orm';
import { db, projectCustomerInvitations } from '@/db';
import { formatDate } from '@/lib/utils';
import { InviteCustomerLauncher } from './invite-customer-launcher';
import { InvitationRowActions } from './invitation-row-actions';

/**
 * Staff-side card on the project Brief page showing every customer
 * invitation for this project. Pairs with the "+ Invite customer"
 * launcher to drive the W4b customer portal access list.
 *
 * Each row shows status (pending / joined / revoked) + the optional
 * note + Resend / Revoke actions. Per `24-customer-portal.md` §designer-
 * visibility, this surfaces "who has been invited and have they signed
 * in" without requiring staff to check Supabase Auth directly.
 */
export async function CustomerActivityCard({ projectId }: { projectId: string }) {
  const t = await getTranslations();

  const invitations = await db
    .select({
      id: projectCustomerInvitations.id,
      email: projectCustomerInvitations.email,
      note: projectCustomerInvitations.note,
      invitedAt: projectCustomerInvitations.invitedAt,
      acceptedAt: projectCustomerInvitations.acceptedAt,
      revokedAt: projectCustomerInvitations.revokedAt
    })
    .from(projectCustomerInvitations)
    .where(eq(projectCustomerInvitations.projectId, projectId))
    .orderBy(desc(projectCustomerInvitations.invitedAt));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="card-title">{t('customer_portal.activity_heading')}</h3>
        <InviteCustomerLauncher projectId={projectId} />
      </div>

      {invitations.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic">
          {t('customer_portal.activity_empty')}
        </p>
      ) : (
        <ul className="divide-y divide-line -mx-[18px]">
          {invitations.map((inv) => {
            const status: 'revoked' | 'joined' | 'pending' = inv.revokedAt
              ? 'revoked'
              : inv.acceptedAt
                ? 'joined'
                : 'pending';
            return (
              <li key={inv.id} className="px-[18px] py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium truncate">{inv.email}</span>
                    <StatusPill status={status} label={t(`customer_portal.status_${status}`)} />
                  </div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    {status === 'joined' && inv.acceptedAt
                      ? t('customer_portal.joined_on', { date: formatDate(inv.acceptedAt) })
                      : status === 'revoked' && inv.revokedAt
                        ? t('customer_portal.revoked_on', { date: formatDate(inv.revokedAt) })
                        : t('customer_portal.invited_on', { date: formatDate(inv.invitedAt) })}
                  </div>
                  {inv.note && (
                    <div className="text-[12px] text-ink-2 mt-1 whitespace-pre-wrap">
                      “{inv.note}”
                    </div>
                  )}
                </div>
                <InvitationRowActions
                  invitationId={inv.id}
                  revoked={status === 'revoked'}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusPill({
  status,
  label
}: {
  status: 'pending' | 'joined' | 'revoked';
  label: string;
}) {
  const colour =
    status === 'joined'
      ? 'text-ok bg-ok-soft'
      : status === 'revoked'
        ? 'text-ink-3 bg-bg'
        : 'text-info bg-info-soft';
  return <span className={`pill ${colour}`}>{label}</span>;
}
