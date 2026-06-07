import { db, projects, clients } from '@/db';
import { eq } from 'drizzle-orm';
import { ProjectsExplorer, type ProjectListRow } from './explorer';

/**
 * Projects list — server fetches the full live set (excluding
 * cancelled rows; archived projects appear in the filter as their
 * own stage bucket and stay in the result so users can search them).
 *
 * Client-side <ProjectsExplorer> handles search / stage filter / sort.
 */
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

export default async function ProjectsPage() {
  const rows = await getProjects();
  return <ProjectsExplorer rows={rows} />;
}
