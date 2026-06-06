import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { db, projects } from '@/db';
import { syncProjectCoachRecommendations, type StoredRecommendation } from '@/server/queries/coach-sync';
import { CoachDashboardActions } from './actions-client';
import { CoachLauncher } from '../coach-launcher';

type ProjectStage =
  | 'brief'
  | 'concept'
  | 'design_development'
  | 'specification'
  | 'procurement_production'
  | 'installation'
  | 'handover';

/**
 * Project Coach dashboard — MVP-D synthesis surface.
 *
 * Reads from `project_coach_recommendations` via the sync function
 * (which reconciles the table with the rules-engine output on every
 * render: new findings → INSERT, gone findings → marked resolved,
 * user state → preserved).
 *
 * Layout per `28-` §6:
 *   - Header: project ref + "+ Document evidence" wizard launcher
 *   - Empty state: doctrine line about a quiet Coach
 *   - Open / acknowledged recs grouped by severity (critical → high →
 *     medium → low). Per row: observation / why-it-matters / action
 *     link + ack/dismiss/resolve affordances
 *   - "Show dismissed" disclosure at the bottom for the rare un-silence
 */
export default async function ProjectCoachPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();

  const [proj] = await db
    .select({
      reference: projects.reference,
      title: projects.title,
      currentStage: projects.currentStage
    })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!proj) notFound();

  const recommendations = await syncProjectCoachRecommendations(id);

  const groups = groupBySeverity(recommendations);
  const total = recommendations.length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            ◐ {t('coach_dashboard.title')}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {total === 0
              ? t('coach_dashboard.subtitle_quiet')
              : t('coach_dashboard.subtitle_active', { count: total })}
          </p>
        </div>
        <CoachLauncher
          projectId={id}
          projectStage={proj.currentStage as ProjectStage}
        />
      </div>

      {total === 0 ? (
        <div className="card border-l-2 border-ok">
          <p className="text-[13px] leading-snug text-ink-2">
            {t('coach_dashboard.empty_doctrine')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
            const group = groups[sev];
            if (!group || group.length === 0) return null;
            return (
              <SeveritySection
                key={sev}
                severity={sev}
                items={group}
                projectId={id}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

async function SeveritySection({
  severity,
  items,
  projectId
}: {
  severity: 'critical' | 'high' | 'medium' | 'low';
  items: StoredRecommendation[];
  projectId: string;
}) {
  const t = await getTranslations();
  const tone =
    severity === 'critical'
      ? 'border-danger text-danger'
      : severity === 'high'
        ? 'border-warn text-warn'
        : severity === 'medium'
          ? 'border-info text-info'
          : 'border-line text-ink-3';
  return (
    <section>
      <div className={`flex items-baseline gap-2 mb-2 ${tone}`}>
        <h2 className="text-[12px] uppercase tracking-wider font-semibold">
          {t(`coach_dashboard.severity.${severity}`)}
        </h2>
        <span className="text-[12px] text-ink-3">({items.length})</span>
      </div>
      <ul className={`divide-y divide-line border-l-2 ${tone.split(' ')[0]} bg-surface rounded-r-md overflow-hidden`}>
        {items.map((r) => (
          <li key={r.id}>
            <RecRow rec={r} projectId={projectId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function RecRow({
  rec,
  projectId
}: {
  rec: StoredRecommendation;
  projectId: string;
}) {
  const t = await getTranslations();
  const observationParamsRecord =
    (rec.observationParams ?? undefined) as Record<string, string | number> | undefined;
  return (
    <div className="px-3 py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug">
          {t(rec.observationKey, observationParamsRecord as never)}
          {rec.status === 'acknowledged' && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-3">
              {t('coach_dashboard.acknowledged_tag')}
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-3 mt-0.5 leading-snug">
          {t(`${rec.ruleKey}.why`)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Link
          href={rec.actionHref}
          className="btn btn-ghost text-[11px] px-2 py-1 whitespace-nowrap"
        >
          {t(rec.actionLabelKey)} →
        </Link>
        <CoachDashboardActions
          recId={rec.id}
          projectId={projectId}
          status={rec.status}
        />
      </div>
    </div>
  );
}

function groupBySeverity(
  items: StoredRecommendation[]
): Record<'critical' | 'high' | 'medium' | 'low', StoredRecommendation[]> {
  const out: Record<'critical' | 'high' | 'medium' | 'low', StoredRecommendation[]> = {
    critical: [],
    high: [],
    medium: [],
    low: []
  };
  for (const r of items) {
    if (r.severity in out) out[r.severity as keyof typeof out].push(r);
  }
  return out;
}
