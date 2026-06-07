import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  projects,
  clients,
  leads,
  users,
  projectCustomerInvitations,
  projectCustomerUploads,
  projectCustomerComments,
  projectBriefSignoffs
} from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { formatDate, formatMoney } from '@/lib/utils';
import { CustomerUploads, type CustomerUpload } from '@/components/portal/customer-uploads';
import { BriefComments, type BriefComment } from '@/components/portal/brief-comments';
import {
  BriefSignoff,
  type BriefSignoffState
} from '@/components/portal/brief-signoff';

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

  const user = await getCurrentUser();
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

  // Customer can see every upload on the project (staff + other customer
  // collaborators), but can only delete files they uploaded themselves
  // — the API enforces ownership on DELETE; the UI only renders the X
  // on rows where uploadedBy === current user.
  const uploadsRaw = await db
    .select({
      id: projectCustomerUploads.id,
      filename: projectCustomerUploads.filename,
      storagePath: projectCustomerUploads.storagePath,
      mimeType: projectCustomerUploads.mimeType,
      sizeBytes: projectCustomerUploads.sizeBytes,
      uploadedBy: projectCustomerUploads.uploadedBy,
      createdAt: projectCustomerUploads.createdAt
    })
    .from(projectCustomerUploads)
    .where(eq(projectCustomerUploads.projectId, id))
    .orderBy(desc(projectCustomerUploads.createdAt));

  const uploads: CustomerUpload[] = uploadsRaw.map((u) => ({
    id: u.id,
    filename: u.filename,
    storagePath: u.storagePath,
    mimeType: u.mimeType,
    sizeBytes: u.sizeBytes,
    uploadedBy: u.uploadedBy,
    createdAt: u.createdAt.toISOString(),
    isMine: user?.id ? u.uploadedBy === user.id : false
  }));

  const commentsRaw = await db
    .select({
      id: projectCustomerComments.id,
      authorId: projectCustomerComments.authorId,
      authorIsStaff: projectCustomerComments.authorIsStaff,
      body: projectCustomerComments.body,
      section: projectCustomerComments.section,
      replyToId: projectCustomerComments.replyToId,
      createdAt: projectCustomerComments.createdAt,
      editedAt: projectCustomerComments.editedAt
    })
    .from(projectCustomerComments)
    .where(eq(projectCustomerComments.projectId, id))
    .orderBy(asc(projectCustomerComments.createdAt));

  const comments: BriefComment[] = commentsRaw.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    authorIsStaff: c.authorIsStaff,
    body: c.body,
    section: c.section,
    replyToId: c.replyToId,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null
  }));

  // Latest sign-off for this customer (signed_off_by = current user).
  // We deliberately don't show other customers' sign-offs in this card —
  // each customer experiences their own sign-off state. Staff side will
  // see all sign-offs across customers.
  const [latestMine] = user?.id
    ? await db
        .select({
          signedOffAt: projectBriefSignoffs.signedOffAt,
          briefSnapshot: projectBriefSignoffs.briefSnapshot
        })
        .from(projectBriefSignoffs)
        .where(
          and(
            eq(projectBriefSignoffs.projectId, id),
            eq(projectBriefSignoffs.signedOffBy, user.id)
          )
        )
        .orderBy(desc(projectBriefSignoffs.signedOffAt))
        .limit(1)
    : [];

  const signoffState: BriefSignoffState = !latestMine
    ? 'none'
    : signoffMatchesBrief(latestMine.briefSnapshot, p.description, p.fablabRole)
      ? 'current'
      : 'drifted';

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

      <CustomerUploads projectId={id} initial={uploads} />

      <BriefComments
        projectId={id}
        initial={comments}
        currentUserId={user?.id ?? ''}
        canPost={true}
      />

      <BriefSignoff
        projectId={id}
        state={signoffState}
        latestSignedAt={
          latestMine?.signedOffAt ? latestMine.signedOffAt.toISOString() : null
        }
        canSign={true}
      />

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

/**
 * Drift detection: compares the snapshot taken at the moment of sign-off
 * against the current brief. We only check description + fablabRole —
 * those are the operative commercial fields. Project ref / title are
 * stored in the snapshot for self-describing audit but don't drive drift
 * (renaming a project shouldn't invalidate sign-off).
 */
function signoffMatchesBrief(
  snapshot: unknown,
  currentDescription: string | null,
  currentRole: string | null
): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const s = snapshot as { description?: unknown; fablabRole?: unknown };
  const snapDesc =
    typeof s.description === 'string' ? s.description : '';
  const snapRole = typeof s.fablabRole === 'string' ? s.fablabRole : '';
  return (
    snapDesc === (currentDescription ?? '') &&
    snapRole === (currentRole ?? '')
  );
}
