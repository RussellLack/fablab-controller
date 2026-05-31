import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getElementListData } from '../../queries';
import { ElementListViewSwitch } from '@/components/element-list/view-switch';
import { formatNok } from '@/lib/element-list-math';

export const dynamic = 'force-dynamic';

export default async function ElementListSupplierVendorPage({
  params
}: { params: Promise<{ id: string; vendorId: string }> }) {
  const { id, vendorId } = await params;
  const data = await getElementListData(id);
  if (!data) notFound();
  const t = await getTranslations();
  const { items } = data;

  const visible = items.filter(it => it.vendorId === vendorId);
  if (visible.length === 0) notFound();
  const vendorName = visible[0]!.vendorName ?? '—';

  // Per row: just unit cost × qty in the supplier's currency
  const rows = visible.map(it => {
    const unitCost = it.unitCost ? Number(it.unitCost) : null;
    const qty = Number(it.quantity);
    const lineTotal = unitCost !== null ? unitCost * qty : null;
    return { it, unitCost, qty, lineTotal, currency: it.unitCostCurrency ?? '—' };
  });
  const lineTotalSum = rows.reduce((acc, r) => acc + (r.lineTotal ?? 0), 0);
  const currency = rows[0]?.currency ?? '—';

  return (
    <div>
      <div className="rounded-lg border border-ok/20 bg-ok-soft text-ok p-3.5 mb-4 text-[13px]">
        <strong>{t('elementList.bannerSupplier')}</strong> — {vendorName}
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <ElementListViewSwitch projectId={id} current="supplier" />
        <Link href={`/projects/${id}/element-list/supplier`} className="text-[12px] text-ink-2 hover:text-ink">← {t('elementList.view.supplier')}</Link>
        <span className="text-xs text-ink-3">
          {visible.length} {t('elementList.itemsCount')}
        </span>
      </div>

      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-bg border-b border-line">
            <tr>
              <Th>#</Th>
              <Th>{t('elementList.col.image')}</Th>
              <Th>{t('elementList.col.item')}</Th>
              <Th>SKU</Th>
              <ThR>{t('elementList.col.qty')}</ThR>
              <ThR>{t('elementList.col.unitCost')}</ThR>
              <Th>Currency</Th>
              <ThR>Line total</ThR>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ it, unitCost, qty, lineTotal, currency }, idx) => (
              <tr key={it.id} className="border-b border-line">
                <Td muted>{idx + 1}</Td>
                <Td>
                  <div className="w-10 h-10 rounded bg-bg grid place-items-center overflow-hidden">
                    {it.thumbUrl ? (
                      <img src={it.thumbUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-ink-3">·</span>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="font-semibold">{it.name}</div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    {[it.manufacturer, it.material, it.colour].filter(Boolean).join(' · ') || '—'}
                  </div>
                </Td>
                <Td><span className="font-mono text-[11px]">{it.sku ?? '—'}</span></Td>
                <TdR>{qty}</TdR>
                <TdR>{formatNok(unitCost)}</TdR>
                <Td>{currency}</Td>
                <TdR>{formatNok(lineTotal)}</TdR>
              </tr>
            ))}
            <tr className="bg-bg font-semibold border-t-2 border-line-strong">
              <Td colSpan={4}>{t('elementList.totals')} ({visible.length})</Td>
              <TdR>—</TdR>
              <TdR>—</TdR>
              <Td>{currency}</Td>
              <TdR>{formatNok(lineTotalSum)}</TdR>
            </tr>
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
