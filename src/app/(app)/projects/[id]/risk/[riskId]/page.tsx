import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { db, riskItems, users } from '@/db';
import { formatDate } from '@/lib/utils';
import { RiskActions } from './actions-client';

/**
 * Risk detail page. Header with score badge + status. Two-column
 * body: Risk description / mitigation plan on the left, scoring +
 * timeline metadata on the right. State-aware action panel matches
 * the Change Control / Delivery / Handover convention.
 */

const BAND_TONE: Record<string, string> = {
  critical: 'text-danger bg-danger-soft',
  high: 'text-warn bg-warn-soft',
  medium: 'text-info bg-info-soft',
  low: 'text-ink-3 bg-bg'
};

export default async function RiskDetailPage({
  params
}: {
  params: Promise<{ id: string; riskId: string }>;
}) {
  const { id, riskId } = await params;
  const t = await getTranslations();

  const [row] = await db
    .select({
      id: riskItems.id,
      reference: riskItems.reference,
      title: riskItems.title,
      description: riskItems.description,
      category: riskItems.category,
      likelihood: riskItems.likelihood,
      impact: riskItems.impact,
      score: riskItems.score,
      scoreBand: riskItems.scoreBand,
      status: riskItems.status,
      mitigationAction: riskItems.mitigationAction,
      mitigationDueDate: riskItems.mitigationDueDate,
      residualLikelihood: riskItems.residualLikelihood,
      residualImpact: riskItems.residualImpact,
      residualScore: riskItems.residualScore,
      identifiedAt: riskItems.identifiedAt,
      updatedAt: riskItems.updatedAt,
      ownerName: users.name
    })
    .from(riskItems)
    .leftJoin(users, eq(riskItems.ownerId, users.id))
    .where(eq(riskItems.id, riskId))
    .limit(1);
  if (!row) notFound();

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href={`/projects/${id}/risk`} className="hover:text-ink">
          {t('risk.crumb')}
        </Link>
        {' / '}
        {row.reference}
      </div>

      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{row.reference}</span>
            <span className={`pill ${BAND_TONE[row.scoreBand] ?? ''}`}>
              {row.score} · {t(`risk.band.${row.scoreBand}`)}
            </span>
            <span className="text-[12px] text-ink-2">
              {t(`risk.status.${row.status}`)}
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{row.title}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t(`risk.category.${row.category}`)}
            {row.ownerName && ` · ${t('risk.col_owner')}: ${row.ownerName}`}
          </p>
        </div>
        <RiskActions riskId={riskId} projectId={id} status={row.status} />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          {row.description && (
            <div className="card">
              <h3 className="card-title mb-2">{t('risk.section.description')}</h3>
              <p className="text-[13px] leading-6 whitespace-pre-wrap">{row.description}</p>
            </div>
          )}
          <div className="card">
            <h3 className="card-title mb-2">{t('risk.section.mitigation')}</h3>
            {row.mitigationAction ? (
              <>
                <p className="text-[13px] leading-6 whitespace-pre-wrap">
                  {row.mitigationAction}
                </p>
                {row.mitigationDueDate && (
                  <p className="text-[11px] text-ink-3 mt-2">
                    {t('risk.mitigation_due')}: {formatDate(row.mitigationDueDate)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12px] text-ink-3 italic">
                {t('risk.mitigation_empty')}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-3">{t('risk.section.score')}</h3>
            <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-3 text-[13px]">
              <dt className="text-ink-3">{t('risk.field_likelihood')}</dt>
              <dd>
                {row.likelihood} — {t(`risk.likelihood.${row.likelihood}`)}
              </dd>
              <dt className="text-ink-3">{t('risk.field_impact')}</dt>
              <dd>
                {row.impact} — {t(`risk.impact.${row.impact}`)}
              </dd>
              <dt className="text-ink-3">{t('risk.col_score')}</dt>
              <dd>
                {row.score} ({t(`risk.band.${row.scoreBand}`)})
              </dd>
              {row.residualScore !== null && (
                <>
                  <dt className="text-ink-3 col-span-2 mt-2 text-[11px] uppercase tracking-wider">
                    {t('risk.residual_heading')}
                  </dt>
                  <dt className="text-ink-3">{t('risk.field_likelihood')}</dt>
                  <dd>{row.residualLikelihood}</dd>
                  <dt className="text-ink-3">{t('risk.field_impact')}</dt>
                  <dd>{row.residualImpact}</dd>
                  <dt className="text-ink-3">{t('risk.col_score')}</dt>
                  <dd>{row.residualScore}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="card">
            <h3 className="card-title mb-3">{t('risk.section.timeline')}</h3>
            <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-3 text-[13px]">
              <dt className="text-ink-3">{t('risk.identified')}</dt>
              <dd className="text-[12px]">{formatDate(row.identifiedAt)}</dd>
              <dt className="text-ink-3">{t('risk.updated')}</dt>
              <dd className="text-[12px]">{formatDate(row.updatedAt)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
