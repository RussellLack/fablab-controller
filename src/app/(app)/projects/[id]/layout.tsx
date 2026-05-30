import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, projects, clients, users } from '@/db';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { formatDate } from '@/lib/utils';
import { StageFlow } from '@/components/stage-flow';
import { RoleBanner } from '@/components/role-banner';
import { ProjectTabs } from '@/components/project-tabs';

/** Cached lookup so layout + page share one query per request. */
const getProject = cache(async (id: string) => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db
      .select({
        id: projects.id,
        reference: projects.reference,
        title: projects.title,
        description: projects.description,
        currentStage: projects.currentStage,
        fablabRole: projects.fablabRole,
        projectType: projects.projectType,
        priority: projects.priority,
        budget: projects.budget,
        budgetCurrency: projects.budgetCurrency,
        siteAddress: projects.siteAddress,
        targetHandoverDate: projects.targetHandoverDate,
        clientName: clients.name,
        clientContact: clients.primaryContactName,
        clientEmail: clients.primaryContactEmail,
        ownerName: users.name
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(users, eq(projects.currentOwnerId, users.id))
      .where(eq(projects.id, id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
});

export default async function ProjectLayout({
  params,
  children
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  const t = await getTranslations();

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <a href="/projects" className="hover:text-ink">{t('crumbs.projects')}</a>{' / '}
        {p.reference}
      </div>

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
            {p.clientName ?? '—'} · Owner: {p.ownerName ?? '—'} · Site: {p.siteAddress ?? '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn">{t('action.hold')}</button>
          <button className="btn btn-primary">{t('action.advance')}</button>
        </div>
      </div>

      <RoleBanner role={p.fablabRole} />
      <StageFlow currentStage={p.currentStage} />
      <div className="mt-6">
        <ProjectTabs projectId={p.id} />
        {children}
      </div>
    </>
  );
}
