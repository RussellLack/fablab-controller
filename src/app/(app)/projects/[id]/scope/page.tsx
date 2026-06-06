import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, scopeBaselines, scopeBaselineVersions } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { formatDate, cx } from '@/lib/utils';
import { NextActionBanner } from '@/components/next-action-banner';
import { ScopeLauncher } from './scope-launcher';
import { CoachCard } from '@/components/coach-card';
import { getScopeHealth } from '@/server/queries/coach-health';

async function getScopeVersions(projectId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    const [baseline] = await db
      .select()
      .from(scopeBaselines)
      .where(eq(scopeBaselines.projectId, projectId))
      .limit(1);
    if (!baseline) return [];

    return await db
      .select({
        id: scopeBaselineVersions.id,
        versionNumber: scopeBaselineVersions.versionNumber,
        status: scopeBaselineVersions.status,
        createdAt: scopeBaselineVersions.createdAt,
        approvedAt: scopeBaselineVersions.approvedAt
      })
      .from(scopeBaselineVersions)
      .where(eq(scopeBaselineVersions.scopeBaselineId, baseline.id))
      .orderBy(desc(scopeBaselineVersions.versionNumber));
  } catch {
    return [];
  }
}

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-bg text-ink-3',
  for_review: 'bg-info-soft text-info',
  for_approval: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  superseded: 'bg-bg text-ink-3'
};

export default async function ProjectScopePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [versions, coachItems] = await Promise.all([
    getScopeVersions(id),
    getScopeHealth(id)
  ]);
  const t = await getTranslations();

  return (
    <>
      <NextActionBanner projectId={id} gate="scope" />
      <CoachCard items={coachItems} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('tab.scope')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {versions.length === 0
              ? t('scope.empty_blurb')
              : t('scope.versions_count', { count: versions.length })}
          </p>
        </div>
        <ScopeLauncher projectId={id} />
      </div>

      {versions.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('scope.empty')}</div>
      ) : (
        <table className="w-full bg-surface border border-line rounded-lg overflow-hidden">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">
                {t('scope.col_version')}
              </th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">
                {t('scope.col_status')}
              </th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">
                {t('scope.col_created')}
              </th>
              <th className="p-2.5 px-3.5 border-b border-line font-semibold">
                {t('scope.col_approved')}
              </th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="hover:bg-bg">
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <span className="ref">v{v.versionNumber}</span>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px]">
                  <span
                    className={cx(
                      'text-[11px] px-2 py-0.5 rounded-full',
                      STATUS_PILL[v.status] ?? 'bg-bg text-ink-3'
                    )}
                  >
                    {t(`scope.version_status.${v.status}`)}
                  </span>
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">
                  {formatDate(v.createdAt)}
                </td>
                <td className="p-3 px-3.5 border-b border-line text-[13px] text-ink-3">
                  {formatDate(v.approvedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {versions.length > 0 && versions.every((v) => v.status !== 'approved') && (
        <div className="mt-4 border border-line-strong bg-bg rounded-md px-3.5 py-2.5 text-[12px] text-ink-2">
          <strong className="text-ink">{t('scope.next_steps_label')}</strong>{' '}
          {t('scope.next_steps_body')}{' '}
          <Link
            href={`/projects/${id}/approvals/new`}
            className="text-accent hover:underline"
          >
            {t('scope.next_steps_link')}
          </Link>
        </div>
      )}
    </>
  );
}
