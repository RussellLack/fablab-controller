'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ClickableRow } from '@/components/clickable-row';
import { SavedViewTabs, useSavedViews } from '@/components/saved-views';

/**
 * Client-side explorer for /clients.
 *
 *   • Search by name / contact / org no.
 *   • Filter pills: kind enum + dual-role.
 *   • Sort by name / kind / active-project count.
 *   • View mode: table | grid | split.
 *      - In split mode the list lives on the left, a server-rendered
 *        detail panel (passed in via `selectedDetail`) on the right.
 *        Selection is URL state (?selected=<id>) so refresh + share
 *        both work; the list's React filter/sort state is untouched.
 *   • Saved views: tab strip up top, localStorage-backed. Each tab
 *      captures the full explorer snapshot (search + filter + sort
 *      + view) — perfect for "Cultural clients with active projects"
 *      or other repeated mental queries.
 */

export type ClientRow = {
  id: string;
  name: string;
  kind: 'individual' | 'business' | 'public_sector' | 'cultural_institution' | 'hospitality_group';
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  orgNumber: string | null;
  paymentTermsDays: number;
  activeProjects: number;
  isAlsoVendor: boolean;
};

type SortKey = 'name' | 'kind' | 'activeProjects';
type SortDir = 'asc' | 'desc';
type FilterKey = 'all' | 'dual_role' | ClientRow['kind'];
type ViewMode = 'table' | 'grid' | 'split';

type ExplorerState = {
  search: string;
  filter: FilterKey;
  sortKey: SortKey;
  sortDir: SortDir;
  view: ViewMode;
};

const DEFAULT_STATE: ExplorerState = {
  search: '',
  filter: 'all',
  sortKey: 'name',
  sortDir: 'asc',
  view: 'table'
};

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'explorer.filter_all' },
  { key: 'individual', labelKey: 'client_kind.individual' },
  { key: 'business', labelKey: 'client_kind.business' },
  { key: 'public_sector', labelKey: 'client_kind.public_sector' },
  { key: 'cultural_institution', labelKey: 'client_kind.cultural_institution' },
  { key: 'hospitality_group', labelKey: 'client_kind.hospitality_group' },
  { key: 'dual_role', labelKey: 'explorer.dual_role' }
];

function matchesSearch(row: ClientRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    row.name.toLowerCase().includes(needle) ||
    (row.primaryContactName?.toLowerCase().includes(needle) ?? false) ||
    (row.primaryContactEmail?.toLowerCase().includes(needle) ?? false) ||
    (row.orgNumber?.toLowerCase().includes(needle) ?? false)
  );
}

function compare(a: ClientRow, b: ClientRow, key: SortKey, dir: SortDir): number {
  const mult = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'name':
      return mult * a.name.localeCompare(b.name);
    case 'kind':
      return mult * a.kind.localeCompare(b.kind);
    case 'activeProjects':
      return mult * (a.activeProjects - b.activeProjects);
  }
}

export function ClientsExplorer({
  rows,
  selectedDetail
}: {
  rows: ClientRow[];
  /** Pre-rendered detail panel — only present when ?selected=<id> is in the URL. */
  selectedDetail: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('selected');

  const [state, setState] = useState<ExplorerState>(DEFAULT_STATE);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const { views, add, remove } = useSavedViews<ExplorerState>('clients');

  // Per-pill counts shown on the filter buttons. Computed on the full,
  // unfiltered set so the numbers stay stable while you type / filter.
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: rows.length,
      dual_role: 0,
      individual: 0,
      business: 0,
      public_sector: 0,
      cultural_institution: 0,
      hospitality_group: 0
    };
    for (const r of rows) {
      c[r.kind]++;
      if (r.isAlsoVendor) c.dual_role++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (state.filter === 'all') return true;
        if (state.filter === 'dual_role') return r.isAlsoVendor;
        return r.kind === state.filter;
      })
      .filter((r) => matchesSearch(r, state.search))
      .sort((a, b) => compare(a, b, state.sortKey, state.sortDir));
  }, [rows, state]);

  const setField = useCallback(<K extends keyof ExplorerState>(key: K, value: ExplorerState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setActiveViewId(null); // any manual change leaves the named-view tab
  }, []);

  function cycleSort(key: SortKey) {
    if (state.sortKey === key) setField('sortDir', state.sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setState((prev) => ({ ...prev, sortKey: key, sortDir: 'asc' }));
      setActiveViewId(null);
    }
  }

  function sortIndicator(key: SortKey) {
    if (state.sortKey !== key) return null;
    return <span className="ml-1 text-ink-3">{state.sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function selectRow(id: string) {
    if (state.view === 'split') {
      // Stay on the page; just update the selection in URL so the server
      // re-fetches the detail panel.
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', id);
      router.replace(`/clients?${params.toString()}`, { scroll: false });
    } else {
      router.push(`/clients/${id}`);
    }
  }

  function handleSaveView() {
    const name = prompt(t('explorer.prompt_view_name'));
    if (!name) return;
    const id = add(name, state);
    setActiveViewId(id);
  }

  function applyView(state: ExplorerState, id: string) {
    setState(state);
    setActiveViewId(id);
  }

  function clearSelection() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const qs = params.toString();
    router.replace(qs ? `/clients?${qs}` : '/clients', { scroll: false });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('nav.clients')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('explorer.showing_n_of', { n: filtered.length, all: rows.length })}
          </p>
        </div>
        <ViewModeToggle
          view={state.view}
          onChange={(v) => {
            setField('view', v);
            // Leaving split mode clears the URL selection so refresh doesn't
            // leave a dangling ?selected= param in the URL.
            if (v !== 'split' && selectedId) clearSelection();
          }}
        />
      </div>

      {/* Saved-view tabs */}
      <SavedViewTabs<ExplorerState>
        views={views}
        activeId={activeViewId}
        onSelectAll={() => {
          setState(DEFAULT_STATE);
          setActiveViewId(null);
        }}
        onSelectView={(v) => applyView(v.state, v.id)}
        onSave={handleSaveView}
        onRemove={(id) => {
          remove(id);
          if (activeViewId === id) setActiveViewId(null);
        }}
      />

      {/* Search */}
      <div className="mb-3">
        <input
          type="search"
          value={state.search}
          onChange={(e) => setField('search', e.target.value)}
          placeholder={t('explorer.search_placeholder_clients')}
          className="w-full max-w-md px-3 py-2 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map(({ key, labelKey }) => {
          const active = state.filter === key;
          const n = counts[key];
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
              {t(labelKey)}
              <span className={active ? 'text-surface/70' : 'text-ink-3'}>· {n}</span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('explorer.no_results')}</div>
      ) : state.view === 'split' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <CompactList
            rows={filtered}
            selectedId={selectedId}
            onSelect={selectRow}
          />
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
        <FullTable
          rows={filtered}
          onSelect={selectRow}
          sortKey={state.sortKey}
          cycleSort={cycleSort}
          sortIndicator={sortIndicator}
        />
      )}
    </>
  );
}

/* ─────────────────── view-mode toggle ─────────────────── */

function ViewModeToggle({
  view,
  onChange
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
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
          className={`px-2.5 py-1 text-[12px] rounded transition-colors duration-75 inline-flex items-center gap-1 ${
            view === o.key
              ? 'bg-ink text-surface'
              : 'text-ink-2 hover:text-ink'
          }`}
          title={t(o.labelKey)}
          aria-label={t(o.labelKey)}
        >
          <span>{o.icon}</span>
        </button>
      ))}
    </div>
  );
}

/* ─────────────────── full table view ─────────────────── */

function FullTable({
  rows,
  onSelect,
  sortKey,
  cycleSort,
  sortIndicator
}: {
  rows: ClientRow[];
  onSelect: (id: string) => void;
  sortKey: SortKey;
  cycleSort: (key: SortKey) => void;
  sortIndicator: (key: SortKey) => React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
          <tr>
            <th className="text-left px-4 py-2.5">
              <button
                onClick={() => cycleSort('name')}
                className={`font-semibold uppercase tracking-wider hover:text-ink ${sortKey === 'name' ? 'text-ink' : ''}`}
              >
                {t('clients_page.col_name')}
                {sortIndicator('name')}
              </button>
            </th>
            <th className="text-left px-4 py-2.5">
              <button
                onClick={() => cycleSort('kind')}
                className={`font-semibold uppercase tracking-wider hover:text-ink ${sortKey === 'kind' ? 'text-ink' : ''}`}
              >
                {t('clients_page.col_kind')}
                {sortIndicator('kind')}
              </button>
            </th>
            <th className="text-left px-4 py-2.5">{t('clients_page.col_contact')}</th>
            <th className="text-left px-4 py-2.5">{t('clients_page.col_org')}</th>
            <th className="text-right px-4 py-2.5">{t('clients_page.col_terms')}</th>
            <th className="text-right px-4 py-2.5">
              <button
                onClick={() => cycleSort('activeProjects')}
                className={`font-semibold uppercase tracking-wider hover:text-ink ${sortKey === 'activeProjects' ? 'text-ink' : ''}`}
              >
                {t('clients_page.col_active')}
                {sortIndicator('activeProjects')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <ClickableRow key={c.id} href={`/clients/${c.id}`}>
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="pill pill-type pill-customer">{t('entity_type.customer')}</span>
                    {c.isAlsoVendor && (
                      <span className="pill pill-type pill-supplier" title={t('entity_type.dual_role_title')}>
                        {t('entity_type.supplier')}
                      </span>
                    )}
                  </div>
                  <Link href={`/clients/${c.id}`} className="hover:underline" onClick={(e) => { e.preventDefault(); onSelect(c.id); }}>
                    {c.name}
                  </Link>
                </div>
              </td>
              <td className="px-4 py-2.5 text-ink-2">{t(`client_kind.${c.kind}`)}</td>
              <td className="px-4 py-2.5 text-ink-2">
                {c.primaryContactName ? (
                  <>
                    {c.primaryContactName}
                    {c.primaryContactEmail && <span className="text-ink-3"> · {c.primaryContactEmail}</span>}
                  </>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-2 font-mono text-[12px]">
                {c.orgNumber ?? <span className="text-ink-3">—</span>}
              </td>
              <td className="px-4 py-2.5 text-right text-ink-2">
                {c.paymentTermsDays}{t('clients_page.days_suffix')}
              </td>
              <td className="px-4 py-2.5 text-right">
                {c.activeProjects > 0 ? (
                  <span className="inline-block bg-accent-soft text-accent text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                    {c.activeProjects}
                  </span>
                ) : (
                  <span className="text-ink-3">0</span>
                )}
              </td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────── card grid view ─────────────────── */

function CardGrid({ rows, onSelect }: { rows: ClientRow[]; onSelect: (id: string) => void }) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((c) => (
        <Link
          key={c.id}
          href={`/clients/${c.id}`}
          onClick={(e) => { e.preventDefault(); onSelect(c.id); }}
          className="card hover:border-line-strong cursor-pointer block transition-colors duration-75 active:bg-bg"
        >
          <div className="flex flex-wrap items-center gap-1 mb-2">
            <span className="pill pill-type pill-customer">{t('entity_type.customer')}</span>
            {c.isAlsoVendor && (
              <span className="pill pill-type pill-supplier" title={t('entity_type.dual_role_title')}>
                {t('entity_type.supplier')}
              </span>
            )}
          </div>
          <div className="font-semibold text-[14px]">{c.name}</div>
          <div className="text-[11px] text-ink-3 mt-0.5">{t(`client_kind.${c.kind}`)}</div>
          {c.primaryContactName && (
            <div className="text-xs text-ink-2 mt-2.5">
              {c.primaryContactName}
              {c.primaryContactEmail && <span className="text-ink-3"> · {c.primaryContactEmail}</span>}
            </div>
          )}
          <div className="flex items-center justify-between mt-3 text-[11px] text-ink-3">
            <span>{c.orgNumber ? <span className="font-mono">{c.orgNumber}</span> : '—'}</span>
            <span>
              {c.paymentTermsDays}{t('clients_page.days_suffix')}
              {c.activeProjects > 0 && (
                <span className="ml-2 inline-block bg-accent-soft text-accent text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  {c.activeProjects}
                </span>
              )}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────── compact list (split mode) ─────────────────── */

function CompactList({
  rows,
  selectedId,
  onSelect
}: {
  rows: ClientRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <div className="card p-0 overflow-hidden max-h-[80vh] overflow-y-auto">
      <ul className="divide-y divide-line">
        {rows.map((c) => {
          const selected = selectedId === c.id;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-3 py-2 hover:bg-bg transition-colors duration-75 ${
                  selected ? 'bg-bg' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="pill pill-type pill-customer">{t('entity_type.customer')}</span>
                  {c.isAlsoVendor && (
                    <span className="pill pill-type pill-supplier">{t('entity_type.supplier')}</span>
                  )}
                  <span className={`text-[13px] font-medium ${selected ? 'text-ink' : 'text-ink'}`}>{c.name}</span>
                </div>
                <div className="text-[11px] text-ink-3 mt-0.5 ml-0.5">
                  {t(`client_kind.${c.kind}`)}
                  {c.primaryContactEmail && <span className="ml-1.5">· {c.primaryContactEmail}</span>}
                  {c.activeProjects > 0 && (
                    <span className="ml-1.5 text-accent">· {c.activeProjects} active</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
