import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db, projectCoachRecommendations } from '@/db';

/**
 * Layer A — the single most-relevant Coach recommendation, rendered
 * as a one-line strip above the breadcrumb.
 *
 * Only renders when there's at least one open `critical` or `high`
 * recommendation. Picks the highest-severity, oldest-firing one (the
 * thing that's been waiting longest at the most urgent level).
 *
 * Visual tone: same calm cream as the inline CoachCard. The strip
 * doesn't shout — it just makes the most important next step
 * unmissable on every project page.
 *
 * Reads from the persisted `project_coach_recommendations` table so
 * acknowledged / dismissed state is respected. Acknowledged recs
 * still show on the dashboard but are excluded here — the strip is
 * for things the user hasn't yet seen.
 */
export async function ProjectNextStepStrip({ projectId }: { projectId: string }) {
  if (!process.env.DATABASE_URL) return null;
  const t = await getTranslations();

  let topRec: Awaited<ReturnType<typeof loadTopRec>>;
  try {
    topRec = await loadTopRec(projectId);
  } catch {
    // Table may not exist yet (MVP-D migration not run). Fail silently —
    // the rest of the page is fine without the strip.
    return null;
  }
  if (!topRec) return null;

  const observation = t(
    topRec.observationKey,
    (topRec.observationParams ?? undefined) as never
  );
  const actionLabel = t(topRec.actionLabelKey);

  return (
    <div className="bg-brand-soft/40 rounded-md px-4 py-2 mb-3 text-[12px] leading-snug flex items-baseline gap-2 flex-wrap">
      <span className="text-brand font-medium uppercase text-[10px] tracking-wider shrink-0">
        ◐ {t('next_step.label')}
      </span>
      <span className="text-ink">{observation}</span>
      <Link
        href={topRec.actionHref}
        className="text-brand hover:underline whitespace-nowrap ml-auto"
      >
        {actionLabel} →
      </Link>
    </div>
  );
}

async function loadTopRec(projectId: string) {
  // Highest severity (critical first), then oldest firstSeenAt.
  // We only want OPEN recs — anything acknowledged shows on the
  // dashboard but doesn't deserve another nudge in the header.
  const rows = await db
    .select({
      observationKey: projectCoachRecommendations.observationKey,
      observationParams: projectCoachRecommendations.observationParams,
      actionLabelKey: projectCoachRecommendations.actionLabelKey,
      actionHref: projectCoachRecommendations.actionHref
    })
    .from(projectCoachRecommendations)
    .where(
      and(
        eq(projectCoachRecommendations.projectId, projectId),
        eq(projectCoachRecommendations.status, 'open'),
        inArray(projectCoachRecommendations.severity, ['critical', 'high'])
      )
    )
    .orderBy(
      // SQL CASE so critical < high; postgres sorts asc by default.
      projectCoachRecommendations.severity,
      projectCoachRecommendations.firstSeenAt
    )
    .limit(1);
  return rows[0] ?? null;
}
