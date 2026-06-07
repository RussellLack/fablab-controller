import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { db, projects } from '@/db';
import { AuditTimeline } from '@/components/audit-timeline';

export default async function ProjectHistoryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project] = await db
    .select({ id: projects.id, title: projects.title, reference: projects.reference })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) notFound();
  const t = await getTranslations();
  return (
    <AuditTimeline
      entityType="project"
      entityId={id}
      entityName={`${project.reference} · ${project.title}`}
      backHref={`/projects/${id}`}
      backLabel={t('audit.back_to_project')}
    />
  );
}
