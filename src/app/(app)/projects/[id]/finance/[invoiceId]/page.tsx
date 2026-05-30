import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, invoices, invoiceLines, payments, clients, purchaseOrders } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { formatDate, formatMoney, cx } from '@/lib/utils';
import { InvoiceActions } from './actions-client';

async function getInvoice(invoiceId: string, projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db.select({
      inv: invoices,
      clientName: clients.name,
      clientContact: clients.primaryContactEmail
    }).from(invoices).leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(eq(invoices.id, invoiceId), eq(invoices.projectId, projectId)))
      .limit(1);
    if (!row) return null;

    const lines = await db.select({
      line: invoiceLines,
      poRef: purchaseOrders.reference
    }).from(invoiceLines)
      .leftJoin(purchaseOrders, eq(invoiceLines.purchaseOrderId, purchaseOrders.id))
      .where(eq(invoiceLines.invoiceId, invoiceId));

    const pays = await db.select().from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(desc(payments.receivedDate));

    return { ...row, lines, payments: pays };
  } catch { return null; }
}

const BANNER: Record<string, { tone: string; labelKey: string; bodyKey: string }> = {
  draft:          { tone: 'bg-bg border-line-strong text-ink-2',         labelKey: 'invoice.banner.draft',    bodyKey: 'invoice.banner.draft_body' },
  issued:         { tone: 'bg-info-soft border-info text-info',          labelKey: 'invoice.banner.issued',   bodyKey: 'invoice.banner.issued_body' },
  sent:           { tone: 'bg-info-soft border-info text-info',          labelKey: 'invoice.banner.sent',     bodyKey: 'invoice.banner.sent_body' },
  partially_paid: { tone: 'bg-warn-soft border-warn text-warn',          labelKey: 'invoice.banner.partial',  bodyKey: 'invoice.banner.partial_body' },
  paid:           { tone: 'bg-ok-soft border-ok text-ok',                labelKey: 'invoice.banner.paid',     bodyKey: 'invoice.banner.paid_body' },
  overdue:        { tone: 'bg-danger-soft border-danger text-danger',    labelKey: 'invoice.banner.overdue',  bodyKey: 'invoice.banner.overdue_body' },
  void:           { tone: 'bg-bg border-line-strong text-ink-2',         labelKey: 'invoice.banner.void',     bodyKey: 'invoice.banner.void_body' }
};

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-bg text-ink-3', issued: 'bg-info-soft text-info', sent: 'bg-info-soft text-info',
  partially_paid: 'bg-warn-soft text-warn', paid: 'bg-ok-soft text-ok',
  overdue: 'bg-danger-soft text-danger', void: 'bg-bg text-ink-3'
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;
  const data = await getInvoice(invoiceId, id);
  if (!data) notFound();
  const t = await getTranslations();
  const inv = data.inv;
  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date()
    && inv.status !== 'paid' && inv.status !== 'void' && inv.status !== 'draft';
  const effectiveStatus = isOverdue ? 'overdue' : inv.status;
  const banner = BANNER[effectiveStatus] ?? BANNER.draft;

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href={`/projects/${id}/finance`} className="hover:text-ink">{t('crumbs.finance')}</Link>{' / '}
        {inv.reference}
      </div>

      <div className={cx('border-2 rounded-lg p-3.5 px-4.5 mb-4', banner!.tone)}>
        <div className="text-[11px] uppercase tracking-wider font-bold">{t(banner!.labelKey)}</div>
        <div className="text-[13px] mt-1 leading-snug">{t(banner!.bodyKey)}</div>
      </div>

      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{inv.reference}</span>
            <span className={cx('text-[11px] px-2 py-0.5 rounded-full', STATUS_PILL[effectiveStatus])}>
              {t(`finance.status.${effectiveStatus}`)}
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {t('invoice.to')} {data.clientName ?? '—'}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {data.lines.length} {t('invoice.lines_label')} · {formatMoney(inv.totalGross, inv.currency)} {t('invoice.gross')} · {t('invoice.due')} {formatDate(inv.dueDate)}
          </p>
        </div>
        <InvoiceActions invoiceId={invoiceId} projectId={id} status={inv.status} balanceDue={inv.balanceDue} currency={inv.currency} />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-3">{t('invoice.lines_header')}</h3>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="py-2">{t('invoice.col_description')}</th>
                  <th className="py-2 text-right">{t('invoice.col_qty')}</th>
                  <th className="py-2 text-right">{t('invoice.col_unit')}</th>
                  <th className="py-2 text-right">{t('invoice.col_total')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map(({ line, poRef }) => (
                  <tr key={line.id} className="border-b border-line last:border-0">
                    <td className="py-2">
                      <div>{line.description}</div>
                      {poRef && <div className="text-[11px] text-ink-3 mt-0.5">{t('invoice.linked_po')}: {poRef}</div>}
                      {line.milestoneType && <div className="text-[11px] text-ink-3 mt-0.5">{t(`invoice.milestone.${line.milestoneType}`)}</div>}
                    </td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    <td className="py-2 text-right">{formatMoney(line.unitPrice, inv.currency)}</td>
                    <td className="py-2 text-right">{formatMoney(line.lineTotal, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink font-semibold">
                  <td colSpan={3} className="pt-2.5 pr-2 text-right">{t('invoice.subtotal_net')}</td>
                  <td className="pt-2.5 text-right">{formatMoney(inv.subtotalNet, inv.currency)}</td>
                </tr>
                <tr className="text-ink-2">
                  <td colSpan={3} className="pr-2 text-right">{t('invoice.vat_at', { rate: inv.vatRate })}</td>
                  <td className="text-right">{formatMoney(inv.vatAmount, inv.currency)}</td>
                </tr>
                <tr className="font-semibold text-[15px]">
                  <td colSpan={3} className="pr-2 text-right">{t('invoice.total_gross')}</td>
                  <td className="text-right">{formatMoney(inv.totalGross, inv.currency)}</td>
                </tr>
                <tr className="text-ok text-[13px]">
                  <td colSpan={3} className="pr-2 text-right">{t('invoice.paid_to_date')}</td>
                  <td className="text-right">−{formatMoney(inv.amountPaid, inv.currency)}</td>
                </tr>
                <tr className="font-semibold border-t border-line">
                  <td colSpan={3} className="pt-2 pr-2 text-right">{t('invoice.balance_due')}</td>
                  <td className="pt-2 text-right">{formatMoney(inv.balanceDue, inv.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.payments.length > 0 && (
            <div className="card">
              <h3 className="card-title mb-3">{t('invoice.payments_header')}</h3>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                    <th className="py-2">{t('invoice.payment_ref')}</th>
                    <th className="py-2">{t('invoice.payment_date')}</th>
                    <th className="py-2">{t('invoice.payment_method')}</th>
                    <th className="py-2">{t('invoice.payment_status')}</th>
                    <th className="py-2 text-right">{t('invoice.payment_amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map(p => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="py-2 ref">{p.reference}</td>
                      <td className="py-2 text-ink-2">{formatDate(p.receivedDate)}</td>
                      <td className="py-2 text-ink-2">{t(`invoice.method.${p.method}`)}</td>
                      <td className="py-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-ok-soft text-ok">
                          {t(`invoice.payment_status.${p.status}`)}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium">{formatMoney(p.amount, p.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-3">{t('invoice.client')}</h3>
            <div className="text-[13px]">
              <div className="font-semibold">{data.clientName ?? '—'}</div>
              {data.clientContact && <div className="text-ink-2 text-[12px] mt-1">{data.clientContact}</div>}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title mb-3">{t('invoice.dates')}</h3>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-3 text-[13px]">
              <dt className="text-ink-3">{t('invoice.issued_date')}</dt><dd>{formatDate(inv.issueDate)}</dd>
              <dt className="text-ink-3">{t('invoice.due_date')}</dt>
              <dd className={cx(isOverdue && 'text-danger font-medium')}>
                {formatDate(inv.dueDate)}
                {isOverdue && ` ${t('invoice.days_late', { days: Math.ceil((Date.now() - new Date(inv.dueDate!).getTime()) / 86400000) })}`}
              </dd>
              {inv.sentAt && (<><dt className="text-ink-3">{t('invoice.sent_at')}</dt><dd>{formatDate(inv.sentAt)}</dd></>)}
              {inv.paidAt && (<><dt className="text-ink-3">{t('invoice.paid_at')}</dt><dd>{formatDate(inv.paidAt)}</dd></>)}
            </dl>
          </div>

          {inv.terms && (
            <div className="card">
              <h3 className="card-title mb-2">{t('invoice.terms')}</h3>
              <p className="text-[12px] text-ink-2 whitespace-pre-line">{inv.terms}</p>
            </div>
          )}

          {inv.notes && (
            <div className="card">
              <h3 className="card-title mb-2">{t('invoice.notes')}</h3>
              <p className="text-[12px] text-ink-2 whitespace-pre-line">{inv.notes}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
