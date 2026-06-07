'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SavedViewTabs, useSavedViews } from '@/components/saved-views';

/**
 * Client-side explorer for /vendors — search, filter, sort, plus
 * three view modes (table / grid / split) and saved-view tabs.
 * Mirrors /clients/explorer.tsx; differences are in the row data
 * (kind enum, country, lead-time, rating) and the filter set.
 */

export type VendorRow = {
  id: string;
  name: string;
  kind: 'supplier' | 'fabricator' | 'contractor' | 'internal_workshop';
  country: string | null;
  categories: string[];
  contactName: string | null;
  contactEmail: string | null;
  typicalLeadTimeDays: number | null;
  rating: number | null;
  isAlsoClient: boolean;
};

type SortKey = 'name' | 'country' | 'leadTime' | 'rating';
type SortDir = 'asc' | 'desc';
type FilterKey = 'all' | 'dual_role' | VendorRow['kind'];
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
  view: 'grid'
};

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'explorer.filter_all' },
  { key: 'supplier', labelKey: 'vendor.kind.supplier' },
  { key: 'fabricator', labelKey: 'vendor.kind.fabricator' },
  { key: 'contractor', labelKey: 'vendor.kind.contractor' },
  { key: 'internal_workshop', labelKey: 'vendor.kind.internal_workshop' },
  { key: 'dual_role', labelKey: 'explorer.dual_role' }
];

function matchesSearch(row: VendorRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    row.name.toLowerCase().includes(needle) ||
    (row.contactName?.toLowerCase().includes(needle) ?? false) ||
    (row.contactEmail?.toLowerCase().includes(needle) ?? false) ||
    (row.country?.toLowerCase().includes(needle) ?? false) ||
    row.categories.some((c) => c.toLowerCase().includes(needle))
  );
}

function compare(a: VendorRow, b: VendorRow, key: SortKey, dir: SortDir): number {
  const mult = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'name':
      return mult * a.name.localeCompare(b.name);
    case 'country':
      return mult * (a.country ?? 'zz').localeCompare(b.country ?? 'zz');
    case 'leadTime':
      return mult * ((a.typicalLeadTimeDays ?? Infinity) - (b.typicalLeadTimeDays ?? Infinity));
    case 'rating':
      return mult * ((a.rating ?? 0) - (b.rating ?? 0));
  }
}

export function VendorsExplorer({
  rows,
  selectedDetail
}: {
  rows: VendorRow[];
  selectedDetail: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('selected');

  const [state, setState] = useState<ExplorerState>(DEFAULT_STATE);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const { views, add, remove } = useSavedViews<ExplorerState>('vendors');

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: rows.length,
      dual_role: 0,
      supplier: 0,
      fabricator: 0,
      contractor: 0,
      internal_workshop: 0
    };
    for (const r of rows) {
      c[r.kind]++;
      if (r.isAlsoClient) c.dual_role++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (state.filter === 'all') return true;
        if (state.filter === 'dual_role') return r.isAlsoClient;
        return r.kind === state.filter;
      })
      .filter((r) => matchesSearch(r, state.search))
      .sort((a, b) => compare(a, b, state.sortKey, state.sortDir));
  }, [rows, state]);

  const setField = useCallback(<K extends keyof ExplorerState>(key: K, value: ExplorerState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setActiveViewId(null);
  }, []);

  function cycleSort(key: SortKey) {
    if (state.sortKey === key) setField('sortDir', state.sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setState((prev) => ({ ...prev, sortKey: key, sortDir: 'asc' }));
      setActiveViewId(null);
    }
  }

  function sortArrow(key: SortKey) {
    if (state.sortKey !== key) return '';
    return state.sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function selectRow(id: string) {
    if (state.view === 'split') {
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', id);
      router.replace(`/vendors?${params.toString()}`, { scroll: false });
    } else {
      router.push(`/vendors/${id}`);
    }
  }

  function clearSelection() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const qs = params.toString();
    router.replace(qs ? `/vendors?${qs}` : '/vendors', { scroll: false });
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
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('vendors.title')}</h1>
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
          <Link href="/vendors/new" className="btn btn-primary">{t('action.new_vendor')}</Link>
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
          placeholder={t('explorer.search_placeholder_vendors')}
          className="w-full max-w-md px-3 py-2 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors"
        />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
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

      {/* Sort controls — only shown for grid/split (table view has clickable headers). */}
      {state.view !== 'table' && (
        <div className="flex gap-1 mb-4 text-[12px] text-ink-3 items-center">
          <span className="uppercase tracking-wider mr-1">{t('explorer.sort_by')}:</span>
          {(['name', 'country', 'leadTime', 'rating'] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => cycleSort(k)}
              className={`px-2 py-0.5 rounded-full transition-colors duration-75 ${
                state.sortKey === k ? 'bg-bg text-ink font-medium' : 'hover:text-ink'
              }`}
            >
              {t(`explorer.sort_${k}`)}
              {sortArrow(k)}
            </button>
          ))}
        </div>
      )}

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
      ) : state.view === 'table' ? (
        <TableView
          rows={filtered}
          onSelect={selectRow}
          sortKey={state.sortKey}
          cycleSort={cycleSort}
          sortArrow={sortArrow}
        />
      ) : (
        <CardGrid rows={filtered} onSelect={selectRow} />
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
  onSelect,
  sortKey,
  cycleSort,
  sortArrow
}: {
  rows: VendorRow[];
  onSelect: (id: string) => void;
  sortKey: SortKey;
  cycleSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => string;
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
                {t('clients_page.col_name')}{sortArrow('name')}
              </button>
            </th>
            <th className="text-left px-4 py-2.5">{t('clients_page.col_kind')}</th>
            <th className="text-left px-4 py-2.5">
              <button
                onClick={() => cycleSort('country')}
                className={`font-semibold uppercase tracking-wider hover:text-ink ${sortKey === 'country' ? 'text-ink' : ''}`}
              >
                {t('explorer.sort_country')}{sortArrow('country')}
              </button>
            </th>
            <th className="text-left px-4 py-2.5">{t('clients_page.col_contact')}</th>
            <th className="text-right px-4 py-2.5">
              <button
                onClick={() => cycleSort('leadTime')}
                className={`font-semibold uppercase tracking-wider hover:text-ink ${sortKey === 'leadTime' ? 'text-ink' : ''}`}
              >
                {t('explorer.sort_leadTime')}{sortArrow('leadTime')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr
              key={v.id}
              onClick={() => onSelect(v.id)}
              className="border-t border-line hover:bg-bg cursor-pointer"
            >
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="pill pill-type pill-supplier">{t('entity_type.supplier')}</span>
                    {v.isAlsoClient && (
                      <span className="pill pill-type pill-customer" title={t('entity_type.dual_role_title')}>
                        {t('entity_type.customer')}
                      </span>
                    )}
                  </div>
                  <span>{v.name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-ink-2">{t(`vendor.kind.${v.kind}`)}</td>
              <td className="px-4 py-2.5 text-ink-2 font-mono text-[12px]">{v.country ?? <span className="text-ink-3">—</span>}</td>
              <td className="px-4 py-2.5 text-ink-2">
                {v.contactName ? (
                  <>
                    {v.contactName}
                    {v.contactEmail && <span className="text-ink-3"> · {v.contactEmail}</span>}
                  </>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-ink-2">
                {v.typicalLeadTimeDays ? `${v.typicalLeadTimeDays}d` : <span className="text-ink-3">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardGrid({ rows, onSelect }: { rows: VendorRow[]; onSelect: (id: string) => void }) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((v) => (
        <Link
          key={v.id}
          href={`/vendors/${v.id}`}
          onClick={(e) => { e.preventDefault(); onSelect(v.id); }}
          className="card hover:border-line-strong cursor-pointer block transition-colors duration-75 active:bg-bg"
        >
          <div className="flex flex-wrap items-center gap-1 mb-2">
            <span className="pill pill-type pill-supplier">{t('entity_type.supplier')}</span>
            {v.isAlsoClient && (
              <span className="pill pill-type pill-customer" title={t('entity_type.dual_role_title')}>
                {t('entity_type.customer')}
              </span>
            )}
          </div>
          <div className="flex justify-between items-start">
            <div className="min-w-0">
              <div className="font-semibold text-[14px]">{v.name}</div>
              <div className="text-[11px] text-ink-3 mt-0.5">
                {t(`vendor.kind.${v.kind}`)}{v.country ? ` · ${v.country}` : ''}
              </div>
            </div>
            {v.rating && <span className="text-xs">★ {v.rating}</span>}
          </div>
          {v.categories.length > 0 && <div className="text-xs text-ink-2 mt-2.5">{v.categories.join(' · ')}</div>}
          {(v.contactName || v.contactEmail) && (
            <div className="text-xs text-ink-2 mt-1.5">
              {v.contactName}{v.contactName && v.contactEmail && ' · '}{v.contactEmail}
            </div>
          )}
          {v.typicalLeadTimeDays && (
            <div className="text-xs text-ink-3 mt-1">
              {t('entity_detail.lead_time')}: {v.typicalLeadTimeDays}d
            </div>
          )}
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
  rows: VendorRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <div className="card p-0 overflow-hidden max-h-[80vh] overflow-y-auto">
      <ul className="divide-y divide-line">
        {rows.map((v) => {
          const selected = selectedId === v.id;
          return (
            <li key={v.id}>
              <button
                onClick={() => onSelect(v.id)}
                className={`w-full text-left px-3 py-2 hover:bg-bg transition-colors duration-75 ${
                  selected ? 'bg-bg' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="pill pill-type pill-supplier">{t('entity_type.supplier')}</span>
                  {v.isAlsoClient && (
                    <span className="pill pill-type pill-customer">{t('entity_type.customer')}</span>
                  )}
                  <span className="text-[13px] font-medium">{v.name}</span>
                </div>
                <div className="text-[11px] text-ink-3 mt-0.5 ml-0.5">
                  {t(`vendor.kind.${v.kind}`)}
                  {v.country && <span className="ml-1.5">· {v.country}</span>}
                  {v.typicalLeadTimeDays && <span className="ml-1.5">· {v.typicalLeadTimeDays}d</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
