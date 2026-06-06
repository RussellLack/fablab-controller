import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { desc, eq } from 'drizzle-orm';
import { db, changeOrders } from '@/db';
import { formatDate, formatMoney } from '@/lib/utils';
import { ChangeOrderLauncher } from './change-order-launcher';
import { CoachCard } from '@/components/coach-card';
import { getChangeControlHealth } from '@/server/queries/coach-health';

/**
 * Per-project change-control list. Real implementation of what was a
 * Phase-2 Coming Soon stub. Shows every change order for the project
 * with status pill, cost impact, and a launch into the create wizard.
 *
 * Sort: most recently updated first — keeps active work at the top.
 * Open vs terminal states are distinguished by pill color in the
 * StatusPill helper.
 */
export default async function ProjectChangeControlPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();

  const rows = await db
    .select({
      id: changeOrders.id,
      reference: changeOrders.reference,
      title: changeOrders.title,
      requestedBy: changeOrders.requestedBy,
      requestedByExternal: changeOrders.requestedByExternal,
      dateRequested: changeOrders.dateRequested,
      status: changeOrders.status,
      costImpactAmount: changeOrders.costImpactAmount,
      costImpactCurrency: changeOrders.costImpactCurrency,
      timeImpactDays: changeOrders.timeImpactDays,
      updatedAt: changeOrders.updatedAt
    })
    .from(changeOrders)
    .where(eq(changeOrders.projectId, id))
    .orderBy(desc(changeOrders.updatedAt));

  const coachItems = await getChangeControlHealth(id);

  return (
    <>
      <CoachCard items={coachItems} />

      <div className="flex items-end justify-between mb-4 gap-4">
        <p className="text-ink-2 text-[13px]">{t('change_order.subtitle')}</p>
        <ChangeOrderLauncher projectId={id} />
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p className="text-[13px] leading-snug text-ink-2">
            {t('change_order.empty_doctrine')}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                <th className="py-2 px-3">{t('change_order.col_ref')}</th>
                <th className="py-2 px-3">{t('change_order.col_title')}</th>
                <th className="py-2 px-3">{t('change_order.col_requested_by')}</th>
                <th className="py-2 px-3">{t('change_order.col_date')}</th>
                <th className="py-2 px-3 text-right">{t('change_order.col_cost_impact')}</th>
                <th className="py-2 px-3">{t('change_order.col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-bg/40">
                  <td className="py-2 px-3">
                    <Link
                      href={`/projects/${id}/change-control/${r.id}`}
                      className="ref hover:underline"
                    >
                      {r.reference}
                    </Link>
                  </td>
                  <td className="py-2 px-3">
                    <Link
                      href={`/projects/${id}/change-control/${r.id}`}
                      className="hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-ink-2">
                    {r.requestedByExternal ??
                      t(`change_order.requested_by.${r.requestedBy}`)}
                  </td>
                  <td className="py-2 px-3 text-ink-2 text-[12px]">
                    {formatDate(r.dateRequested)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {r.costImpactAmount !== null
                      ? formatMoney(
                          r.costImpactAmount,
                          r.costImpactCurrency ?? 'NOK'
                        )
                      : '—'}
                    {r.timeImpactDays != null && (
                      <span className="text-[11px] text-ink-3 ml-2">
                        {t('change_order.cost_time_days', { n: r.timeImpactDays })}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <StatusPill status={r.status} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusPill({
  status,
  t
}: {
  status: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  // Color by lifecycle phase:
  //   - open work (not yet sent/implemented) → info
  //   - sent for approval                     → warn (waiting on client)
  //   - approved (not yet implemented)        → accent (action: implement!)
  //   - implemented / closed                  → ok (done)
  //   - rejected / withdrawn                  → muted
  const tone: string =
    status === 'closed' || status === 'implemented'
      ? 'text-ok bg-ok-soft'
      : status === 'approved'
        ? 'text-accent bg-accent-soft'
        : status === 'sent_for_approval'
          ? 'text-warn bg-warn-soft'
          : status === 'rejected' || status === 'withdrawn'
            ? 'text-ink-3 bg-bg'
            : 'text-info bg-info-soft';
  return (
    <span className={`pill ${tone}`}>
      {t(`change_order.status.${status}`)}
    </span>
  );
}
