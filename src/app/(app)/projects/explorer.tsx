'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProjectRow } from './project-row';
import { SavedViewTabs, useSavedViews } from '@/components/saved-views';
import { useUrlState } from '@/components/use-url-state';
import { formatMoney, formatDate, cx } from '@/lib/utils';

/**
 * Client-side explorer for /projects — search, stage filter, sort,
 * view modes (table / grid / split) and saved-view tabs.
 *
 * Mirrors /clients and /vendors. Split view's right panel renders a
 * minimal project summary (see <ProjectDetailPanel/>); the full
 * /projects/[id] page lives one click away via "Open full page →".
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
type ViewMode = 'table' | 'grid' | 'split';

type ExplorerState = {
  search: string;
  filter: string;       // 'all' or a stage value
  sortKey: SortKey;
  sortDir: SortDir;
  view: ViewMode;
};

const DEFAULT_STATE: ExplorerState = {
  search: '',
  filter: 'all',
  sortKey: 'reference',
  sortDir: 'asc',
  view: 'table'
};

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
  'in_dispute',
  'archived'
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

export function ProjectsExplorer({
  rows,
  selectedDetail
}: {
  rows: ProjectListRow[];
  selectedDetail: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('selected');

  const [state, setState] = useUrlState<ExplorerState>({
    basePath: '/projects',
    defaultState: DEFAULT_STATE,
    debounceKeys: ['search'],
    serialise: (s) => ({
      q: s.search || null,
      filter: s.filter === DEFAULT_STATE.filter ? null : s.filter,
      sort: s.sortKey === DEFAULT_STATE.sortKey ? null : s.sortKey,
      dir: s.sortDir === DEFAULT_STATE.sortDir ? null : s.sortDir,
      view: s.view === DEFAULT_STATE.view ? null : s.view
    }),
    parse: (p) => ({
      search: p.get('q') ?? DEFAULT_STATE.search,
      filter: p.get('filter') ?? DEFAULT_STATE.filter,
      sortKey: (p.get('sort') as SortKey) ?? DEFAULT_STATE.sortKey,
      sortDir: (p.get('dir') as SortDir) ?? DEFAULT_STATE.sortDir,
      view: (p.get('view') as ViewMode) ?? DEFAULT_STATE.view
    })
  });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const { views, add, remove } = useSavedViews<ExplorerState>('projects');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const stage of STAGE_FILTERS) if (stage !== 'all') c[stage] = 0;
    for (const r of rows) c[r.currentStage] = (c[r.currentStage] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => state.filter === 'all' || r.currentStage === state.filter)
      .filter((r) => matchesSearch(r, state.search))
      .sort((a, b) => compare(a, b, state.sortKey, state.sortDir));
  }, [rows, state]);

  const setField = useCallback(<K extends keyof ExplorerState>(key: K, value: ExplorerState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setActiveViewId(null);
  }, [setState]);

  function cycleSort(key: SortKey) {
    if (state.sortKey === key) setField('sortDir', state.sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setState((prev) => ({ ...prev, sortKey: key, sortDir: 'asc' }));
      setActiveViewId(null);
    }
  }

  function sortArrow(key: SortKey) {
    if (state.sortKey !== key) return null;
    return <span className="ml-1 text-ink-3">{state.sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function selectRow(id: string) {
    if (state.view === 'split') {
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', id);
      router.replace(`/projects?${params.toString()}`, { scroll: false });
    } else {
      router.push(`/projects/${id}`);
    }
  }

  function clearSelection() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : '/projects', { scroll: false });
  }

  function handleSaveView() {
    const name = prompt(t('explorer.prompt_view_name'));
    if (!name) return;
    const id = add(name, state);
    setActiveViewId(id);
  }

  return (
    <>
      <div className="flex items-end justify-between mb-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('projects.title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('explorer.showing_n_of', { n: filtered.length, all: rows.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle
            view={state.view}
            onChange={(v) => {
              setField('view', v);
              if (v !== 'split' && selectedId) clearSelection();
            }}
          />
          <button className="btn btn-primary">{t('action.new_project')}</button>
        </div>
      </div>

      <SavedViewTabs<ExplorerState>
        views={views}
        activeId={activeViewId}
        onSelectAll={() => {
          setState(DEFAULT_STATE);
          setActiveViewId(null);
        }}
        onSelectView={(v) => {
          setState(v.state);
          setActiveViewId(v.id);
        }}
        onSave={handleSaveView}
        onRemove={(id) => {
          remove(id);
          if (activeViewId === id) setActiveViewId(null);
        }}
      />

      <div className="mb-3">
        <input
          type="search"
          value={state.search}
          onChange={(e) => setField('search', e.target.value)}
          placeholder={t('explorer.search_placeholder_projects')}
          className="w-full max-w-md px-3 py-2 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STAGE_FILTERS.map((key) => {
          const active = state.filter === key;
          const n = counts[key] ?? 0;
          const label = key === 'all' ? t('explorer.filter_all') : t(`stage.${key}`);
          return (
            <button
              key={key}
              onClick={() => setField('filter', key)}
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
      ) : state.view === 'split' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <CompactList rows={filtered} selectedId={selectedId} onSelect={selectRow} />
          <div className="card max-h-[80vh] overflow-hidden">
            {selectedDetail ?? (
              <div className="text-ink-2 text-[13px] py-8 text-center">
                {t('explorer.select_a_row')}
              </div>
            )}
          </div>
        </div>
      ) : state.view === 'grid' ? (
        <CardGrid rows={filtered} onSelect={selectRow} />
      ) : (
        <TableView
          rows={filtered}
          sortKey={state.sortKey}
          cycleSort={cycleSort}
          sortArrow={sortArrow}
        />
      )}
    </>
  );
}

function ViewModeToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const t = useTranslations();
  const opts: { key: ViewMode; icon: string; labelKey: string }[] = [
    { key: 'table', icon: '☰', labelKey: 'explorer.view_table' },
    { key: 'grid', icon: '▦', labelKey: 'explorer.view_grid' },
    { key: 'split', icon: '◫', labelKey: 'explorer.view_split' }
  ];
  return (
    <div className="inline-flex bg-bg border border-line rounded-md p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 text-[12px] rounded transition-colors duration-75 ${
            view === o.key ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink'
          }`}
          title={t(o.labelKey)}
          aria-label={t(o.labelKey)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function TableView({
  rows,
  sortKey,
  cycleSort,
  sortArrow
}: {
  rows: ProjectListRow[];
  sortKey: SortKey;
  cycleSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
      <thead>
        <tr>
          <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
            <button
              onClick={() => cycleSort('reference')}
              className={`text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink ${sortKey === 'reference' ? 'text-ink' : ''}`}
            >
              {t('col.ref')}{sortArrow('reference')}
            </button>
          </th>
          <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
            <button
              onClick={() => cycleSort('title')}
              className={`text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink ${sortKey === 'title' ? 'text-ink' : ''}`}
            >
              {t('col.title')}{sortArrow('title')}
            </button>
          </th>
          <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">
            {t('col.client')}
          </th>
          <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
            <button
              onClick={() => cycleSort('stage')}
              className={`text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink ${sortKey === 'stage' ? 'text-ink' : ''}`}
            >
              {t('col.stage')}{sortArrow('stage')}
            </button>
          </th>
          <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
            <button
              onClick={() => cycleSort('budget')}
              className={`text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink ${sortKey === 'budget' ? 'text-ink' : ''}`}
            >
              {t('col.budget')}{sortArrow('budget')}
            </button>
          </th>
          <th className="text-left p-2.5 px-3.5 border-b border-line bg-bg">
            <button
              onClick={() => cycleSort('handover')}
              className={`text-[11px] uppercase tracking-wider text-ink-3 font-semibold hover:text-ink ${sortKey === 'handover' ? 'text-ink' : ''}`}
            >
              {t('col.handover')}{sortArrow('handover')}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
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
  );
}

function CardGrid({ rows, onSelect }: { rows: ProjectListRow[]; onSelect: (id: string) => void }) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/projects/${r.id}`}
          onClick={(e) => { e.preventDefault(); onSelect(r.id); }}
          className="card hover:border-line-strong cursor-pointer block transition-colors duration-75 active:bg-bg"
        >
          <div className="flex flex-wrap items-center gap-1 mb-2">
            <span className="pill pill-type pill-project">{t('entity_type.project')}</span>
            <span className={cx('pill', STAGE_PILL[r.currentStage] ?? '')}>
              {t(`stage.${r.currentStage}`)}
            </span>
          </div>
          <div className="text-[11px] text-ink-3 font-mono mb-0.5">{r.reference}</div>
          <div className="font-semibold text-[14px]">{r.title}</div>
          {r.clientName && <div className="text-[12px] text-ink-2 mt-0.5">{r.clientName}</div>}
          <div className="flex items-center justify-between mt-3 text-[11px]">
            <span className="text-ink-2">{formatMoney(r.budget, r.budgetCurrency ?? 'NOK')}</span>
            <span className="text-ink-3">{formatDate(r.targetHandoverDate)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function CompactList({
  rows,
  selectedId,
  onSelect
}: {
  rows: ProjectListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <div className="card p-0 overflow-hidden max-h-[80vh] overflow-y-auto">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const selected = selectedId === r.id;
          return (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.id)}
                className={`w-full text-left px-3 py-2 hover:bg-bg transition-colors duration-75 ${
                  selected ? 'bg-bg' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="pill pill-type pill-project">{t('entity_type.project')}</span>
                  <span className={cx('pill', STAGE_PILL[r.currentStage] ?? '')}>
                    {t(`stage.${r.currentStage}`)}
                  </span>
                  <span className="text-[13px] font-medium">{r.title}</span>
                </div>
                <div className="text-[11px] text-ink-3 mt-0.5 ml-0.5 font-mono">
                  {r.reference}
                  {r.clientName && <span className="ml-1.5 font-sans">· {r.clientName}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
