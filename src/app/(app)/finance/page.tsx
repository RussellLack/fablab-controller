import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, invoices, projects, clients } from '@/db';
import { eq, sql, desc } from 'drizzle-orm';
import { formatDate, formatMoney, cx } from '@/lib/utils';

async function getReceivables() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await db.select({
      inv: invoices,
      projectRef: projects.reference,
      clientName: clients.name
    }).from(invoices)
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(sql`${invoices.status} NOT IN ('draft', 'paid', 'void')`)
      .orderBy(desc(invoices.dueDate));

    const now = new Date();
    let outstanding = 0;
    let overdueAmount = 0;
    let overdueCount = 0;

    rows.forEach(r => {
      outstanding += parseFloat(r.inv.balanceDue);
      const due = r.inv.dueDate ? new Date(r.inv.dueDate) : null;
      if (due && due < now) {
        overdueAmount += parseFloat(r.inv.balanceDue);
        overdueCount++;
      }
    });

    // This month rollups
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthIssuedRow = await db.execute<{ count: number; total: string }>(
      sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(total_gross), 0)::text AS total
          FROM invoices
          WHERE status NOT IN ('draft', 'void')
            AND issue_date >= ${monthStart.toISOString().slice(0, 10)}`
    );
    const monthPaidRow = await db.execute<{ count: number; total: string }>(
      sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::text AS total
          FROM payments
          WHERE status IN ('received', 'cleared')
            AND received_date >= ${monthStart.toISOString().slice(0, 10)}`
    );

    return {
      rows,
      outstanding,
      overdueAmount,
      overdueCount,
      monthInvoiced: monthIssuedRow[0],
      monthPaid: monthPaidRow[0]
    };
  } catch {
    return null;
  }
}

const STATUS_PILL: Record<string, string> = {
  issued: 'bg-info-soft text-info', sent: 'bg-info-soft text-info',
  partially_paid: 'bg-warn-soft text-warn',
  overdue: 'bg-danger-soft text-danger'
};

export default async function FinancePage() {
  const data = await getReceivables();
  const t = await getTranslations();
  if (!data) {
    return (
      <>
        <h1 className="text-[22px] font-semibold tracking-tighter">{t('finance.cross_title')}</h1>
        <p className="text-ink-2 text-[13px] mt-1">{t('finance.cross_sub')}</p>
        <div className="card mt-6 text-ink-2 text-[13px]">{t('finance.unavailable')}</div>
      </>
    );
  }
  const { rows, outstanding, overdueAmount, overdueCount, monthInvoiced, monthPaid } = data;
  const now = new Date();

  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tighter mb-1">{t('finance.cross_title')}</h1>
      <p className="text-ink-2 text-[13px] mb-6">{t('finance.cross_sub')}</p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="card-title">{t('finance.outstanding')}</div>
          <div className="card-value">{formatMoney(outstanding, 'NOK')}</div>
          <div className="card-meta">{rows.length} {t('finance.invoices_count')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('finance.overdue')}</div>
          <div className={cx('card-value', overdueCount > 0 && 'text-danger')}>{formatMoney(overdueAmount, 'NOK')}</div>
          <div className={cx('card-meta', overdueCount > 0 && 'text-danger')}>
            {overdueCount} {t('finance.invoices_count')}
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t('finance.month_invoiced')}</div>
          <div className="card-value">{formatMoney(monthInvoiced?.total ?? 0, 'NOK')}</div>
          <div className="card-meta">{monthInvoiced?.count ?? 0} {t('finance.invoices_count')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('finance.month_paid')}</div>
          <div className="card-value">{formatMoney(monthPaid?.total ?? 0, 'NOK')}</div>
          <div className="card-meta">{monthPaid?.count ?? 0} {t('finance.payments_count')}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold">{t('finance.receivables_header')}</h3>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('finance.no_receivables')}</div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_ref')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_project')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_client')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_due')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold text-right">{t('finance.col_balance')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ inv, projectRef, clientName }) => {
              const isOverdue = inv.dueDate && new Date(inv.dueDate) < now;
              const effective = isOverdue ? 'overdue' : inv.status;
              return (
                <tr key={inv.id} className="hover:bg-bg">
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <Link href={`/projects/${inv.projectId}/finance/${inv.id}`} className="ref hover:underline">{inv.reference}</Link>
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <Link href={`/projects/${inv.projectId}`} className="ref hover:underline">{projectRef}</Link>
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">{clientName ?? '—'}</td>
                  <td className={cx('p-3 px-3.5 border-b border-line text-[13px]', isOverdue ? 'text-danger' : 'text-ink-3')}>
                    {formatDate(inv.dueDate)}
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px] text-right">{formatMoney(inv.balanceDue, inv.currency)}</td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <span className={cx('text-[11px] px-2 py-0.5 rounded-full', STATUS_PILL[effective] ?? 'bg-bg text-ink-3')}>
                      {t(`finance.status.${effective}`)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
