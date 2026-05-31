import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { db, projects, clients } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { formatMoney, formatDate, cx } from '@/lib/utils';
import { ProjectRow } from './project-row';

async function getProjects() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db
      .select({
        id: projects.id,
        reference: projects.reference,
        title: projects.title,
        currentStage: projects.currentStage,
        fablabRole: projects.fablabRole,
        projectType: projects.projectType,
        priority: projects.priority,
        budget: projects.budget,
        budgetCurrency: projects.budgetCurrency,
        targetHandoverDate: projects.targetHandoverDate,
        clientName: clients.name
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(sql`${projects.currentStage} NOT IN ('archived', 'cancelled')`)
      .limit(50);
  } catch {
    return [];
  }
}

const STAGE_PILL: Record<string, string> = {
  brief: 'pill-brief',
  concept: 'pill-concept',
  design_development: 'pill-design',
  specification: 'pill-spec',
  procurement_production: 'pill-proc',
  installation: 'pill-install',
  handover: 'pill-handover'
};

export default async function ProjectsPage() {
  const rows = await getProjects();
  return <ProjectsList rows={rows} />;
}

function ProjectsList({ rows }: { rows: Awaited<ReturnType<typeof getProjects>> }) {
  const t = useTranslations();
  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('projects.title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">{rows.length} live</p>
        </div>
        <button className="btn btn-primary">{t('action.new_project')}</button>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          No projects yet. Convert a Lead from the Leads view to create one, or check that DATABASE_URL is set.
        </div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('col.ref')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('col.title')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('col.client')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('col.stage')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('col.budget')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('col.handover')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <ProjectRow key={r.id} href={`/projects/${r.id}`}>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <Link href={`/projects/${r.id}`} className="ref hover:underline">{r.reference}</Link>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{r.title}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{r.clientName ?? '—'}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <span className={cx('pill', STAGE_PILL[r.currentStage] ?? '')}>
                    {t(`stage.${r.currentStage}`)}
                  </span>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  {formatMoney(r.budget, r.budgetCurrency ?? 'NOK')}
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">
                  {formatDate(r.targetHandoverDate)}
                </td>
              </ProjectRow>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
