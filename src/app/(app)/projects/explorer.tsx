'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProjectRow } from './project-row';
import { formatMoney, formatDate, cx } from '@/lib/utils';

/**
 * Client-side explorer for /projects — search, sort, filter pills.
 * Filter set is stage-driven (the project lifecycle is the dominant
 * organising axis here, more useful than projectType). Sort across
 * reference, title, stage, budget, handover date.
 */

export type ProjectListRow = {
  id: string;
  reference: string;
  title: string;
  currentStage: string;
  budget: string | null;
  budgetCurrency: string | null;
  targetHandoverDate: string | null;
  clientName: string | null;
};

type SortKey = 'reference' | 'title' | 'stage' | 'budget' | 'handover';
type SortDir = 'asc' | 'desc';

// All non-terminal stages get their own pill. We omit cancelled/archived
// because the server query already filters those out by default.
const STAGE_FILTERS = [
  'all',
  'brief',
  'concept',
  'design_development',
  'specification',
  'procurement_production',
  'installation',
  'handover',
  'on_hold',
  'in_dispute'
] as const;

const STAGE_PILL: Record<string, string> = {
  brief: 'pill-brief',
  concept: 'pill-concept',
  design_development: 'pill-design',
  specification: 'pill-spec',
  procurement_production: 'pill-proc',
  installation: 'pill-install',
  handover: 'pill-handover'
};

function matchesSearch(row: ProjectListRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    row.reference.toLowerCase().includes(needle) ||
    row.title.toLowerCase().includes(needle) ||
    (row.clientName?.toLowerCase().includes(needle) ?? false)
  );
}

function compare(a: ProjectListRow, b: ProjectListRow, key: SortKey, dir: SortDir): number {
  const mult = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'reference':
      return mult * a.reference.localeCompare(b.reference, undefined, { numeric: true });
    case 'title':
      return mult * a.title.localeCompare(b.title);
    case 'stage':
      return mult * a.currentStage.localeCompare(b.currentStage);
    case 'budget': {
      const av = a.budget ? parseFloat(a.budget) : -1;
      const bv = b.budget ? parseFloat(b.budget) : -1;
      return mult * (av - bv);
    }
    case 'handover': {
      const av = a.targetHandoverDate ? Date.parse(a.targetHandoverDate) : 0;
      const bv = b.targetHandoverDate ? Date.parse(b.targetHandoverDate) : 0;
      return mult * (av - bv);
    }
  }
}

export function ProjectsExplorer({ rows }: { rows: ProjectListRow[] }) {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof STAGE_FILTERS)[number]>('all');
  const [sortKey, setSortKey] = useState<SortKey>('reference');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const stage of STAGE_FILTERS) if (stage !== 'all') c[stage] = 0;
    for (const r of rows) c[r.currentStage] = (c[r.currentStage] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => filter === 'all' || r.currentStage === filter)
      .filter((r) => matchesSearch(r, search))
      .sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [rows, filter, search, sortKey, sortDir]);

  function cycleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-ink-3">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('projects.title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('explorer.showing_n_of', { n: filtered.length, all: rows.length })}
          </p>
        </div>
        <button className="btn btn-primary">{t('action.new_project')}</button>
      </div>

      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('explorer.search_placeholder_projects')}
          className="w-full max-w-md px-3 py-2 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STAGE_FILTERS.map((key) => {
          const active = filter === key;
          const n = counts[key] ?? 0;
          const label = key === 'all' ? t('explorer.filter_all') : t(`stage.${key}`);
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-colors duration-75 ${
                active
                  ? 'bg-ink text-surface border-ink'
                  : 'bg-surface text-ink-2 border-line hover:text-ink active:bg-line'
              }`}
            >
              {label}
              <span className={active ? 'text-surface/70' : 'text-ink-3'}>· {n}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('explorer.no_results')}</div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr>
              <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
                <button
                  onClick={() => cycleSort('reference')}
                  className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink"
                >
                  {t('col.ref')}
                  {sortArrow('reference')}
                </button>
              </th>
              <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
                <button
                  onClick={() => cycleSort('title')}
                  className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink"
                >
                  {t('col.title')}
                  {sortArrow('title')}
                </button>
              </th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">
                {t('col.client')}
              </th>
              <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
                <button
                  onClick={() => cycleSort('stage')}
                  className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink"
                >
                  {t('col.stage')}
                  {sortArrow('stage')}
                </button>
              </th>
              <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
                <button
                  onClick={() => cycleSort('budget')}
                  className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink"
                >
                  {t('col.budget')}
                  {sortArrow('budget')}
                </button>
              </th>
              <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
                <button
                  onClick={() => cycleSort('handover')}
                  className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink"
                >
                  {t('col.handover')}
                  {sortArrow('handover')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <ProjectRow key={r.id} href={`/projects/${r.id}`}>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="pill pill-type pill-project">{t('entity_type.project')}</span>
                    <Link href={`/projects/${r.id}`} className="ref hover:underline">
                      {r.reference}
                    </Link>
                  </div>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{r.title}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{r.clientName ?? '—'}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <span className={cx('pill', STAGE_PILL[r.currentStage] ?? '')}>
                    {t(`stage.${r.currentStage}`)}
                  </span>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  {formatMoney(r.budget, r.budgetCurrency ?? 'NOK')}
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">
                  {formatDate(r.targetHandoverDate)}
                </td>
              </ProjectRow>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
