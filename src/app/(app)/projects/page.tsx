import { db, projects, clients } from '@/db';
import { eq } from 'drizzle-orm';
import { ProjectsExplorer, type ProjectListRow } from './explorer';
import { ProjectDetailPanel } from './detail-panel';

async function getProjects(): Promise<ProjectListRow[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return (await db
      .select({
        id: projects.id,
        reference: projects.reference,
        title: projects.title,
        currentStage: projects.currentStage,
        budget: projects.budget,
        budgetCurrency: projects.budgetCurrency,
        targetHandoverDate: projects.targetHandoverDate,
        clientName: clients.name
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .limit(1000)) as ProjectListRow[];
  } catch {
    return [];
  }
}

export default async function ProjectsPage({
  searchParams
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const sp = await searchParams;
  const selectedId = sp.selected ?? null;
  const rows = await getProjects();
  const selectedDetail = selectedId
    ? <ProjectDetailPanel projectId={selectedId} />
    : null;
  return <ProjectsExplorer rows={rows} selectedDetail={selectedDetail} />;
}
