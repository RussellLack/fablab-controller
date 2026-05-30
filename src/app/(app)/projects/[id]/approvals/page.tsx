import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, approvals } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { formatDate, formatMoney } from '@/lib/utils';
import { ApprovalPill } from '@/components/approval-pill';

async function getApprovals(projectId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db.select().from(approvals)
      .where(eq(approvals.projectId, projectId))
      .orderBy(desc(approvals.createdAt))
      .limit(100);
  } catch {
    return [];
  }
}

function targetTypeOf(row: typeof approvals.$inferSelect): string {
  if (row.scopeBaselineVersionId) return 'approval.target.scope';
  if (row.itemId) return 'approval.target.item';
  if (row.quoteId) return 'approval.target.quote';
  if (row.purchaseOrderId) return 'approval.target.po';
  if (row.changeOrderId) return 'approval.target.change_order';
  if (row.budgetBaselineId) return 'approval.target.budget';
  return 'approval.target.unknown';
}

export default async function ApprovalsTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await getApprovals(id);
  const t = await getTranslations();

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-ink-2 text-[13px]">{rows.length} {t('approval.count_suffix')}</p>
        <Link href={`/projects/${id}/approvals/new`} className="btn btn-primary">
          {t('action.request_approval')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          {t('approval.empty')}
        </div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('approval.col_ref')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('approval.col_subject')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('approval.col_target')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('approval.col_price')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('approval.col_status')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('approval.col_sent')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('approval.col_valid_until')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-bg cursor-pointer">
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <Link href={`/projects/${id}/approvals/${r.id}`} className="ref hover:underline">{r.reference}</Link>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{r.subject}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <span className="inline-block text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
                    {t(targetTypeOf(r))}
                  </span>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  {r.price ? formatMoney(r.price, r.priceCurrency ?? 'NOK') : <span className="muted">—</span>}
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <ApprovalPill status={r.status} />
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">{formatDate(r.sentAt)}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">{formatDate(r.validUntil)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-ink-3 text-xs mt-6">{t('approval.tab_footer')}</p>
    </>
  );
}
