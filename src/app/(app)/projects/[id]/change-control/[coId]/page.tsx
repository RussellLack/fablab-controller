import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { db, changeOrders, approvals, users } from '@/db';
import { formatDate, formatMoney } from '@/lib/utils';
import { CoActions } from './actions-client';

/**
 * Change Order detail page. Three cards (Reason / Impact / Status &
 * timeline) + a state-aware action panel that renders only the
 * transitions the CO is currently eligible for.
 *
 * Linked-approval handling: when status is `sent_for_approval` or
 * later, the CO carries an `approvalId` pointer. We render a banner
 * that deep-links to the approval so staff can complete / send /
 * record the response there.
 */
export default async function ChangeOrderDetailPage({
  params
}: {
  params: Promise<{ id: string; coId: string }>;
}) {
  const { id, coId } = await params;
  const t = await getTranslations();

  const [co] = await db
    .select({
      id: changeOrders.id,
      reference: changeOrders.reference,
      title: changeOrders.title,
      description: changeOrders.description,
      reason: changeOrders.reason,
      requestedBy: changeOrders.requestedBy,
      requestedByExternal: changeOrders.requestedByExternal,
      requestedByUserId: changeOrders.requestedByUserId,
      dateRequested: changeOrders.dateRequested,
      costImpactAmount: changeOrders.costImpactAmount,
      costImpactCurrency: changeOrders.costImpactCurrency,
      timeImpactDays: changeOrders.timeImpactDays,
      affectsSupplier: changeOrders.affectsSupplier,
      affectsFreightCustoms: changeOrders.affectsFreightCustoms,
      affectsInstall: changeOrders.affectsInstall,
      status: changeOrders.status,
      approvalId: changeOrders.approvalId,
      finalDecision: changeOrders.finalDecision,
      implementedAt: changeOrders.implementedAt,
      implementedBy: changeOrders.implementedBy,
      createdAt: changeOrders.createdAt,
      updatedAt: changeOrders.updatedAt
    })
    .from(changeOrders)
    .where(eq(changeOrders.id, coId))
    .limit(1);
  if (!co) notFound();

  // Linked approval, if any.
  let approval: {
    reference: string;
    status: string;
    subject: string;
  } | null = null;
  if (co.approvalId) {
    const [appr] = await db
      .select({
        reference: approvals.reference,
        status: approvals.status,
        subject: approvals.subject
      })
      .from(approvals)
      .where(eq(approvals.id, co.approvalId))
      .limit(1);
    approval = appr ?? null;
  }

  // Implementer display name.
  let implementerName: string | null = null;
  if (co.implementedBy) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, co.implementedBy))
      .limit(1);
    implementerName = u?.name ?? null;
  }

  const requestedByLabel = co.requestedByExternal
    ? `${t(`change_order.requested_by.${co.requestedBy}`)} — ${co.requestedByExternal}`
    : t(`change_order.requested_by.${co.requestedBy}`);

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href={`/projects/${id}/change-control`} className="hover:text-ink">
          {t('crumbs.change_control')}
        </Link>
        {' / '}
        {co.reference}
      </div>

      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{co.reference}</span>
            <StatusPill status={co.status} t={t} />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{co.title}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('change_order.requested_by_short')}: {requestedByLabel} ·{' '}
            {formatDate(co.dateRequested)}
          </p>
        </div>
        <CoActions
          coId={coId}
          projectId={id}
          status={co.status}
          hasCost={co.costImpactAmount !== null}
        />
      </div>

      {approval && (
        <div className="card mb-4 border-l-2 border-info bg-info-soft/30">
          <h3 className="card-title mb-1">{t('change_order.linked_approval')}</h3>
          <Link
            href={`/projects/${id}/approvals/${co.approvalId}`}
            className="text-[13px] hover:underline"
          >
            <span className="ref">{approval.reference}</span>
            {' · '}
            {approval.subject}
            {' · '}
            <span className="text-ink-2">
              {t(`approval.status.${approval.status}`)}
            </span>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-3">{t('change_order.section_reason')}</h3>
            {co.reason ? (
              <p className="text-[13px] leading-6 whitespace-pre-wrap mb-3">{co.reason}</p>
            ) : (
              <p className="text-[12px] text-ink-3 italic mb-3">
                {t('change_order.no_reason')}
              </p>
            )}
            {co.description && (
              <>
                <h4 className="text-[11px] uppercase tracking-wider text-ink-3 mb-1.5 mt-3">
                  {t('change_order.description_heading')}
                </h4>
                <p className="text-[13px] leading-6 whitespace-pre-wrap">{co.description}</p>
              </>
            )}
          </div>

          {co.finalDecision && (
            <div className="card">
              <h3 className="card-title mb-3">{t('change_order.section_final_decision')}</h3>
              <p className="text-[13px] leading-6 whitespace-pre-wrap">{co.finalDecision}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-3">{t('change_order.section_impact')}</h3>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-3 text-[13px]">
              <dt className="text-ink-3">{t('change_order.col_cost_impact')}</dt>
              <dd>
                {co.costImpactAmount !== null
                  ? formatMoney(co.costImpactAmount, co.costImpactCurrency ?? 'NOK')
                  : t('change_order_wizard.cost_not_priced')}
              </dd>
              <dt className="text-ink-3">{t('change_order_wizard.field_time_impact')}</dt>
              <dd>
                {co.timeImpactDays != null
                  ? t('change_order.cost_time_days', { n: co.timeImpactDays })
                  : '—'}
              </dd>
              <dt className="text-ink-3">{t('change_order_wizard.field_affects')}</dt>
              <dd className="text-[12px]">
                {[
                  co.affectsSupplier && t('change_order_wizard.affects_supplier'),
                  co.affectsFreightCustoms && t('change_order_wizard.affects_freight_customs'),
                  co.affectsInstall && t('change_order_wizard.affects_install')
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </dd>
            </dl>
          </div>

          <div className="card">
            <h3 className="card-title mb-3">{t('change_order.section_timeline')}</h3>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-3 text-[13px]">
              <dt className="text-ink-3">{t('change_order.created')}</dt>
              <dd className="text-[12px]">{formatDate(co.createdAt)}</dd>
              <dt className="text-ink-3">{t('change_order.updated')}</dt>
              <dd className="text-[12px]">{formatDate(co.updatedAt)}</dd>
              {co.implementedAt && (
                <>
                  <dt className="text-ink-3">{t('change_order.implemented')}</dt>
                  <dd className="text-[12px]">
                    {formatDate(co.implementedAt)}
                    {implementerName && (
                      <span className="text-ink-3"> · {implementerName}</span>
                    )}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusPill({
  status,
  t
}: {
  status: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const tone: string =
    status === 'closed' || status === 'implemented'
      ? 'text-ok bg-ok-soft'
      : status === 'approved'
        ? 'text-accent bg-accent-soft'
        : status === 'sent_for_approval'
          ? 'text-warn bg-warn-soft'
          : status === 'rejected' || status === 'withdrawn'
            ? 'text-ink-3 bg-bg'
            : 'text-info bg-info-soft';
  return (
    <span className={`pill ${tone}`}>
      {t(`change_order.status.${status}`)}
    </span>
  );
}
