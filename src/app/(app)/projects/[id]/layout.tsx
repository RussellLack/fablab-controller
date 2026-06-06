import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { and, count, eq, inArray } from 'drizzle-orm';
import { getProject } from './queries';
import { StageFlow } from '@/components/stage-flow';
import { RoleBanner } from '@/components/role-banner';
import { ProjectStepper } from '@/components/project-stepper';
import { ProjectNextStepStrip } from '@/components/project-next-step-strip';
import { ProjectBreadcrumb } from '@/components/project-breadcrumb';
import { ProjectModuleBar } from '@/components/project-module-bar';
import { getProjectGates } from '@/server/queries/project-gates';
import { db, projectCoachRecommendations } from '@/db';

const ACTIVE_STAGES = [
  'brief',
  'concept',
  'design_development',
  'specification',
  'procurement_production',
  'installation',
  'handover'
] as const;

/**
 * Per-project layout. Stacks four navigation layers (per Russell's
 * brief on clearer wayfinding):
 *
 *   A — Coach next-step strip   (only when there's an open critical/high rec)
 *   B — Breadcrumb path         (always; starts with ↩ Dashboard)
 *   C — Module pill bar         (always; current module highlighted)
 *   D — Project header + stepper (existing)
 */
async function getOpenCoachCount(projectId: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const [row] = await db
      .select({ value: count() })
      .from(projectCoachRecommendations)
      .where(
        and(
          eq(projectCoachRecommendations.projectId, projectId),
          inArray(projectCoachRecommendations.status, ['open', 'acknowledged'])
        )
      );
    return row?.value ?? 0;
  } catch {
    // Migration may not be run yet — fail silently.
    return 0;
  }
}

export default async function ProjectLayout({
  params,
  children
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const t = await getTranslations();

  // Fan out — project, gates, coach count all parallel.
  const [p, gates, openCoachCount] = await Promise.all([
    getProject(id),
    getProjectGates(id),
    getOpenCoachCount(id)
  ]);
  if (!p) notFound();

  return (
    <>
      {/* Layer A — Coach next-step strip (renders nothing when nothing to nudge) */}
      <ProjectNextStepStrip projectId={p.id} />

      {/* Layer B — Breadcrumb path with ↩ Dashboard home link */}
      <ProjectBreadcrumb
        projectId={p.id}
        projectRef={p.reference}
        projectTitle={p.title}
      />

      {/* Layer C — Project module bar */}
      <ProjectModuleBar projectId={p.id} openCoachCount={openCoachCount} />

      {/* Layer D — Existing project header + stepper */}
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{p.reference}</span>
            <span className={`pill pill-${p.currentStage.replace(/_/g, '')}`}>
              {t(`stage.${p.currentStage}`)}
            </span>
            <span className="inline-block text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
              {t(`type.${p.projectType}`)}
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{p.title}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {[
              p.clientName,
              p.ownerName ? `Owner: ${p.ownerName}` : null,
              p.siteAddress ? `Site: ${p.siteAddress}` : null
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {(ACTIVE_STAGES as readonly string[]).includes(p.currentStage) && (
            <Link
              href={`/projects/${p.id}/coach`}
              className="btn btn-ghost text-[12px] gap-1.5"
              title={t('coach.launcher_title')}
            >
              <span className="text-brand">◐</span>
              {t('coach.launcher_cta')}
              {openCoachCount > 0 && (
                <span className="ml-0.5 text-[10px] px-1 rounded bg-brand-soft text-brand">
                  {openCoachCount}
                </span>
              )}
            </Link>
          )}
          <button className="btn">{t('action.hold')}</button>
          <button className="btn btn-primary">{t('action.advance')}</button>
        </div>
      </div>

      <RoleBanner role={p.fablabRole} />
      <StageFlow currentStage={p.currentStage} />
      <div className="mt-6">
        <ProjectStepper projectId={p.id} gates={gates} />
        {children}
      </div>
    </>
  );
}
