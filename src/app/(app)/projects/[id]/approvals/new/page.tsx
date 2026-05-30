import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, projects, scopeBaselines, scopeBaselineVersions } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { NewApprovalForm } from './form-client';

async function getTargets(projectId: string) {
  if (!process.env.DATABASE_URL) return { project: null, scopeVersions: [] };
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const versions = project ? await db
      .select({
        id: scopeBaselineVersions.id,
        versionNumber: scopeBaselineVersions.versionNumber,
        status: scopeBaselineVersions.status
      })
      .from(scopeBaselineVersions)
      .innerJoin(scopeBaselines, eq(scopeBaselineVersions.scopeBaselineId, scopeBaselines.id))
      .where(eq(scopeBaselines.projectId, projectId))
      .orderBy(desc(scopeBaselineVersions.versionNumber))
      : [];
    return { project, scopeVersions: versions };
  } catch {
    return { project: null, scopeVersions: [] };
  }
}

export default async function NewApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, scopeVersions } = await getTargets(id);
  if (!project) notFound();
  const t = await getTranslations();

  return (
    <>
      <h2 className="text-[18px] font-semibold mb-4">{t('approval.new_title')}</h2>
      <p className="text-ink-2 text-[13px] mb-6">{t('approval.new_helper')}</p>
      <NewApprovalForm
        projectId={project.id}
        projectRef={project.reference}
        scopeVersions={scopeVersions}
      />
    </>
  );
}
