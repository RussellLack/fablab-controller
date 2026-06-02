import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  projects,
  clients,
  projectCustomerInvitations,
  projectBriefSignoffs
} from '@/db';
import { createClient } from '@/lib/supabase/server';

/**
 * Customer portal landing — lists every project the signed-in email
 * has an active (accepted/pending, non-revoked) invitation to.
 *
 * Multi-project clients see all their projects here; single-project
 * customers see just one and can click straight through.
 *
 * Each row carries a sign-off status badge derived from the customer's
 * latest sign-off (per `signed_off_by = current user`) compared
 * against the live brief — so the list doubles as a "what needs your
 * attention" view. Rows are sorted to surface the urgent first:
 *   1. Drifted — brief changed since the customer's sign-off
 *   2. Awaiting — never signed off
 *   3. Signed — current brief is the one they signed
 * Within each tier the most-recently-invited projects come first.
 */
type SignoffStatus = 'current' | 'drifted' | 'none';

type ProjectRow = {
  projectId: string;
  projectRef: string;
  projectTitle: string;
  currentStage: string;
  clientName: string | null;
  invitedAt: Date;
  signoffStatus: SignoffStatus;
};

function tierRank(s: SignoffStatus): number {
  // Lower = higher priority. Drifted is most urgent because the
  // customer's recorded consent no longer matches what the brief says.
  if (s === 'drifted') return 0;
  if (s === 'none') return 1;
  return 2; // current
}

function snapshotMatches(
  snapshot: unknown,
  currentDescription: string | null,
  currentRole: string | null
): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const s = snapshot as { description?: unknown; fablabRole?: unknown };
  const snapDesc = typeof s.description === 'string' ? s.description : '';
  const snapRole = typeof s.fablabRole === 'string' ? s.fablabRole : '';
  return (
    snapDesc === (currentDescription ?? '') &&
    snapRole === (currentRole ?? '')
  );
}

export default async function PortalIndexPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  // Layout's auth contract guarantees `user` is set and is a customer.
  const email = user?.email ?? '';
  const userId = user?.id ?? '';
  const t = await getTranslations();

  // One round-trip: invitation × project × client, with the brief fields
  // needed to drift-check the customer's latest sign-off.
  const inviteRows = await db
    .select({
      projectId: projects.id,
      projectRef: projects.reference,
      projectTitle: projects.title,
      currentStage: projects.currentStage,
      description: projects.description,
      fablabRole: projects.fablabRole,
      clientName: clients.name,
      invitedAt: projectCustomerInvitations.invitedAt
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

  // Pull the customer's latest sign-off per project in a second query —
  // cheap, parallel-safe, avoids a window-function GROUP BY.
  const projectIds = inviteRows.map((r) => r.projectId);
  type SignoffLatest = {
    projectId: string;
    briefSnapshot: unknown;
    signedOffAt: Date;
  };
  let latestByProject = new Map<string, SignoffLatest>();
  if (userId && projectIds.length > 0) {
    const signoffs = await db
      .select({
        projectId: projectBriefSignoffs.projectId,
        briefSnapshot: projectBriefSignoffs.briefSnapshot,
        signedOffAt: projectBriefSignoffs.signedOffAt
      })
      .from(projectBriefSignoffs)
      .where(
        and(
          eq(projectBriefSignoffs.signedOffBy, userId),
          sql`${projectBriefSignoffs.projectId} = ANY(${sql.raw(
            `ARRAY[${projectIds.map((id) => `'${id}'`).join(',')}]::uuid[]`
          )})`
        )
      )
      .orderBy(desc(projectBriefSignoffs.signedOffAt));
    for (const s of signoffs) {
      // First seen (highest signedOffAt due to desc) wins per project.
      if (!latestByProject.has(s.projectId)) latestByProject.set(s.projectId, s);
    }
  }

  const enriched: ProjectRow[] = inviteRows.map((r) => {
    const latest = latestByProject.get(r.projectId);
    const status: SignoffStatus = !latest
      ? 'none'
      : snapshotMatches(latest.briefSnapshot, r.description, r.fablabRole)
        ? 'current'
        : 'drifted';
    return {
      projectId: r.projectId,
      projectRef: r.projectRef,
      projectTitle: r.projectTitle,
      currentStage: r.currentStage,
      clientName: r.clientName,
      invitedAt: r.invitedAt,
      signoffStatus: status
    };
  });

  enriched.sort((a, b) => {
    const t = tierRank(a.signoffStatus) - tierRank(b.signoffStatus);
    if (t !== 0) return t;
    // Within tier: most recently invited first.
    return b.invitedAt.getTime() - a.invitedAt.getTime();
  });

  // For the page header summary: count the action-needing rows.
  const needAttention = enriched.filter(
    (r) => r.signoffStatus !== 'current'
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tighter">
          {t('portal.welcome', { name: email })}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1">
          {enriched.length === 0
            ? t('portal.welcome_sub')
            : needAttention > 0
              ? t('portal.welcome_attention', { n: needAttention })
              : t('portal.welcome_all_caught_up')}
        </p>
      </div>

      {enriched.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          {t('portal.no_projects')}
        </div>
      ) : (
        <ul className="space-y-2">
          {enriched.map((r) => (
            <li key={r.projectId}>
              <Link
                href={`/portal/projects/${r.projectId}`}
                className="block card hover:bg-bg transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-ink-3 mb-1">{r.projectRef}</div>
                    <div className="font-semibold text-[15px] truncate">{r.projectTitle}</div>
                    <div className="text-ink-2 text-[12px] mt-1">
                      {r.clientName ?? '—'} · {t(`stage.${r.currentStage}`)}
                    </div>
                  </div>
                  <SignoffBadge status={r.signoffStatus} t={t} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignoffBadge({
  status,
  t
}: {
  status: SignoffStatus;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (status === 'current') {
    return (
      <span className="pill text-ok bg-ok-soft shrink-0">
        {t('portal.badge_signed')}
      </span>
    );
  }
  if (status === 'drifted') {
    return (
      <span className="pill text-warn bg-warn-soft shrink-0">
        {t('portal.badge_drifted')}
      </span>
    );
  }
  return (
    <span className="pill text-info bg-info-soft shrink-0">
      {t('portal.badge_awaiting')}
    </span>
  );
}
