import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getElementListData } from '../queries';
import { ElementListViewSwitch } from '@/components/element-list/view-switch';

export const dynamic = 'force-dynamic';

export default async function ElementListSupplierIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getElementListData(id);
  if (!data) notFound();
  const t = await getTranslations();
  const { items } = data;

  // Aggregate per vendor — supplier view requires picking one
  const byVendor = new Map<string, { id: string; name: string; count: number }>();
  for (const it of items) {
    if (!it.vendorId || !it.vendorName) continue;
    const cur = byVendor.get(it.vendorId);
    if (cur) cur.count++;
    else byVendor.set(it.vendorId, { id: it.vendorId, name: it.vendorName, count: 1 });
  }
  const vendors = Array.from(byVendor.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="rounded-lg border border-ok/20 bg-ok-soft text-ok p-3.5 mb-4 text-[13px]">
        <strong>{t('elementList.bannerSupplier')}</strong>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <ElementListViewSwitch projectId={id} current="supplier" />
      </div>

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3 text-[13px]">
          {t('elementList.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {vendors.map(v => (
            <Link
              key={v.id}
              href={`/projects/${id}/element-list/supplier/${v.id}`}
              className="rounded-lg border border-line p-4 hover:bg-bg block"
            >
              <div className="font-semibold text-[14px]">{v.name}</div>
              <div className="text-[12px] text-ink-3 mt-1">{v.count} {t('elementList.itemsCount')}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
