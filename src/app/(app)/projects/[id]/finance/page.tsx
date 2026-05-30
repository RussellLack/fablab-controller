import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, invoices, purchaseOrders, projects, billingTriggers, notifications } from '@/db';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { formatDate, formatMoney, cx } from '@/lib/utils';

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-bg text-ink-3',
  issued: 'bg-info-soft text-info',
  sent: 'bg-info-soft text-info',
  partially_paid: 'bg-warn-soft text-warn',
  paid: 'bg-ok-soft text-ok',
  overdue: 'bg-danger-soft text-danger',
  void: 'bg-bg text-ink-3'
};

async function getFinanceData(projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return null;

    const invs = await db.select().from(invoices)
      .where(eq(invoices.projectId, projectId))
      .orderBy(desc(invoices.createdAt));

    // Project-scoped billing triggers
    const triggers = await db.select().from(billingTriggers).where(and(
      sql`(${billingTriggers.projectId} = ${projectId} OR ${billingTriggers.projectId} IS NULL)`,
      eq(billingTriggers.active, true)
    ));

    // Pending billing recommendations from the notifications log
    const pendingRecs = await db.select().from(notifications).where(and(
      eq(notifications.kind, 'billing_recommendation'),
      sql`${notifications.link} LIKE ${`/projects/${projectId}/%`}`,
      sql`${notifications.readAt} IS NULL`
    ));

    return { project, invoices: invs, triggers, pendingRecs };
  } catch {
    return null;
  }
}

export default async function ProjectFinanceTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getFinanceData(id);
  if (!data) return <div className="text-ink-3">Unable to load finance data</div>;

  const t = await getTranslations();
  const { project, invoices: invs, triggers, pendingRecs } = data;

  // Compute rollups (use project.budget_currency as the display currency)
  const issued = invs.filter(i => ['issued', 'sent', 'partially_paid', 'overdue'].includes(i.status));
  const paid = invs.filter(i => i.status === 'paid' || i.status === 'partially_paid');
  const totalInvoiced = invs.filter(i => i.status !== 'draft' && i.status !== 'void')
    .reduce((s, i) => s + parseFloat(i.totalGross), 0);
  const totalPaid = invs.reduce((s, i) => s + parseFloat(i.amountPaid), 0);
  const totalOutstanding = invs.filter(i => i.status !== 'paid' && i.status !== 'void' && i.status !== 'draft')
    .reduce((s, i) => s + parseFloat(i.balanceDue), 0);
  const now = new Date();
  const overdue = invs.filter(i =>
    i.status !== 'paid' && i.status !== 'void' && i.status !== 'draft'
    && i.dueDate && new Date(i.dueDate) < now
  );

  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="card-title">{t('finance.budget')}</div>
          <div className="card-value">{formatMoney(project.budget, project.budgetCurrency ?? 'NOK')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('finance.invoiced')}</div>
          <div className="card-value">{formatMoney(totalInvoiced, project.budgetCurrency ?? 'NOK')}</div>
          <div className="card-meta">{invs.filter(i => i.status !== 'draft' && i.status !== 'void').length} {t('finance.invoices_count')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('finance.paid')}</div>
          <div className="card-value">{formatMoney(totalPaid, project.budgetCurrency ?? 'NOK')}</div>
        </div>
        <div className="card">
          <div className="card-title">{t('finance.outstanding')}</div>
          <div className={cx('card-value', overdue.length > 0 && 'text-danger')}>
            {formatMoney(totalOutstanding, project.budgetCurrency ?? 'NOK')}
          </div>
          {overdue.length > 0 && (
            <div className="card-meta text-danger">
              {overdue.length} {t('finance.overdue')}
            </div>
          )}
        </div>
      </div>

      {pendingRecs.length > 0 && (
        <div className="card bg-warn-soft border-warn mb-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <strong className="text-warn text-[13px]">⚠ {t('finance.pipeline_title')}</strong>
              <p className="text-warn text-[12px] mt-0.5">{t('finance.pipeline_helper')}</p>
            </div>
          </div>
          <ul className="space-y-2 text-[13px]">
            {pendingRecs.map(rec => (
              <li key={rec.id} className="border-t border-warn/30 pt-2">
                <div className="font-medium">{rec.subject}</div>
                <div className="text-[12px] text-ink-2 mt-0.5">{rec.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold">{t('finance.invoices_header')}</h3>
        <Link href={`/projects/${id}/finance/new`} className="btn btn-primary">{t('action.new_invoice')}</Link>
      </div>

      {invs.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('finance.empty')}</div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_ref')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_issued')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_due')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold text-right">{t('finance.col_total')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold text-right">{t('finance.col_paid')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold text-right">{t('finance.col_balance')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('finance.col_status')}</th>
            </tr>
          </thead>
          <tbody>
            {invs.map(inv => {
              const isOverdue = inv.dueDate && new Date(inv.dueDate) < now
                && inv.status !== 'paid' && inv.status !== 'void' && inv.status !== 'draft';
              return (
                <tr key={inv.id} className="hover:bg-bg">
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <Link href={`/projects/${id}/finance/${inv.id}`} className="ref hover:underline">{inv.reference}</Link>
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">{formatDate(inv.issueDate)}</td>
                  <td className={cx('p-3 px-3.5 border-b border-line text-[13px]', isOverdue ? 'text-danger' : 'text-ink-3')}>
                    {formatDate(inv.dueDate)}
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px] text-right">{formatMoney(inv.totalGross, inv.currency)}</td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px] text-right">{formatMoney(inv.amountPaid, inv.currency)}</td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px] text-right">{formatMoney(inv.balanceDue, inv.currency)}</td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <span className={cx('text-[11px] px-2 py-0.5 rounded-full',
                      isOverdue ? STATUS_PILL.overdue : STATUS_PILL[inv.status] ?? 'bg-bg text-ink-3'
                    )}>
                      {isOverdue ? t('finance.status.overdue') : t(`finance.status.${inv.status}`)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {triggers.length > 0 && (
        <details className="mt-6">
          <summary className="text-[13px] text-ink-2 cursor-pointer">
            {t('finance.triggers_label')} ({triggers.length})
          </summary>
          <table className="w-full mt-3 text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                <th className="py-2">{t('finance.trigger_name')}</th>
                <th className="py-2">{t('finance.trigger_event')}</th>
                <th className="py-2">{t('finance.trigger_calc')}</th>
                <th className="py-2 text-right">{t('finance.trigger_amount')}</th>
              </tr>
            </thead>
            <tbody>
              {triggers.map(tr => (
                <tr key={tr.id} className="border-b border-line">
                  <td className="py-2">{tr.name}</td>
                  <td className="py-2 text-ink-2">{t(`finance.trigger_event.${tr.triggerEvent}`)}</td>
                  <td className="py-2 text-ink-2">{t(`finance.trigger_calc.${tr.amountCalculation}`)}</td>
                  <td className="py-2 text-right">
                    {tr.amountCalculation === 'fixed' ? formatMoney(tr.amountValue, 'NOK') :
                      tr.amountPercent ? `${tr.amountPercent}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
