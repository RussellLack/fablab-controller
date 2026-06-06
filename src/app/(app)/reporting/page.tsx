import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  getProjectsByStage,
  getItemsByStatus,
  getOpenRisksByBand,
  getChangeOrdersByStatus,
  getPortfolioTotals
} from '@/server/queries/reporting';

/**
 * Cross-project Reporting view — module #12 in `00-` §18.
 *
 * Doctrine: the per-project Element List is project-level reporting
 * (live at `/projects/[id]/element-list`). This page is portfolio-
 * level: how the whole practice is doing right now, in one screen.
 *
 * Layout: a 6-tile summary strip at the top + four breakdown cards
 * (projects-by-stage, items-by-status, open-risks-by-band, open-COs).
 * All read-only. Single-pass render — every query in one Promise.all.
 */

const BAND_TONE: Record<string, string> = {
  critical: 'text-danger bg-danger-soft',
  high: 'text-warn bg-warn-soft',
  medium: 'text-info bg-info-soft',
  low: 'text-ink-3 bg-bg'
};

export default async function ReportingPage() {
  const t = await getTranslations();

  const [totals, byStage, byItemStatus, openRisks, openCOs] = await Promise.all([
    getPortfolioTotals(),
    getProjectsByStage(),
    getItemsByStatus(),
    getOpenRisksByBand(),
    getChangeOrdersByStatus()
  ]);

  // Sort the stage and item-status rows in the canonical lifecycle
  // order rather than alphabetic.
  const STAGE_ORDER = [
    'brief',
    'concept',
    'design_development',
    'specification',
    'procurement_production',
    'installation',
    'handover',
    'on_hold',
    'in_dispute',
    'cancelled',
    'archived'
  ];
  const ITEM_ORDER = [
    'specified',
    'quoted',
    'ordered',
    'in_production',
    'ready',
    'shipped',
    'received',
    'installed',
    'signed_off',
    'on_hold',
    'backorder',
    'damaged',
    'substituted',
    'cancelled'
  ];
  const sortedStages = [...byStage].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );
  const sortedItems = [...byItemStatus].sort(
    (a, b) => ITEM_ORDER.indexOf(a.status) - ITEM_ORDER.indexOf(b.status)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tighter">
          {t('reporting.title')}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1">{t('reporting.subtitle')}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile
          titleKey="reporting.tile.live_projects"
          value={totals.liveProjects}
          href="/projects"
        />
        <Tile
          titleKey="reporting.tile.items_in_flight"
          value={totals.itemsInFlight}
        />
        <Tile
          titleKey="reporting.tile.binding_po_total"
          value={formatCompactCurrency(totals.bindingPoTotal)}
        />
        <Tile
          titleKey="reporting.tile.open_risks"
          value={totals.openRisks}
          tone={totals.openRisks > 0 ? 'warn' : undefined}
        />
        <Tile
          titleKey="reporting.tile.open_change_orders"
          value={totals.openChangeOrders}
          tone={totals.openChangeOrders > 0 ? 'info' : undefined}
        />
        <Tile
          titleKey="reporting.tile.awaiting_approval"
          value={totals.awaitingApprovalCount}
          tone={totals.awaitingApprovalCount > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Breakdown
          titleKey="reporting.section.projects_by_stage"
          rows={sortedStages.map((r) => ({
            label: t(`stage.${r.stage}`),
            value: r.n
          }))}
          emptyKey="reporting.section_empty.projects"
          total={sortedStages.reduce((s, r) => s + r.n, 0)}
        />
        <Breakdown
          titleKey="reporting.section.items_by_status"
          rows={sortedItems.map((r) => ({
            label: t(`item.status.${r.status}`),
            value: r.n
          }))}
          emptyKey="reporting.section_empty.items"
          total={sortedItems.reduce((s, r) => s + r.n, 0)}
        />
        <Breakdown
          titleKey="reporting.section.open_risks_by_band"
          rows={['critical', 'high', 'medium', 'low'].map((band) => ({
            label: t(`risk.band.${band}`),
            value: openRisks.find((r) => r.band === band)?.n ?? 0,
            tone: BAND_TONE[band]
          }))}
          emptyKey="reporting.section_empty.risks"
          total={openRisks.reduce((s, r) => s + r.n, 0)}
        />
        <Breakdown
          titleKey="reporting.section.open_change_orders"
          rows={openCOs.map((r) => ({
            label: t(`change_order.status.${r.status}`),
            value: r.n
          }))}
          emptyKey="reporting.section_empty.change_orders"
          total={openCOs.reduce((s, r) => s + r.n, 0)}
        />
      </div>

      <div className="card">
        <h3 className="card-title mb-2">{t('reporting.section.deep_dive')}</h3>
        <p className="text-[12px] text-ink-2 leading-snug mb-3">
          {t('reporting.deep_dive_intro')}
        </p>
        <ul className="text-[13px] space-y-1.5">
          <li>
            <Link href="/projects" className="hover:underline">
              {t('reporting.link.projects')} →
            </Link>
          </li>
          <li>
            <Link href="/leads" className="hover:underline">
              {t('reporting.link.leads')} →
            </Link>
          </li>
          <li>
            <Link href="/finance" className="hover:underline">
              {t('reporting.link.finance')} →
            </Link>
          </li>
          <li>
            <Link href="/vendors" className="hover:underline">
              {t('reporting.link.vendors')} →
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

async function Tile({
  titleKey,
  value,
  href,
  tone
}: {
  titleKey: string;
  value: number | string;
  href?: string;
  tone?: 'warn' | 'info';
}) {
  const t = await getTranslations();
  const toneClass =
    tone === 'warn'
      ? 'border-l-2 border-warn'
      : tone === 'info'
        ? 'border-l-2 border-info'
        : '';
  const inner = (
    <div className={`card ${toneClass}`}>
      <div className="card-title">{t(titleKey)}</div>
      <div className="card-value">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80 transition-opacity">
      {inner}
    </Link>
  ) : (
    inner
  );
}

async function Breakdown({
  titleKey,
  rows,
  emptyKey,
  total
}: {
  titleKey: string;
  rows: Array<{ label: string; value: number; tone?: string }>;
  emptyKey: string;
  total: number;
}) {
  const t = await getTranslations();
  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="card-title">{t(titleKey)}</h3>
        <span className="text-[12px] text-ink-3">{total}</span>
      </div>
      {total === 0 ? (
        <p className="text-[12px] text-ink-3 italic">{t(emptyKey)}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows
            .filter((r) => r.value > 0)
            .map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <span>{r.label}</span>
                <span className={r.tone ? `pill ${r.tone}` : 'font-semibold'}>
                  {r.value}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function formatCompactCurrency(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
