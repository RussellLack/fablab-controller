import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { desc, eq } from 'drizzle-orm';
import { db, riskItems, users } from '@/db';
import { NewRiskLauncher } from './new-risk-launcher';

/**
 * Per-project Risk register — module #11 in `00-` §18.
 *
 * Transverse module (not a linear gate); stays open across the
 * project lifecycle. Naming a risk + assigning it an owner + a band
 * is half the mitigation; this is where that happens.
 *
 * Layout:
 *   - "+ New risk" inline launcher
 *   - Risks sorted by score desc — what matters most is at the top
 *   - Status pill colour-coded by band (critical / high / medium / low)
 *   - One-line summary; deep-link to detail page for actions
 *
 * Doctrine: open risks (anything not closed / accepted) come first.
 * Resolved risks collapse to a "Resolved" section that staff can
 * scan for past learnings.
 */

const BAND_TONE: Record<string, string> = {
  critical: 'text-danger bg-danger-soft',
  high: 'text-warn bg-warn-soft',
  medium: 'text-info bg-info-soft',
  low: 'text-ink-3 bg-bg'
};

export default async function ProjectRiskPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();

  const rows = await db
    .select({
      id: riskItems.id,
      reference: riskItems.reference,
      title: riskItems.title,
      category: riskItems.category,
      likelihood: riskItems.likelihood,
      impact: riskItems.impact,
      score: riskItems.score,
      scoreBand: riskItems.scoreBand,
      status: riskItems.status,
      mitigationDueDate: riskItems.mitigationDueDate,
      ownerName: users.name
    })
    .from(riskItems)
    .leftJoin(users, eq(riskItems.ownerId, users.id))
    .where(eq(riskItems.projectId, id))
    .orderBy(desc(riskItems.score));

  const open = rows.filter((r) => !['closed', 'accepted'].includes(r.status));
  const resolved = rows.filter((r) => ['closed', 'accepted'].includes(r.status));

  return (
    <>
      <div className="flex items-end justify-between mb-4 gap-4">
        <p className="text-ink-2 text-[13px]">{t('risk.subtitle')}</p>
        <NewRiskLauncher projectId={id} />
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p className="text-[13px] leading-snug text-ink-2">
            {t('risk.empty_doctrine')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <RiskTable
              titleKey="risk.section.open"
              countSubKey="risk.section_sub.open"
              count={open.length}
              rows={open}
              projectId={id}
              t={t}
            />
          )}
          {resolved.length > 0 && (
            <RiskTable
              titleKey="risk.section.resolved"
              count={resolved.length}
              rows={resolved}
              projectId={id}
              t={t}
              muted
            />
          )}
        </div>
      )}
    </>
  );
}

function RiskTable({
  titleKey,
  countSubKey,
  count,
  rows,
  projectId,
  t,
  muted
}: {
  titleKey: string;
  countSubKey?: string;
  count: number;
  rows: Array<{
    id: string;
    reference: string;
    title: string;
    category: string;
    likelihood: number;
    impact: number;
    score: number;
    scoreBand: string;
    status: string;
    mitigationDueDate: string | null;
    ownerName: string | null;
  }>;
  projectId: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  muted?: boolean;
}) {
  return (
    <section className={muted ? 'opacity-80' : ''}>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[12px] uppercase tracking-wider text-ink-3">
          {t(titleKey)}
        </h2>
        <span className="text-[12px] text-ink-3">({count})</span>
        {countSubKey && (
          <span className="text-[12px] text-ink-3">· {t(countSubKey)}</span>
        )}
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
              <th className="py-2 px-3">{t('risk.col_ref')}</th>
              <th className="py-2 px-3">{t('risk.col_title')}</th>
              <th className="py-2 px-3">{t('risk.col_category')}</th>
              <th className="py-2 px-3 text-center">{t('risk.col_li')}</th>
              <th className="py-2 px-3 text-center">{t('risk.col_score')}</th>
              <th className="py-2 px-3">{t('risk.col_status')}</th>
              <th className="py-2 px-3">{t('risk.col_owner')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-bg/40">
                <td className="py-2 px-3">
                  <Link
                    href={`/projects/${projectId}/risk/${r.id}`}
                    className="ref hover:underline"
                  >
                    {r.reference}
                  </Link>
                </td>
                <td className="py-2 px-3">
                  <Link
                    href={`/projects/${projectId}/risk/${r.id}`}
                    className="hover:underline"
                  >
                    {r.title}
                  </Link>
                </td>
                <td className="py-2 px-3 text-ink-2 text-[12px]">
                  {t(`risk.category.${r.category}`)}
                </td>
                <td className="py-2 px-3 text-center text-ink-2 text-[12px]">
                  {r.likelihood}×{r.impact}
                </td>
                <td className="py-2 px-3 text-center">
                  <span className={`pill ${BAND_TONE[r.scoreBand] ?? ''}`}>
                    {r.score}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className="text-[12px]">
                    {t(`risk.status.${r.status}`)}
                  </span>
                </td>
                <td className="py-2 px-3 text-ink-2 text-[12px]">
                  {r.ownerName ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
