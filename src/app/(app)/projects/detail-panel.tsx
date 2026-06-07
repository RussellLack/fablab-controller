import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, projects, clients, purchaseOrders, rfqs, approvals } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { formatMoney, formatDate } from '@/lib/utils';

/**
 * Minimal project-summary panel for /projects split view.
 *
 * The standalone /projects/[id] page has its own rich layout chrome
 * (breadcrumb, module bar, stepper, multi-card brief) which doesn't
 * compress well into a narrow column. So the inline split-view panel
 * shows only the essentials: ref + title + client + stage pill +
 * fablab role, budget / handover, and counts of attached entities
 * (POs, RFQs, approvals). The "Open full page →" shortcut at the top
 * jumps to the real /projects/[id] for the rest.
 */

const STAGE_PILL: Record<string, string> = {
  brief: 'pill-brief',
  concept: 'pill-concept',
  design_development: 'pill-design',
  specification: 'pill-spec',
  procurement_production: 'pill-proc',
  installation: 'pill-install',
  handover: 'pill-handover'
};

async function getProjectSummary(id: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db
      .select({
        id: projects.id,
        reference: projects.reference,
        title: projects.title,
        description: projects.description,
        currentStage: projects.currentStage,
        projectType: projects.projectType,
        fablabRole: projects.fablabRole,
        priority: projects.priority,
        budget: projects.budget,
        budgetCurrency: projects.budgetCurrency,
        targetHandoverDate: projects.targetHandoverDate,
        siteAddress: projects.siteAddress,
        clientId: projects.clientId,
        clientName: clients.name,
        poCount: sql<number>`(select count(*)::int from ${purchaseOrders} where ${purchaseOrders.projectId} = ${projects.id})`,
        rfqCount: sql<number>`(select count(*)::int from ${rfqs} where ${rfqs.projectId} = ${projects.id})`,
        approvalCount: sql<number>`(select count(*)::int from ${approvals} where ${approvals.projectId} = ${projects.id})`
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function ProjectDetailPanel({ projectId }: { projectId: string }) {
  const p = await getProjectSummary(projectId);
  if (!p) {
    return <div className="card text-ink-2 text-[13px]">Project not found.</div>;
  }
  const t = await getTranslations();

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex justify-end mb-2">
        <Link
          href={`/projects/${p.id}`}
          className="text-[11px] text-ink-3 hover:text-ink underline-offset-2 hover:underline"
        >
          {t('entity_detail.open_full_page')} →
        </Link>
      </div>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="pill pill-type pill-project">{t('entity_type.project')}</span>
          <span className={`pill ${STAGE_PILL[p.currentStage] ?? ''}`}>
            {t(`stage.${p.currentStage}`)}
          </span>
        </div>
        <div className="text-[11px] text-ink-3 font-mono mb-1">{p.reference}</div>
        <h1 className="text-[18px] font-semibold tracking-tighter">{p.title}</h1>
        {p.clientName && (
          <p className="text-ink-2 text-[13px] mt-1">
            {p.clientId ? (
              <Link href={`/clients/${p.clientId}`} className="hover:underline">
                {p.clientName}
              </Link>
            ) : (
              p.clientName
            )}
          </p>
        )}
      </div>

      {/* Key facts */}
      <div className="card mb-3">
        <div className="card-title">{t('entity_detail.commercial_section')}</div>
        <dl className="text-[13px] space-y-1.5 mt-2">
          <DetailRow
            label={t('col.budget')}
            value={p.budget ? formatMoney(p.budget, p.budgetCurrency ?? 'NOK') : null}
          />
          <DetailRow label={t('col.handover')} value={formatDate(p.targetHandoverDate)} />
          <DetailRow label={t('projects_detail.type')} value={t(`type.${p.projectType}`)} />
          <DetailRow label={t('projects_detail.role')} value={t(`projects_detail.role_value.${p.fablabRole}`)} />
          <DetailRow label={t('projects_detail.priority')} value={t(`projects_detail.priority_value.${p.priority}`)} />
        </dl>
      </div>

      {p.siteAddress && (
        <div className="card mb-3">
          <div className="card-title">{t('projects_detail.site')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2">{p.siteAddress}</p>
        </div>
      )}

      {p.description && (
        <div className="card mb-3">
          <div className="card-title">{t('projects_detail.description')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2 text-ink-2 max-h-48 overflow-y-auto">
            {p.description}
          </p>
        </div>
      )}

      {/* Attachment counts — direct links into the project's sub-modules. */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <CountTile href={`/projects/${p.id}/approvals`} label={t('crumbs.approvals')} count={p.approvalCount} />
        <CountTile href={`/projects/${p.id}/rfqs`} label={t('crumbs.rfqs')} count={p.rfqCount} />
        <CountTile href={`/projects/${p.id}/pos`} label={t('crumbs.pos')} count={p.poCount} />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-3">
      <dt className="text-ink-3 w-32 shrink-0">{label}</dt>
      <dd>{value ?? <span className="text-ink-3">—</span>}</dd>
    </div>
  );
}

function CountTile({
  href,
  label,
  count
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="card text-center hover:border-line-strong transition-colors duration-75 active:bg-bg"
    >
      <div className="text-[20px] font-semibold tracking-tighter">{count}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3 mt-0.5">{label}</div>
    </Link>
  );
}
