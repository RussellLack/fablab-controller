import { useTranslations } from 'next-intl';
import { db, projects } from '@/db';
import { sql, count } from 'drizzle-orm';

async function getStats() {
  // Real query against Supabase. If DATABASE_URL isn't set, fall back to placeholders.
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
      itemsInFlight: '—',          // wire later
      drawingsForReview: '—',
      budgetCommitted: '—'
    };
  } catch {
    return { liveProjects: '—', itemsInFlight: '—', drawingsForReview: '—', budgetCommitted: '—' };
  }
}

export default async function DashboardPage() {
  const stats = await getStats();
  return <Dashboard stats={stats} />;
}

function Dashboard({ stats }: { stats: Awaited<ReturnType<typeof getStats>> }) {
  const t = useTranslations();
  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('dash.title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">{t('dash.sub')}</p>
        </div>
        <button className="btn btn-primary">{t('action.new_project')}</button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <div className="card-title">{t('dash.live_projects')}</div>
          <div className="card-value">{stats.liveProjects}</div>
          <div className="card-meta">{t('dash.live_meta')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('dash.items_open')}</div>
          <div className="card-value">{stats.itemsInFlight}</div>
          <div className="card-meta">{t('dash.items_meta')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('dash.dwg_review')}</div>
          <div className="card-value">{stats.drawingsForReview}</div>
          <div className="card-meta">{t('dash.dwg_meta')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('dash.budget_committed')}</div>
          <div className="card-value">{stats.budgetCommitted}</div>
          <div className="card-meta">{t('dash.budget_meta')}</div>
        </div>
      </div>

      <p className="text-ink-3 text-xs mt-8">
        Connect Supabase + run `npm run db:push` to see real counts. Falls back to placeholders while the DB is empty.
      </p>
    </>
  );
}
