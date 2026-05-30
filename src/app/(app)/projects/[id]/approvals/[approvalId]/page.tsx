import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { db, approvals, users } from '@/db';
import { eq } from 'drizzle-orm';
import { formatDate, formatMoney, cx } from '@/lib/utils';
import { ApprovalPill } from '@/components/approval-pill';
import { ApprovalActions } from './actions-client';

async function getApproval(approvalId: string, projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db
      .select({
        approval: approvals,
        requestedByName: users.name
      })
      .from(approvals)
      .leftJoin(users, eq(approvals.requestedBy, users.id))
      .where(eq(approvals.id, approvalId))
      .limit(1);
    if (!row || row.approval.projectId !== projectId) return null;
    return row;
  } catch {
    return null;
  }
}

function targetTypeKey(row: typeof approvals.$inferSelect): string {
  if (row.scopeBaselineVersionId) return 'approval.target.scope';
  if (row.itemId) return 'approval.target.item';
  if (row.quoteId) return 'approval.target.quote';
  if (row.purchaseOrderId) return 'approval.target.po';
  if (row.changeOrderId) return 'approval.target.change_order';
  if (row.budgetBaselineId) return 'approval.target.budget';
  return 'approval.target.unknown';
}

function bannerVariant(status: string): { tone: 'info' | 'ok' | 'warn' | 'danger' | 'muted'; labelKey: string; bodyKey: string } {
  switch (status) {
    case 'draft':
      return { tone: 'muted', labelKey: 'approval.banner.draft', bodyKey: 'approval.banner.draft_body' };
    case 'sent_for_approval':
      return { tone: 'info', labelKey: 'approval.banner.sent', bodyKey: 'approval.banner.sent_body' };
    case 'approved':
      return { tone: 'ok', labelKey: 'approval.banner.approved', bodyKey: 'approval.banner.approved_body' };
    case 'approved_with_conditions':
      return { tone: 'warn', labelKey: 'approval.banner.conditions', bodyKey: 'approval.banner.conditions_body' };
    case 'rejected':
      return { tone: 'danger', labelKey: 'approval.banner.rejected', bodyKey: 'approval.banner.rejected_body' };
    case 'expired':
      return { tone: 'danger', labelKey: 'approval.banner.expired', bodyKey: 'approval.banner.expired_body' };
    case 'superseded':
      return { tone: 'muted', labelKey: 'approval.banner.superseded', bodyKey: 'approval.banner.superseded_body' };
    default:
      return { tone: 'muted', labelKey: 'approval.banner.draft', bodyKey: 'approval.banner.draft_body' };
  }
}

const TONE_CLASS: Record<'info' | 'ok' | 'warn' | 'danger' | 'muted', string> = {
  info: 'bg-info-soft border-info text-info',
  ok: 'bg-ok-soft border-ok text-ok',
  warn: 'bg-warn-soft border-warn text-warn',
  danger: 'bg-danger-soft border-danger text-danger',
  muted: 'bg-bg border-line-strong text-ink-2'
};

export default async function ApprovalDetailPage({
  params
}: {
  params: Promise<{ id: string; approvalId: string }>;
}) {
  const { id, approvalId } = await params;
  const row = await getApproval(approvalId, id);
  if (!row) notFound();
  const a = row.approval;
  const t = await getTranslations();

  const banner = bannerVariant(a.status);

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href={`/projects/${id}/approvals`} className="hover:text-ink">{t('crumbs.approvals')}</Link>{' / '}
        {a.reference}
      </div>

      <div className={cx('border-2 rounded-lg p-3.5 px-4.5 mb-4', TONE_CLASS[banner.tone])}>
        <div className="text-[11px] uppercase tracking-wider font-bold">{t(banner.labelKey)}</div>
        <div className="text-[13px] mt-1 leading-snug">{t(banner.bodyKey)}</div>
      </div>

      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{a.reference}</span>
            <ApprovalPill status={a.status} />
            <span className="inline-block text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
              {t(targetTypeKey(a))}
            </span>
          </div>
          <h2 className="text-[20px] font-semibold tracking-tighter">{a.subject}</h2>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('approval.requested_by')} {row.requestedByName ?? '—'}
            {a.supplierName && <> · {a.supplierName}</>}
            {a.price && <> · {formatMoney(a.price, a.priceCurrency ?? 'NOK')}</>}
          </p>
        </div>
        <ApprovalActions
          approvalId={a.id}
          projectId={id}
          status={a.status}
        />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-2">{t('approval.what')}</h3>
            <p className="text-[13px] leading-6">{a.description ?? '—'}</p>
            <hr className="border-line my-3" />
            <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 gap-x-4 text-[13px]">
              {a.version && (<><dt className="text-ink-3">{t('approval.version')}</dt><dd>{a.version}</dd></>)}
              <dt className="text-ink-3">{t('approval.price')}</dt><dd>{a.price ? formatMoney(a.price, a.priceCurrency ?? 'NOK') : '—'}</dd>
              <dt className="text-ink-3">{t('approval.freight')}</dt><dd>{a.freightAssumptions ?? '—'}</dd>
              <dt className="text-ink-3">{t('approval.customs')}</dt><dd>{a.customsAssumptions ?? '—'}</dd>
              <dt className="text-ink-3">{t('approval.lead_time')}</dt><dd>{a.leadTimeDays ? `${a.leadTimeDays} d` : '—'}</dd>
              <dt className="text-ink-3">{t('approval.supplier')}</dt><dd>{a.supplierName ?? '—'}</dd>
              <dt className="text-ink-3">{t('approval.consequence')}</dt><dd>{a.approvalConsequence ?? '—'}</dd>
              {a.conditions && (<><dt className="text-ink-3">{t('approval.conditions')}</dt><dd>{a.conditions}</dd></>)}
            </dl>
          </div>

          <div className="card">
            <h3 className="card-title mb-2">{t('approval.timeline')}</h3>
            <ol className="space-y-2 text-[13px]">
              <li className="flex justify-between">
                <span><ApprovalPill status={a.status} /></span>
                <span className="text-ink-3">{formatDate(a.updatedAt)}</span>
              </li>
              {a.respondedAt && (
                <li className="flex justify-between text-ink-2">
                  <span>{t('approval.responded_at')}</span>
                  <span>{formatDate(a.respondedAt)}</span>
                </li>
              )}
              {a.sentAt && (
                <li className="flex justify-between text-ink-2">
                  <span>{t('approval.sent_at')}</span>
                  <span>{formatDate(a.sentAt)}</span>
                </li>
              )}
              <li className="flex justify-between text-ink-2">
                <span>{t('approval.created')}</span>
                <span>{formatDate(a.createdAt)}</span>
              </li>
            </ol>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-2">{t('approval.who')}</h3>
            <div className="text-[13px]">
              <div className="font-semibold">{a.approverName}</div>
              <div className="text-ink-2">{a.approverEmail}</div>
            </div>
            <hr className="border-line my-3" />
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 gap-x-3 text-[13px]">
              <dt className="text-ink-3">{t('approval.channel')}</dt>
              <dd>{t(`approval.channel.${a.approvalChannel}`)}</dd>
              <dt className="text-ink-3">{t('approval.valid_until')}</dt>
              <dd>{formatDate(a.validUntil)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
