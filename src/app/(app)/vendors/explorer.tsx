'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Client-side explorer for /vendors — search, sort, filter pills.
 * Mirrors /clients in shape but adapted for vendor data: filter by
 * vendor kind, dual-role status, or country; sort by name, country,
 * lead time, or rating.
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

export function VendorsExplorer({ rows }: { rows: VendorRow[] }) {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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
        if (filter === 'all') return true;
        if (filter === 'dual_role') return r.isAlsoClient;
        return r.kind === filter;
      })
      .filter((r) => matchesSearch(r, search))
      .sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [rows, filter, search, sortKey, sortDir]);

  function cycleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('vendors.title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('explorer.showing_n_of', { n: filtered.length, all: rows.length })}
          </p>
        </div>
        <Link href="/vendors/new" className="btn btn-primary">
          {t('action.new_vendor')}
        </Link>
      </div>

      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('explorer.search_placeholder_vendors')}
          className="w-full max-w-md px-3 py-2 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors"
        />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {FILTERS.map(({ key, labelKey }) => {
          const active = filter === key;
          const n = counts[key];
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
              {t(labelKey)}
              <span className={active ? 'text-surface/70' : 'text-ink-3'}>· {n}</span>
            </button>
          );
        })}
      </div>

      {/* Sort controls — distinct from filters because vendors uses a card grid
          (no clickable column headers like the /clients table). */}
      <div className="flex gap-1 mb-4 text-[12px] text-ink-3 items-center">
        <span className="uppercase tracking-wider mr-1">{t('explorer.sort_by')}:</span>
        {(['name', 'country', 'leadTime', 'rating'] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => cycleSort(k)}
            className={`px-2 py-0.5 rounded-full transition-colors duration-75 ${
              sortKey === k
                ? 'bg-bg text-ink font-medium'
                : 'hover:text-ink'
            }`}
          >
            {t(`explorer.sort_${k}`)}
            {sortArrow(k)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('explorer.no_results')}</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((v) => (
            <Link
              key={v.id}
              href={`/vendors/${v.id}`}
              className="card hover:border-line-strong cursor-pointer block transition-colors duration-75 active:bg-bg"
            >
              <div className="flex flex-wrap items-center gap-1 mb-2">
                <span className="pill pill-type pill-supplier">{t('entity_type.supplier')}</span>
                {v.isAlsoClient && (
                  <span
                    className="pill pill-type pill-customer"
                    title={t('entity_type.dual_role_title')}
                  >
                    {t('entity_type.customer')}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="font-semibold text-[14px]">{v.name}</div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    {t(`vendor.kind.${v.kind}`)}
                    {v.country ? ` · ${v.country}` : ''}
                  </div>
                </div>
                {v.rating && <span className="text-xs">★ {v.rating}</span>}
              </div>
              {v.categories.length > 0 && (
                <div className="text-xs text-ink-2 mt-2.5">{v.categories.join(' · ')}</div>
              )}
              {(v.contactName || v.contactEmail) && (
                <div className="text-xs text-ink-2 mt-1.5">
                  {v.contactName}
                  {v.contactName && v.contactEmail && ' · '}
                  {v.contactEmail}
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
      )}
    </>
  );
}
