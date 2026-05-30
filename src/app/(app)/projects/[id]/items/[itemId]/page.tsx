import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, items, packages, quotes, vendors } from '@/db';
import { eq, and } from 'drizzle-orm';
import { formatMoney, formatDate, cx } from '@/lib/utils';
import { getItemApprovalState } from '@/server/actions/approvals';

async function getItem(itemId: string, projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db.select({
      item: items, packageName: packages.name, projectId: packages.projectId
    }).from(items).innerJoin(packages, eq(items.packageId, packages.id))
      .where(and(eq(items.id, itemId), eq(packages.projectId, projectId))).limit(1);
    if (!row) return null;
    const itemQuotes = await db.select({ quote: quotes, vendorName: vendors.name })
      .from(quotes).leftJoin(vendors, eq(quotes.vendorId, vendors.id))
      .where(eq(quotes.itemId, itemId));
    return { ...row, quotes: itemQuotes };
  } catch { return null; }
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const data = await getItem(itemId, id);
  if (!data) notFound();
  const t = await getTranslations();
  const approvalState = await getItemApprovalState(itemId);
  const item = data.item;
  const winningQuote = data.quotes.find(q => q.quote.id === item.winningQuoteId);

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href={`/projects/${id}/packages`} className="hover:text-ink">{t('crumbs.packages')}</Link>{' / '}
        <Link href={`/projects/${id}/packages`} className="hover:text-ink">{data.packageName}</Link>{' / '}
        {item.name}
      </div>

      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
              {t(`item.type.${item.itemType}`)}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-info-soft text-info">
              {t(`item.status.${item.status}`)}
            </span>
            <span className={cx('text-[11px] px-2 py-0.5 rounded-full',
              approvalState === 'approved' ? 'bg-ok-soft text-ok' :
              approvalState === 'pending' ? 'bg-info-soft text-info' :
              approvalState === 'rejected' ? 'bg-danger-soft text-danger' :
              'bg-bg text-ink-3'
            )}>
              {t(`item.approval.${approvalState}`)}
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{item.name}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {item.quantity} {item.unit} · {item.category}{item.subcategory ? ` / ${item.subcategory}` : ''}
            {item.manufacturer && ` · ${item.manufacturer}`}
          </p>
        </div>
        {approvalState !== 'approved' && (
          <Link href={`/projects/${id}/approvals/new`} className="btn btn-primary">
            {t('action.request_approval_for_item')}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-2">{t('item.specification')}</h3>
            <p className="text-[13px] leading-6">{item.description ?? '—'}</p>
          </div>

          <div className="card">
            <h3 className="card-title mb-3">{t('item.quotes_header')}</h3>
            {data.quotes.length === 0 ? (
              <p className="text-[13px] text-ink-3">{t('item.no_quotes')}</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.vendor')}</th>
                    <th className="text-right py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.unit')}</th>
                    <th className="text-right py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.lead')}</th>
                    <th className="text-left py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quotes.map(({ quote, vendorName }) => (
                    <tr key={quote.id} className="border-b border-line last:border-0">
                      <td className="py-2">{vendorName ?? '—'}</td>
                      <td className="py-2 text-right">{quote.unitCost ? formatMoney(quote.unitCost, quote.currency ?? 'NOK') : '—'}</td>
                      <td className="py-2 text-right">{quote.leadTimeDays ? `${quote.leadTimeDays} d` : '—'}</td>
                      <td className="py-2">
                        <span className={cx('text-[11px] px-2 py-0.5 rounded-full',
                          quote.status === 'winning' ? 'bg-ok-soft text-ok' :
                          quote.status === 'pending' ? 'bg-warn-soft text-warn' :
                          quote.status === 'received' ? 'bg-info-soft text-info' :
                          'bg-bg text-ink-3'
                        )}>{t(`quote.status.${quote.status}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <h3 className="card-title mb-3">{t('item.commercial')}</h3>
            <dl className="grid grid-cols-[140px_1fr] gap-y-1 gap-x-4 text-[13px]">
              <dt className="text-ink-3">{t('item.cost_state')}</dt><dd>{t(`item.cost_state.${item.costState}`)}</dd>
              <dt className="text-ink-3">{t('item.winning_unit_cost')}</dt>
              <dd>{winningQuote ? formatMoney(winningQuote.quote.unitCost, winningQuote.quote.currency ?? 'NOK') : '—'}</dd>
              <dt className="text-ink-3">{t('item.country_of_origin')}</dt><dd>{item.countryOfOrigin ?? '—'}</dd>
              <dt className="text-ink-3">{t('item.hs_code')}</dt><dd>{item.hsCode ?? '—'}</dd>
              <dt className="text-ink-3">{t('item.expected_delivery')}</dt><dd>{formatDate(item.expectedDeliveryAt)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
