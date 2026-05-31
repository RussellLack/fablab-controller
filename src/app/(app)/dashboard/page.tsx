import { db, projects } from '@/db';
import { count } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { DashboardUI } from './dashboard-ui';

async function getStats() {
  if (!process.env.DATABASE_URL) {
    return { liveProjects: '—', itemsInFlight: '—', drawingsForReview: '—', budgetCommitted: '—' };
  }
  try {
    const [liveCount] = await db
      .select({ value: count() })
      .from(projects)
      .where(sql`current_stage NOT IN ('archived', 'cancelled', 'handover')`);
    return {
      liveProjects: liveCount?.value ?? 0,
      itemsInFlight: '—',
      drawingsForReview: '—',
      budgetCommitted: '—'
    };
  } catch {
    return { liveProjects: '—', itemsInFlight: '—', drawingsForReview: '—', budgetCommitted: '—' };
  }
}

export default async function DashboardPage() {
  const stats = await getStats();
  return <DashboardUI stats={stats} />;
}
