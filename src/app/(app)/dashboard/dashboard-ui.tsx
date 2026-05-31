'use client';

import { useTranslations } from 'next-intl';

type Stats = {
  liveProjects: number | string;
  itemsInFlight: number | string;
  drawingsForReview: number | string;
  budgetCommitted: number | string;
};

export function DashboardUI({ stats }: { stats: Stats }) {
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
        Connect Supabase + run npm run db:push to see real counts. Falls back to placeholders while the DB is empty.
      </p>
    </>
  );
}
