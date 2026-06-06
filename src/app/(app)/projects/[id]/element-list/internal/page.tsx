import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getElementListData } from '../queries';
import { computeItemPrices, aggregateItemPrices, formatNok } from '@/lib/element-list-math';
import { ElementListViewSwitch } from '@/components/element-list/view-switch';

export const dynamic = 'force-dynamic';

export default async function ElementListInternalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getElementListData(id);
  if (!data) notFound();
  const t = await getTranslations();
  const { project, items } = data;

  // Compute the cascade per row
  const computed = items.map(it => ({
    row: it,
    p: computeItemPrices({
      unitCost: it.unitCost,
      quantity: it.quantity,
      targetMarginPct: it.targetMarginPct,
      itemDiscountPct: it.discountPct,
      projectDefaultDiscountPct: project.defaultDiscountPct,
      projectVatRate: project.vatRate,
      manualClientNet: it.clientPrice
    })
  }));

  const totals = aggregateItemPrices(computed.map(c => c.p), Number(project.vatRate));

  return (
    <div>
      <div className="rounded-lg border border-info/20 bg-info-soft text-info p-3.5 mb-4 text-[13px]">
        <strong>{t('elementList.bannerInternal')}</strong>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <ElementListViewSwitch projectId={id} current="internal" />
        <span className="text-xs text-ink-3">
          {items.length} {t('elementList.itemsCount')}
        </span>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-sm" disabled title={t('common.comingSoon')}>
            {t('elementList.printBtn')}
          </button>
          <button className="btn btn-sm btn-primary" disabled title={t('common.comingSoon')}>
            {t('elementList.exportBtn')}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="el el-internal w-full">
          <thead>
            <tr className="border-b border-line bg-bg">
              <Th>#</Th>
              <Th>{t('elementList.col.image')}</Th>
              <Th>{t('elementList.col.item')}</Th>
              <Th>{t('elementList.col.vendor')}</Th>
              <ThR>{t('elementList.col.unitCost')}</ThR>
              <ThR>{t('elementList.col.qty')}</ThR>
              <ThR>{t('elementList.col.unitTotalValue')}</ThR>
              <ThR>{t('elementList.col.marginPct')}</ThR>
              <ThR>{t('elementList.col.markup')}</ThR>
              <ThR>{t('elementList.col.clientNet')}</ThR>
              <ThR>{t('elementList.col.discountPct')}</ThR>
              <ThR>{t('elementList.col.priceCustomerExVat')}</ThR>
              <ThR>{t('elementList.col.priceCustomerIncVat')}</ThR>
              <Th>{t('elementList.col.state')}</Th>
            </tr>
          </thead>
          <tbody>
            {computed.map(({ row, p }, idx) => (
              <tr key={row.id} className="border-b border-line">
                <Td muted>{idx + 1}</Td>
                <Td>
                  <div className="w-10 h-10 rounded bg-bg grid place-items-center overflow-hidden">
                    {row.thumbUrl ? (
                      // 40x40 table thumbnail from a Supabase signed URL.
                      // next/image would need a remote-pattern config + would
                      // cache-invalidate every time the URL signature rotates;
                      // the LCP gain on a 40-px image isn't worth the round-trip.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.thumbUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-ink-3">·</span>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="font-semibold text-[13px]">{row.name}</div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    {[row.manufacturer, row.sku, row.material, row.colour].filter(Boolean).join(' · ') || row.description || '—'}
                  </div>
                </Td>
                <Td>{row.vendorName ?? <span className="text-ink-3">—</span>}</Td>
                <TdR>{formatNok(p.unitCost)}</TdR>
                <TdR>{p.quantity}</TdR>
                <TdR>{formatNok(p.unitTotalValue)}</TdR>
                <TdR>{p.marginPct !== null ? `${p.marginPct}%` : '—'}</TdR>
                <TdR>{formatNok(p.markup)}</TdR>
                <TdR>{formatNok(p.clientNet)}</TdR>
                <TdR muted={p.effectiveDiscountPct === 0}>{p.effectiveDiscountPct > 0 ? `−${p.effectiveDiscountPct}%` : '—'}</TdR>
                <TdR>{formatNok(p.finalNetPrice)}</TdR>
                <TdR>{formatNok(p.finalGrossPrice)}</TdR>
                <Td><span className={`pill pill-${row.status.replace(/_/g, '')}`}>{t(`itemStatus.${row.status}` as never, { default: row.status })}</span></Td>
              </tr>
            ))}
            {computed.length === 0 ? (
              <tr>
                <td colSpan={14} className="text-center text-ink-3 text-[13px] py-10">
                  {t('elementList.empty')}
                </td>
              </tr>
            ) : (
              <tr className="totals bg-bg font-semibold border-t-2 border-line-strong">
                <Td colSpan={3}>{t('elementList.totals')} ({items.length} {t('elementList.itemsCount')})</Td>
                <Td></Td>
                <TdR>—</TdR>
                <TdR>—</TdR>
                <TdR>{formatNok(totals.unitTotalValue)}</TdR>
                <TdR>{totals.marginPct !== null ? `${totals.marginPct}%` : '—'}</TdR>
                <TdR>{formatNok(totals.markup)}</TdR>
                <TdR>{formatNok(totals.clientNet)}</TdR>
                <TdR>{totals.discountValue > 0 ? `−${formatNok(totals.discountValue)}` : '—'}</TdR>
                <TdR>{formatNok(totals.finalNetPrice)}</TdR>
                <TdR>{formatNok(totals.finalGrossPrice)}</TdR>
                <Td></Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-3 mt-3">
        {t('elementList.cascadeNote')}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left text-[10px] uppercase tracking-wider text-ink-3 font-semibold px-2 py-2.5">{children}</th>;
}
function ThR({ children }: { children: React.ReactNode }) {
  return <th className="text-right text-[10px] uppercase tracking-wider text-ink-3 font-semibold px-2 py-2.5">{children}</th>;
}
function Td({ children, muted, colSpan }: { children?: React.ReactNode; muted?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-2 py-2.5 align-middle ${muted ? 'text-ink-3' : ''} text-[13px]`}>
      {children}
    </td>
  );
}
function TdR({ children, muted }: { children?: React.ReactNode; muted?: boolean }) {
  return (
    <td className={`px-2 py-2.5 align-middle text-right tabular-nums ${muted ? 'text-ink-3' : ''} text-[13px]`}>
      {children}
    </td>
  );
}
