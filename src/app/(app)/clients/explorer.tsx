'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ClickableRow } from '@/components/clickable-row';

/**
 * Client-side explorer for /clients — search, sort, filter pills.
 *
 * The data is fetched server-side and passed in whole; with ~100 rows
 * this is plenty fast and gives the responsiveness of pure JS state
 * (no round-trips on each keypress).
 *
 * Sortable columns: Name, Kind, Active projects. Click a header to
 * cycle asc → desc → original.
 *
 * Filter pills slice by `kind` (one of the client_kind enum values)
 * plus a "Dual-role" toggle that limits to clients also registered
 * as vendors.
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

export function ClientsExplorer({ rows }: { rows: ClientRow[] }) {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Per-filter counts shown on the pills (so you can see at a glance
  // how many are in each bucket). Computed on the unfiltered, unsearched
  // set so the numbers stay stable as the user types.
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
        if (filter === 'all') return true;
        if (filter === 'dual_role') return r.isAlsoVendor;
        return r.kind === filter;
      })
      .filter((r) => matchesSearch(r, search))
      .sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [rows, filter, search, sortKey, sortDir]);

  function onHeaderClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-ink-3">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <>
      {/* Header — count line reflects the live filter */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('nav.clients')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('explorer.showing_n_of', { n: filtered.length, all: rows.length })}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('explorer.search_placeholder_clients')}
          className="w-full max-w-md px-3 py-2 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('explorer.no_results')}</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <tr>
                <th className="text-left px-4 py-2.5">
                  <button
                    onClick={() => onHeaderClick('name')}
                    className="font-semibold uppercase tracking-wider hover:text-ink"
                  >
                    {t('clients_page.col_name')}
                    {sortIndicator('name')}
                  </button>
                </th>
                <th className="text-left px-4 py-2.5">
                  <button
                    onClick={() => onHeaderClick('kind')}
                    className="font-semibold uppercase tracking-wider hover:text-ink"
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
                    onClick={() => onHeaderClick('activeProjects')}
                    className="font-semibold uppercase tracking-wider hover:text-ink"
                  >
                    {t('clients_page.col_active')}
                    {sortIndicator('activeProjects')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <ClickableRow key={c.id} href={`/clients/${c.id}`}>
                  <td className="px-4 py-2.5 font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="pill pill-type pill-customer">
                          {t('entity_type.customer')}
                        </span>
                        {c.isAlsoVendor && (
                          <span
                            className="pill pill-type pill-supplier"
                            title={t('entity_type.dual_role_title')}
                          >
                            {t('entity_type.supplier')}
                          </span>
                        )}
                      </div>
                      <Link href={`/clients/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {t(`client_kind.${c.kind}`)}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {c.primaryContactName ? (
                      <>
                        {c.primaryContactName}
                        {c.primaryContactEmail && (
                          <span className="text-ink-3"> · {c.primaryContactEmail}</span>
                        )}
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
      )}
    </>
  );
}
