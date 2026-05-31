import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getElementListData } from '../queries';
import { computeItemPrices, aggregateItemPrices, formatNok } from '@/lib/element-list-math';
import { ElementListViewSwitch } from '@/components/element-list/view-switch';

export const dynamic = 'force-dynamic';

export default async function ElementListCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getElementListData(id);
  if (!data) notFound();
  const t = await getTranslations();
  const { project, items } = data;

  // Mask: filter out items hidden from customer view BEFORE compute
  const visible = items.filter(it => it.showOnCustomerView);
  const computed = visible.map(it => ({
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
      <div className="rounded-lg border border-accent/20 bg-accent-soft text-accent p-3.5 mb-4 text-[13px]">
        <strong>{t('elementList.bannerCustomer')}</strong>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <ElementListViewSwitch projectId={id} current="customer" />
        <span className="text-xs text-ink-3">
          {visible.length} {t('elementList.itemsCount')} · {t('elementList.vatLabel')} {project.vatRate}%
        </span>
      </div>

      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-bg border-b border-line">
            <tr>
              <Th>#</Th>
              <Th>{t('elementList.col.image')}</Th>
              <Th>{t('elementList.col.item')}</Th>
              <ThR>{t('elementList.col.qty')}</ThR>
              <ThR>{t('elementList.col.unitListPrice')}</ThR>
              <ThR>{t('elementList.col.listPriceExVat')}</ThR>
              <ThR>{t('elementList.col.discount')}</ThR>
              <ThR>{t('elementList.col.subTotalExVat')}</ThR>
              <ThR>{t('elementList.col.subTotalIncVat')}</ThR>
            </tr>
          </thead>
          <tbody>
            {computed.map(({ row, p }, idx) => (
              <tr key={row.id} className="border-b border-line">
                <Td muted>{idx + 1}</Td>
                <Td>
                  <div className="w-10 h-10 rounded bg-bg grid place-items-center overflow-hidden">
                    {row.thumbUrl ? (
                      <img src={row.thumbUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-ink-3">·</span>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="font-semibold">{row.name}</div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    {[row.manufacturer, row.material, row.colour].filter(Boolean).join(' · ') || '—'}
                  </div>
                </Td>
                <TdR>{p.quantity}</TdR>
                <TdR>{formatNok(p.unitListPrice)}</TdR>
                <TdR>{formatNok(p.clientNet)}</TdR>
                <TdR muted={p.effectiveDiscountPct === 0}>{p.effectiveDiscountPct > 0 ? <span className="text-accent font-semibold">−{p.effectiveDiscountPct}%</span> : '—'}</TdR>
                <TdR>{formatNok(p.finalNetPrice)}</TdR>
                <TdR>{formatNok(p.finalGrossPrice)}</TdR>
              </tr>
            ))}
            {computed.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-ink-3 py-10">{t('elementList.empty')}</td></tr>
            ) : (
              <>
                <tr className="bg-bg font-semibold border-t-2 border-line-strong">
                  <Td colSpan={5}>{t('elementList.totalExVat')}</Td>
                  <TdR>{formatNok(totals.clientNet)}</TdR>
                  <TdR>{totals.discountValue > 0 ? `−${formatNok(totals.discountValue)}` : '—'}</TdR>
                  <TdR>{formatNok(totals.finalNetPrice)}</TdR>
                  <TdR></TdR>
                </tr>
                <tr className="bg-bg font-semibold">
                  <Td colSpan={8}>{t('elementList.vatLabel')} {project.vatRate}%</Td>
                  <TdR>{formatNok(totals.vatAmount)}</TdR>
                </tr>
                <tr className="bg-bg font-bold text-[15px]">
                  <Td colSpan={8}>{t('elementList.totalIncVat')}</Td>
                  <TdR>{formatNok(totals.finalGrossPrice)} {project.budgetCurrency}</TdR>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
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
  return <td colSpan={colSpan} className={`px-2 py-2.5 align-middle ${muted ? 'text-ink-3' : ''}`}>{children}</td>;
}
function TdR({ children, muted }: { children?: React.ReactNode; muted?: boolean }) {
  return <td className={`px-2 py-2.5 align-middle text-right tabular-nums ${muted ? 'text-ink-3' : ''}`}>{children}</td>;
}
