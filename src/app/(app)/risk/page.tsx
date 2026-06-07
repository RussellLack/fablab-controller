import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db, riskItems, projects, users } from '@/db';
import { formatDate } from '@/lib/utils';

/**
 * Cross-project Risk register.
 *
 * Aggregates risk_items across EVERY active project. Default view shows
 * open risks (anything not closed / accepted) grouped by score band,
 * critical first so triage starts where it should. Each row links back
 * to its project's risk detail page so staff can act from the
 * cross-project view without losing context.
 *
 * Filter pill row supports two slices: by band, and by Open / Resolved
 * status. The Open view is the operational lens (what should we tackle
 * this week?); the Resolved view is the learning lens (what did we
 * actually have to mitigate last quarter?).
 *
 * Pairs with the per-project /projects/[id]/risk page — the project
 * page is the authoring surface, this one is the triage surface.
 */

const BAND_TONE: Record<string, string> = {
  critical: 'text-danger bg-danger-soft',
  high: 'text-warn bg-warn-soft',
  medium: 'text-info bg-info-soft',
  low: 'text-ink-3 bg-bg'
};

const BAND_ORDER = ['critical', 'high', 'medium', 'low'] as const;
type Band = (typeof BAND_ORDER)[number];

const RESOLVED_STATUSES = ['closed', 'accepted'] as const;

type Row = {
  id: string;
  reference: string;
  title: string;
  category: string;
  likelihood: number;
  impact: number;
  score: number;
  scoreBand: Band;
  status: string;
  mitigationDueDate: string | null;
  projectId: string;
  projectReference: string;
  projectTitle: string;
  ownerName: string | null;
};

async function getRiskRows(view: 'open' | 'resolved' | 'all'): Promise<Row[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const baseSelect = db
      .select({
        id: riskItems.id,
        reference: riskItems.reference,
        title: riskItems.title,
        category: riskItems.category,
        likelihood: riskItems.likelihood,
        impact: riskItems.impact,
        score: riskItems.score,
        scoreBand: riskItems.scoreBand,
        status: riskItems.status,
        mitigationDueDate: riskItems.mitigationDueDate,
        projectId: riskItems.projectId,
        projectReference: projects.reference,
        projectTitle: projects.title,
        ownerName: users.name
      })
      .from(riskItems)
      .innerJoin(projects, eq(riskItems.projectId, projects.id))
      .leftJoin(users, eq(riskItems.ownerId, users.id));

    const query =
      view === 'open'
        ? baseSelect.where(notInArray(riskItems.status, [...RESOLVED_STATUSES]))
        : view === 'resolved'
        ? baseSelect.where(inArray(riskItems.status, [...RESOLVED_STATUSES]))
        : baseSelect;

    const rows = await query.orderBy(desc(riskItems.score), riskItems.mitigationDueDate);
    return rows as Row[];
  } catch {
    return [];
  }
}

async function getCounts(): Promise<{
  total: number;
  open: number;
  resolved: number;
  byBand: Record<Band, number>;
  overdue: number;
}> {
  if (!process.env.DATABASE_URL) {
    return { total: 0, open: 0, resolved: 0, byBand: { critical: 0, high: 0, medium: 0, low: 0 }, overdue: 0 };
  }
  try {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${riskItems.status} not in ('closed', 'accepted'))::int`,
        resolved: sql<number>`count(*) filter (where ${riskItems.status} in ('closed', 'accepted'))::int`,
        critical: sql<number>`count(*) filter (where ${riskItems.scoreBand} = 'critical' and ${riskItems.status} not in ('closed', 'accepted'))::int`,
        high: sql<number>`count(*) filter (where ${riskItems.scoreBand} = 'high' and ${riskItems.status} not in ('closed', 'accepted'))::int`,
        medium: sql<number>`count(*) filter (where ${riskItems.scoreBand} = 'medium' and ${riskItems.status} not in ('closed', 'accepted'))::int`,
        low: sql<number>`count(*) filter (where ${riskItems.scoreBand} = 'low' and ${riskItems.status} not in ('closed', 'accepted'))::int`,
        overdue: sql<number>`count(*) filter (
          where ${riskItems.status} not in ('closed', 'accepted')
            and ${riskItems.mitigationDueDate} is not null
            and ${riskItems.mitigationDueDate} < current_date
        )::int`
      })
      .from(riskItems);
    return {
      total: row?.total ?? 0,
      open: row?.open ?? 0,
      resolved: row?.resolved ?? 0,
      byBand: {
        critical: row?.critical ?? 0,
        high: row?.high ?? 0,
        medium: row?.medium ?? 0,
        low: row?.low ?? 0
      },
      overdue: row?.overdue ?? 0
    };
  } catch {
    return { total: 0, open: 0, resolved: 0, byBand: { critical: 0, high: 0, medium: 0, low: 0 }, overdue: 0 };
  }
}

export default async function GlobalRiskRegisterPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; band?: string }>;
}) {
  const sp = await searchParams;
  const view: 'open' | 'resolved' | 'all' =
    sp.view === 'resolved' ? 'resolved' : sp.view === 'all' ? 'all' : 'open';
  const bandFilter = (sp.band ?? null) as Band | null;

  const [rows, counts] = await Promise.all([getRiskRows(view), getCounts()]);
  const t = await getTranslations();

  const filteredRows = bandFilter ? rows.filter((r) => r.scoreBand === bandFilter) : rows;

  // Bucket by band (rows already sorted by score desc)
  const byBand: Record<Band, Row[]> = { critical: [], high: [], medium: [], low: [] };
  for (const r of filteredRows) byBand[r.scoreBand].push(r);

  const today = new Date().toISOString().slice(0, 10);
  function isOverdue(due: string | null) {
    return due !== null && due < today;
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tighter">
          {t('risk_register.title')}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1 max-w-2xl">
          {t('risk_register.subtitle')}
        </p>
      </div>

      {/* Headline KPI strip */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <Kpi
          label={t('risk_register.kpi_critical')}
          value={counts.byBand.critical}
          tone="text-danger bg-danger-soft"
        />
        <Kpi
          label={t('risk_register.kpi_high')}
          value={counts.byBand.high}
          tone="text-warn bg-warn-soft"
        />
        <Kpi
          label={t('risk_register.kpi_medium')}
          value={counts.byBand.medium}
          tone="text-info bg-info-soft"
        />
        <Kpi
          label={t('risk_register.kpi_low')}
          value={counts.byBand.low}
          tone="text-ink-2 bg-bg"
        />
        <Kpi
          label={t('risk_register.kpi_overdue')}
          value={counts.overdue}
          tone={counts.overdue > 0 ? 'text-accent bg-accent-soft' : 'text-ink-3 bg-bg'}
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-2 flex-wrap">
        <ViewPill href="/risk" active={view === 'open'} label={t('risk_register.view_open')} n={counts.open} />
        <ViewPill href="/risk?view=resolved" active={view === 'resolved'} label={t('risk_register.view_resolved')} n={counts.resolved} />
        <ViewPill href="/risk?view=all" active={view === 'all'} label={t('risk_register.view_all')} n={counts.total} />
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <BandPill view={view} band={null} active={bandFilter === null}>
          {t('risk_register.band_all')}
        </BandPill>
        {BAND_ORDER.map((b) => (
          <BandPill key={b} view={view} band={b} active={bandFilter === b}>
            <span className={`pill ${BAND_TONE[b]}`}>{t(`risk.band.${b}`)}</span>
          </BandPill>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('risk_register.empty')}</div>
      ) : (
        <div className="space-y-6">
          {BAND_ORDER.map((band) => {
            const bandRows = byBand[band];
            if (bandRows.length === 0) return null;
            return (
              <section key={band}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`pill ${BAND_TONE[band]}`}>{t(`risk.band.${band}`)}</span>
                  <span className="text-[12px] text-ink-3">· {bandRows.length}</span>
                </div>
                <div className="card overflow-hidden p-0">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
                        <th className="py-2 px-3">{t('risk.col_ref')}</th>
                        <th className="py-2 px-3">{t('risk_register.col_project')}</th>
                        <th className="py-2 px-3">{t('risk.col_title')}</th>
                        <th className="py-2 px-3">{t('risk.col_category')}</th>
                        <th className="py-2 px-3 text-center">{t('risk.col_score')}</th>
                        <th className="py-2 px-3">{t('risk.col_status')}</th>
                        <th className="py-2 px-3">{t('risk.col_owner')}</th>
                        <th className="py-2 px-3">{t('risk_register.col_due')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bandRows.map((r) => {
                        const overdue = isOverdue(r.mitigationDueDate);
                        return (
                          <tr
                            key={r.id}
                            className="border-b border-line last:border-0 hover:bg-bg/40"
                          >
                            <td className="py-2 px-3">
                              <Link
                                href={`/projects/${r.projectId}/risk/${r.id}`}
                                className="ref hover:underline"
                              >
                                {r.reference}
                              </Link>
                            </td>
                            <td className="py-2 px-3">
                              <Link
                                href={`/projects/${r.projectId}`}
                                className="hover:underline"
                              >
                                <span className="font-mono text-[11px] text-ink-3">
                                  {r.projectReference}
                                </span>
                                <span className="ml-1.5 text-[12px]">{r.projectTitle}</span>
                              </Link>
                            </td>
                            <td className="py-2 px-3">
                              <Link
                                href={`/projects/${r.projectId}/risk/${r.id}`}
                                className="hover:underline"
                              >
                                {r.title}
                              </Link>
                            </td>
                            <td className="py-2 px-3 text-ink-2 text-[12px]">
                              {t(`risk.category.${r.category}`)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`pill ${BAND_TONE[r.scoreBand]}`}>
                                {r.score}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[12px]">
                              {t(`risk.status.${r.status}`)}
                            </td>
                            <td className="py-2 px-3 text-ink-2 text-[12px]">
                              {r.ownerName ?? '—'}
                            </td>
                            <td className="py-2 px-3 text-[12px]">
                              {r.mitigationDueDate ? (
                                <span className={overdue ? 'text-accent font-semibold' : 'text-ink-3'}>
                                  {formatDate(r.mitigationDueDate)}
                                  {overdue && (
                                    <span className="ml-1 text-[10px] uppercase tracking-wider">
                                      {t('risk_register.overdue_tag')}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-ink-3">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className={`card-value mt-1 inline-block px-2 rounded ${tone}`}>{value}</div>
    </div>
  );
}

function ViewPill({
  href,
  active,
  label,
  n
}: {
  href: string;
  active: boolean;
  label: string;
  n: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-colors duration-75 ${
        active
          ? 'bg-ink text-surface border-ink'
          : 'bg-surface text-ink-2 border-line hover:text-ink active:bg-line'
      }`}
    >
      {label}
      <span className={active ? 'text-surface/70' : 'text-ink-3'}>· {n}</span>
    </Link>
  );
}

function BandPill({
  view,
  band,
  active,
  children
}: {
  view: 'open' | 'resolved' | 'all';
  band: Band | null;
  active: boolean;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  if (view !== 'open') params.set('view', view);
  if (band) params.set('band', band);
  const qs = params.toString();
  return (
    <Link
      href={qs ? `/risk?${qs}` : '/risk'}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-colors duration-75 ${
        active
          ? 'bg-bg text-ink border-line-strong'
          : 'bg-surface text-ink-2 border-line hover:text-ink active:bg-line'
      }`}
    >
      {children}
    </Link>
  );
}
