import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getProject } from './queries';
import { StageFlow } from '@/components/stage-flow';
import { RoleBanner } from '@/components/role-banner';
import { ProjectStepper } from '@/components/project-stepper';
import { getProjectGates } from '@/server/queries/project-gates';

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
  const gates = await getProjectGates(id);

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href="/projects" className="hover:text-ink">{t('crumbs.projects')}</Link>{' / '}
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
            {[
              p.clientName,
              p.ownerName ? `Owner: ${p.ownerName}` : null,
              p.siteAddress ? `Site: ${p.siteAddress}` : null
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
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
        <ProjectStepper projectId={p.id} gates={gates} />
        {children}
      </div>
    </>
  );
}
