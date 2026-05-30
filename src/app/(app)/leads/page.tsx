import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { db, leads } from '@/db';
import { sql, desc } from 'drizzle-orm';
import { formatDate, cx } from '@/lib/utils';
import { intakeCompleteness } from '@/lib/validations/lead';
import { IntakeMeter } from '@/components/intake-meter';

async function getLeads() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db.select().from(leads)
      .where(sql`${leads.status} NOT IN ('converted', 'lost', 'archived')`)
      .orderBy(desc(leads.receivedAt))
      .limit(100);
  } catch {
    return [];
  }
}

const STATUS_PILL: Record<string, string> = {
  new: 'pill-brief',
  qualifying: 'pill-spec',
  qualified: 'pill-brief',
  proposal_sent: 'pill-brief'
};

export default async function LeadsPage() {
  const rows = await getLeads();
  return <LeadsList rows={rows} />;
}

function LeadsList({ rows }: { rows: Awaited<ReturnType<typeof getLeads>> }) {
  const t = useTranslations();
  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('leads.title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">{rows.length} active</p>
        </div>
        <Link href="/leads/new" className="btn btn-primary">{t('action.new_lead')}</Link>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          No leads yet. Click <Link href="/leads/new" className="text-info hover:underline">+ New lead</Link> to capture an enquiry.
        </div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('lead.col_ref')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('lead.col_client')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('lead.col_type')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('lead.col_received')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold w-[220px]">{t('lead.col_intake')}</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-3 p-2.5 px-3.5 border-b border-line bg-bg font-semibold">{t('lead.col_status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const meter = intakeCompleteness(r as unknown as Record<string, unknown>);
              return (
                <tr key={r.id} className="hover:bg-bg cursor-pointer">
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <Link href={`/leads/${r.id}`} className="ref hover:underline">{r.reference}</Link>
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">{r.prospectiveClientName ?? <span className="muted">—</span>}</td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    {r.projectType ? (
                      <span className="inline-block text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">{t(`type.${r.projectType}`)}</span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">{formatDate(r.receivedAt)}</td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <IntakeMeter complete={meter.complete} total={meter.total} percent={meter.percent} />
                  </td>
                  <td className="p-3 px-3.5 border-b border-line text-[13px]">
                    <span className={cx('pill', STATUS_PILL[r.status] ?? '')}>{t(`lead.status.${r.status}`)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
