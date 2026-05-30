import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, rfqs } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { formatDate, cx } from '@/lib/utils';

async function getRfqs(projectId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db.select().from(rfqs).where(eq(rfqs.projectId, projectId)).orderBy(desc(rfqs.createdAt));
  } catch { return []; }
}

const RFQ_PILL: Record<string, string> = {
  draft: 'bg-bg text-ink-3',
  sent: 'bg-info-soft text-info',
  responses_received: 'bg-warn-soft text-warn',
  evaluating: 'bg-warn-soft text-warn',
  awarded: 'bg-ok-soft text-ok',
  closed_no_award: 'bg-bg text-ink-3',
  cancelled: 'bg-danger-soft text-danger'
};

export default async function RfqsTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await getRfqs(id);
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-ink-2 text-[13px]">{rows.length} {t('rfq.count_suffix')}</p>
        <Link href={`/projects/${id}/rfqs/new`} className="btn btn-primary">{t('action.new_rfq')}</Link>
      </div>
      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('rfq.empty')}</div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('rfq.col_ref')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('rfq.col_title')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('rfq.col_status')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('rfq.col_deadline')}</th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">{t('rfq.col_sent')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-bg">
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <Link href={`/projects/${id}/rfqs/${r.id}`} className="ref hover:underline">{r.reference}</Link>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">{r.title}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <span className={cx('text-[11px] px-2 py-0.5 rounded-full', RFQ_PILL[r.status] ?? 'bg-bg text-ink-3')}>
                    {t(`rfq.status.${r.status}`)}
                  </span>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">{formatDate(r.responseDeadline)}</td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">{formatDate(r.sentAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
