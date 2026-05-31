import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, purchaseOrders, vendors } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { formatDate, formatMoney, cx } from '@/lib/utils';
import { BindingBadge, poStatusToBinding } from '@/components/binding-badge';

async function getPos(projectId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db.select({
      po: purchaseOrders, vendorName: vendors.name
    }).from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(eq(purchaseOrders.projectId, projectId))
      .orderBy(desc(purchaseOrders.createdAt));
  } catch { return []; }
}

const PO_PILL: Record<string, string> = {
  draft: 'bg-bg text-ink-3',
  ready_for_review: 'bg-info-soft text-info',
  issued: 'bg-accent-soft text-accent',
  confirmed: 'bg-ok-soft text-ok',
  partially_fulfilled: 'bg-warn-soft text-warn',
  fulfilled: 'bg-ok-soft text-ok',
  cancelled: 'bg-danger-soft text-danger'
};

export default async function PosTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await getPos(id);
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-ink-2 text-[13px]">{rows.length} {t('po.count_suffix')}</p>
        <Link href={`/projects/${id}/pos/new`} className="btn btn-primary">{t('action.new_po')}</Link>
      </div>
      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('po.empty')}</div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('po.col_ref')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('po.col_vendor')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('po.col_total')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('po.col_status')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('po.col_issued')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ po, vendorName }) => (
              <tr key={po.id} className="hover:bg-bg">
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <Link href={`/projects/${id}/pos/${po.id}`} className="ref hover:underline">{po.reference}</Link>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{vendorName ?? '—'}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{formatMoney(po.totalGross, po.currency)}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className={cx('text-[11px] px-2 py-0.5 rounded-full', PO_PILL[po.status] ?? 'bg-bg text-ink-3')}>
                      {t(`po.status.${po.status}`)}
                    </span>
                    <BindingBadge state={poStatusToBinding(po.status)} />
                  </div>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">{formatDate(po.issuedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
