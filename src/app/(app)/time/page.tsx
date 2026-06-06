import { getTranslations } from 'next-intl/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, timeEntries, projects } from '@/db';
import { TimeEntryListClient } from './list-client';
import { CoachCard } from '@/components/coach-card';
import { getTimeReportingHealth } from '@/server/queries/coach-health';

/**
 * Time entries page — Project Coaching MVP-A.
 *
 * Shows the signed-in user's own entries grouped by ISO week
 * (Mon–Sun). An optional `?project=<uuid>` query filters to a single
 * project (used when launching from a project page's "Log time" link).
 *
 * The list page is per-user — a designer sees their entries, not the
 * team's. Per-project totals across the team live on the project's
 * Reporting tab (later MVP-E). Cross-team time aggregation is out of
 * scope for MVP-A.
 *
 * Layout:
 *   - "+ Log time" button at top opens an inline form
 *   - Active week's entries first
 *   - Older weeks below, each with its own subtotal
 *
 * The Coach prompt for "missing commercial reason" lives on the form
 * (TimeEntryForm component); the Project Coach dashboard (MVP-D) will
 * surface aggregate counts across the project.
 */
export default async function TimePage({
  searchParams
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return (
      <div className="card text-[13px] text-ink-2">
        {t('time.signin_required')}
      </div>
    );
  }

  const projectFilter = sp.project ?? null;

  // Project picker source — every project, ordered by recently-updated.
  // We deliberately include archived/cancelled projects too because
  // staff sometimes need to back-fill time on a closed engagement.
  const allProjects = await db
    .select({
      id: projects.id,
      reference: projects.reference,
      title: projects.title,
      currentStage: projects.currentStage
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt));

  // Entries for the signed-in user — last 90 days by default. Older
  // entries are accessible via search later; MVP-A keeps it simple.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await db
    .select({
      id: timeEntries.id,
      projectId: timeEntries.projectId,
      projectRef: projects.reference,
      projectTitle: projects.title,
      currentStage: projects.currentStage,
      stage: timeEntries.stage,
      category: timeEntries.category,
      workDate: timeEntries.workDate,
      hours: timeEntries.hours,
      note: timeEntries.note,
      commercialReason: timeEntries.commercialReason,
      customerVisibleSummary: timeEntries.customerVisibleSummary,
      chargeabilityStatus: timeEntries.chargeabilityStatus,
      nonChargeableReason: timeEntries.nonChargeableReason,
      linkedObjectType: timeEntries.linkedObjectType,
      linkedObjectId: timeEntries.linkedObjectId,
      reportable: timeEntries.reportable
    })
    .from(timeEntries)
    .innerJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(timeEntries.userId, user.id),
        gte(timeEntries.workDate, ninetyDaysAgo),
        projectFilter ? eq(timeEntries.projectId, projectFilter) : undefined
      )
    )
    .orderBy(desc(timeEntries.workDate), desc(timeEntries.enteredAt));

  // Coach prompts surface only when a project filter is active —
  // a cross-project /time list is too wide to nudge per-project rules.
  const coachItems = projectFilter
    ? await getTimeReportingHealth(projectFilter)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {t('time.title')}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">{t('time.subtitle')}</p>
        </div>
      </div>

      {projectFilter && <CoachCard items={coachItems} />}

      {allProjects.length === 0 ? (
        <div className="card">
          <p className="text-[13px] text-ink-2">{t('time.no_projects')}</p>
        </div>
      ) : (
        <TimeEntryListClient
          projects={allProjects}
          entries={rows.map((r) => ({
            ...r,
            note: r.note ?? '',
            commercialReason: r.commercialReason ?? '',
            customerVisibleSummary: r.customerVisibleSummary ?? '',
            chargeabilityStatus: r.chargeabilityStatus ?? '',
            nonChargeableReason: r.nonChargeableReason ?? '',
            linkedObjectType: r.linkedObjectType ?? '',
            linkedObjectId: r.linkedObjectId ?? ''
          }))}
          activeProjectFilter={projectFilter}
        />
      )}
    </div>
  );
}
