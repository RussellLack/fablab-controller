import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  projects,
  clients,
  projectCustomerInvitations
} from '@/db';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

/**
 * Customer portal landing — lists every project the signed-in email
 * has an active (accepted/pending, non-revoked) invitation to.
 *
 * Multi-project clients see all their projects here; single-project
 * customers see just one and can click straight through.
 */
export default async function PortalIndexPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  // Layout's auth contract guarantees `user` is set and is a customer.
  const email = user?.email ?? '';
  const t = await getTranslations();

  const rows = await db
    .select({
      projectId: projects.id,
      projectRef: projects.reference,
      projectTitle: projects.title,
      currentStage: projects.currentStage,
      clientName: clients.name,
      invitedAt: projectCustomerInvitations.invitedAt,
      acceptedAt: projectCustomerInvitations.acceptedAt
    })
    .from(projectCustomerInvitations)
    .innerJoin(projects, eq(projectCustomerInvitations.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(
      and(
        sql`lower(${projectCustomerInvitations.email}) = ${email.toLowerCase()}`,
        isNull(projectCustomerInvitations.revokedAt)
      )
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tighter">
          {t('portal.welcome', { name: email })}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1">{t('portal.welcome_sub')}</p>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          {t('portal.no_projects')}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.projectId}>
              <Link
                href={`/portal/projects/${r.projectId}`}
                className="block card hover:bg-bg transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-ink-3 mb-1">{r.projectRef}</div>
                    <div className="font-semibold text-[15px]">{r.projectTitle}</div>
                    <div className="text-ink-2 text-[12px] mt-1">
                      {r.clientName ?? '—'} · {t(`stage.${r.currentStage}`)}
                    </div>
                  </div>
                  <div className="text-[11px] text-ink-3">
                    {r.acceptedAt
                      ? t('portal.invited_accepted', { date: formatDate(r.acceptedAt) })
                      : t('portal.invited_pending', { date: formatDate(r.invitedAt) })}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
