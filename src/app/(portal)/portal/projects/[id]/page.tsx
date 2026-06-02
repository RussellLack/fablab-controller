import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  projects,
  clients,
  leads,
  users,
  projectCustomerInvitations
} from '@/db';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatMoney } from '@/lib/utils';

/**
 * Customer's read-only view of the project brief.
 *
 * Access check: the signed-in email must have an accepted /
 * unaccepted (pending) invitation for this project, AND it must not
 * be revoked. If they have no invitation row, 404 — we never tell
 * them whether the project exists.
 *
 * On first successful access, we stamp `accepted_at` on the
 * invitation so the staff side can see they've signed in.
 *
 * Content is read-only:
 *   - Project ref / title / current stage
 *   - Designer-written brief (project.description)
 *   - Fablab's role + role implication banner (so the customer
 *     understands the commercial commitment Fablab has signed up to)
 *   - Intake summary (a subset of the 16 fields the lead captured)
 *
 * B3 / B4 / B5 add: uploads, comments, sign-off.
 */
export default async function PortalProjectBriefPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const email = user?.email ?? '';

  // 1. Authorise: invitation row exists for this email × project, not revoked.
  const [invite] = await db
    .select()
    .from(projectCustomerInvitations)
    .where(
      and(
        eq(projectCustomerInvitations.projectId, id),
        sql`lower(${projectCustomerInvitations.email}) = ${email.toLowerCase()}`,
        isNull(projectCustomerInvitations.revokedAt)
      )
    )
    .limit(1);

  if (!invite) notFound();

  // 2. First-touch stamp.
  if (!invite.acceptedAt) {
    await db
      .update(projectCustomerInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(projectCustomerInvitations.id, invite.id));
  }

  // 3. Fetch project + client + originating lead (intake summary).
  const [projRow] = await db
    .select({
      project: projects,
      clientName: clients.name,
      ownerName: users.name
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(users, eq(projects.currentOwnerId, users.id))
    .where(eq(projects.id, id))
    .limit(1);

  if (!projRow) notFound();
  const p = projRow.project;

  const [intake] = p.leadId
    ? await db.select().from(leads).where(eq(leads.id, p.leadId)).limit(1)
    : [];

  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] text-ink-3 mb-1">
          <Link href="/portal" className="hover:text-ink">
            {t('portal.all_projects')}
          </Link>
          {' / '}
          {p.reference}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="ref">{p.reference}</span>
          <span className={`pill pill-${p.currentStage.replace(/_/g, '')}`}>
            {t(`stage.${p.currentStage}`)}
          </span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tighter">{p.title}</h1>
        <p className="text-ink-2 text-[13px] mt-1">
          {projRow.clientName ?? '—'}
          {projRow.ownerName && ` · ${t('portal.your_designer')}: ${projRow.ownerName}`}
        </p>
      </div>

      <div className="border-l-2 border-warn bg-warn-soft text-warn px-4 py-3 rounded-r text-[13px] leading-snug">
        <div className="font-semibold mb-1">{t(`role.profile.${p.fablabRole}`)}</div>
        <div className="text-[12px]">{t(`role.implication.${p.fablabRole}`)}</div>
      </div>

      <div className="card">
        <h3 className="card-title mb-3">{t('portal.brief_heading')}</h3>
        {p.description ? (
          <p className="text-[13px] leading-6 whitespace-pre-wrap">{p.description}</p>
        ) : (
          <p className="text-[12px] text-ink-3 italic">
            {t('portal.brief_empty')}
          </p>
        )}
      </div>

      {intake && (
        <div className="card">
          <h3 className="card-title mb-3">{t('portal.intake_heading')}</h3>
          <p className="text-[12px] text-ink-3 mb-3">{t('portal.intake_sub')}</p>
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 gap-x-4 text-[13px]">
            <KV
              k={t('lead.outcome')}
              v={intake.desiredOutcome}
            />
            <KV
              k={t('lead.rooms')}
              v={intake.roomsOrZones}
            />
            <KV
              k={t('lead.budget')}
              v={
                intake.budgetExpectation
                  ? formatMoney(intake.budgetExpectation, intake.budgetCurrency ?? 'NOK')
                  : null
              }
            />
            <KV
              k={t('lead.timeline')}
              v={intake.timelineExpectation}
            />
            <KV
              k={t('lead.style')}
              v={intake.designStylePreferences}
            />
            <KV
              k={t('lead.constraints')}
              v={intake.knownConstraints}
            />
            <KV
              k={t('lead.decision_makers')}
              v={intake.decisionMakers}
            />
            <KV
              k={t('lead.approval_process')}
              v={intake.approvalProcess}
            />
          </dl>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <SoonCard titleKey="portal.uploads_title" bodyKey="portal.uploads_body" />
        <SoonCard titleKey="portal.comments_title" bodyKey="portal.comments_body" />
        <SoonCard titleKey="portal.signoff_title" bodyKey="portal.signoff_body" />
      </div>

      <p className="text-[11px] text-ink-3 text-center pt-2">
        {t('portal.invited_on', { date: formatDate(invite.invitedAt) })}
      </p>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="whitespace-pre-wrap">{v?.trim() || '—'}</dd>
    </>
  );
}

async function SoonCard({
  titleKey,
  bodyKey
}: {
  titleKey: string;
  bodyKey: string;
}) {
  const t = await getTranslations();
  return (
    <div className="card border-dashed">
      <h4 className="text-[12px] uppercase tracking-wider text-ink-3 mb-1">
        {t(titleKey)}
      </h4>
      <p className="text-[12px] text-ink-2 leading-snug">{t(bodyKey)}</p>
      <p className="text-[10px] text-ink-3 italic mt-2">{t('portal.coming_in_next_release')}</p>
    </div>
  );
}
