import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, purchaseOrders, purchaseOrderLines, items, vendors, approvals, poAttachments, vendorCommunications } from '@/db';
import { eq, and, asc, desc } from 'drizzle-orm';
import { formatDate, formatMoney, cx } from '@/lib/utils';
import { canIssuePurchaseOrder } from '@/server/actions/approvals';
import { BindingBadge, poStatusToBinding } from '@/components/binding-badge';
import { PoActions } from './actions-client';
import { PoAttachments } from '@/components/po-attachments';
import { PoConfirmationCard } from './confirmation-card';

async function getPo(poId: string, projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db.select({
      po: purchaseOrders, vendorName: vendors.name, vendorEmail: vendors.contactEmail,
      vendorTerms: vendors.paymentTerms
    }).from(purchaseOrders).leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.projectId, projectId)))
      .limit(1);
    if (!row) return null;
    const lines = await db.select({
      line: purchaseOrderLines, itemName: items.name, itemQuantity: items.quantity, itemUnit: items.unit
    }).from(purchaseOrderLines).innerJoin(items, eq(purchaseOrderLines.itemId, items.id))
      .where(eq(purchaseOrderLines.purchaseOrderId, poId));

    let authorising = null;
    if (row.po.approvalReferenceId) {
      const [appr] = await db.select({ reference: approvals.reference, status: approvals.status, subject: approvals.subject })
        .from(approvals).where(eq(approvals.id, row.po.approvalReferenceId)).limit(1);
      authorising = appr ?? null;
    }

    const attachmentRows = await db
      .select({
        id: poAttachments.id,
        filename: poAttachments.filename,
        storagePath: poAttachments.storagePath,
        mimeType: poAttachments.mimeType,
        sizeBytes: poAttachments.sizeBytes,
        createdAt: poAttachments.createdAt
      })
      .from(poAttachments)
      .where(eq(poAttachments.poId, poId))
      .orderBy(asc(poAttachments.createdAt));

    // Latest inbound po_confirmation comm — drives the "Confirmed via X"
    // metadata in the confirmation card when the PO is in `confirmed`.
    const [latestConfirmation] = await db
      .select({
        channel: vendorCommunications.channel,
        body: vendorCommunications.body
      })
      .from(vendorCommunications)
      .where(
        and(
          eq(vendorCommunications.purchaseOrderId, poId),
          eq(vendorCommunications.stage, 'po_confirmation'),
          eq(vendorCommunications.direction, 'inbound')
        )
      )
      .orderBy(desc(vendorCommunications.occurredAt))
      .limit(1);

    return {
      ...row,
      lines,
      authorising,
      attachments: attachmentRows,
      latestConfirmation: latestConfirmation ?? null
    };
  } catch { return null; }
}

const BANNER: Record<string, { tone: string; labelKey: string; bodyKey: string }> = {
  draft:               { tone: 'bg-bg border-line-strong text-ink-2',          labelKey: 'po.banner.draft',     bodyKey: 'po.banner.draft_body' },
  ready_for_review:    { tone: 'bg-info-soft border-info text-info',           labelKey: 'po.banner.review',    bodyKey: 'po.banner.review_body' },
  issued:              { tone: 'bg-accent-soft border-accent text-accent',     labelKey: 'po.banner.issued',    bodyKey: 'po.banner.issued_body' },
  confirmed:           { tone: 'bg-ok-soft border-ok text-ok',                  labelKey: 'po.banner.confirmed', bodyKey: 'po.banner.confirmed_body' },
  partially_fulfilled: { tone: 'bg-warn-soft border-warn text-warn',           labelKey: 'po.banner.partial',   bodyKey: 'po.banner.partial_body' },
  fulfilled:           { tone: 'bg-ok-soft border-ok text-ok',                  labelKey: 'po.banner.fulfilled', bodyKey: 'po.banner.fulfilled_body' },
  cancelled:           { tone: 'bg-danger-soft border-danger text-danger',     labelKey: 'po.banner.cancelled', bodyKey: 'po.banner.cancelled_body' }
};

export default async function PoDetailPage({ params }: { params: Promise<{ id: string; poId: string }> }) {
  const { id, poId } = await params;
  const data = await getPo(poId, id);
  if (!data) notFound();
  const t = await getTranslations();
  const po = data.po;
  const banner = BANNER[po.status] ?? BANNER.draft;

  // Pre-check the gate so the UI can show blockers without waiting for click
  const blocker = po.status === 'draft' || po.status === 'ready_for_review'
    ? await canIssuePurchaseOrder(poId)
    : null;

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href={`/projects/${id}/pos`} className="hover:text-ink">{t('crumbs.pos')}</Link>{' / '}
        {po.reference}
      </div>

      <div className={cx('border-2 rounded-lg p-3.5 px-4.5 mb-4', banner?.tone)}>
        <div className="text-[11px] uppercase tracking-wider font-bold">{t(banner!.labelKey)}</div>
        <div className="text-[13px] mt-1 leading-snug">{t(banner!.bodyKey)}</div>
      </div>

      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{po.reference}</span>
            <span className={cx('text-[11px] px-2 py-0.5 rounded-full', banner?.tone)}>
              {t(`po.status.${po.status}`)}
            </span>
            <BindingBadge state={poStatusToBinding(po.status)} />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            PO {t('po.to')} {data.vendorName}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {data.lines.length} {t('po.lines')} · {formatMoney(po.subtotalNet, po.currency)} {t('po.net')} · {formatMoney(po.totalGross, po.currency)} {t('po.gross')}
          </p>
        </div>
        <PoActions
          poId={poId}
          projectId={id}
          status={po.status}
          blocker={blocker}
        />
      </div>

      {blocker && po.status === 'draft' && (
        <div className="card bg-danger-soft border-danger text-danger mb-4 text-[13px]">
          <strong className="block mb-1">⚠ {t('po.gate_blocked_title')}</strong>
          <div>{blocker.reason}</div>
          {blocker.missingItemIds.length > 0 && (
            <div className="mt-2 text-[12px]">{t('po.gate_missing_items', { count: blocker.missingItemIds.length })}</div>
          )}
          {blocker.needsAuthorisingApproval && (
            <div className="mt-2 text-[12px]">{t('po.gate_needs_auth_approval')}</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-3">{t('po.lines_header')}</h3>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="py-2">{t('po.col_item')}</th>
                  <th className="py-2 text-right">{t('po.col_qty')}</th>
                  <th className="py-2 text-right">{t('po.col_unit_cost')}</th>
                  <th className="py-2 text-right">{t('po.col_line_total')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map(({ line, itemName, itemUnit }) => (
                  <tr key={line.id} className="border-b border-line last:border-0">
                    <td className="py-2">{itemName}</td>
                    <td className="py-2 text-right">{line.quantity} {itemUnit}</td>
                    <td className="py-2 text-right">{formatMoney(line.unitCost, po.currency)}</td>
                    <td className="py-2 text-right">{formatMoney(line.lineTotal, po.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink font-semibold">
                  <td colSpan={3} className="pt-2">{t('po.subtotal')}</td>
                  <td className="pt-2 text-right">{formatMoney(po.subtotalNet, po.currency)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="text-ink-2">{t('po.vat')}</td>
                  <td className="text-right text-ink-2">{formatMoney(po.vatAmount, po.currency)}</td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={3}>{t('po.total_gross')}</td>
                  <td className="text-right">{formatMoney(po.totalGross, po.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-3">{t('po.delivery')}</h3>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-3 text-[13px]">
              <dt className="text-ink-3">{t('po.address')}</dt><dd className="whitespace-pre-line">{po.deliveryAddress ?? '—'}</dd>
              <dt className="text-ink-3">{t('po.deadline')}</dt><dd>{formatDate(po.deliveryDeadline)}</dd>
              <dt className="text-ink-3">{t('po.freight')}</dt><dd>{po.freightTerms ?? '—'}</dd>
            </dl>
          </div>

          <div className="card">
            <h3 className="card-title mb-3">{t('po.vendor')}</h3>
            <div className="text-[13px]">
              <div className="font-semibold">{data.vendorName}</div>
              <div className="text-ink-2 text-[12px]">{data.vendorEmail}</div>
              {data.vendorTerms && <div className="text-ink-3 text-[12px] mt-1">{data.vendorTerms}</div>}
            </div>
          </div>

          <PoConfirmationCard
            poId={po.id}
            projectId={id}
            status={po.status}
            confirmedAt={po.confirmedAt}
            issuedAt={po.issuedAt}
            latestConfirmationComm={
              data.latestConfirmation
                ? {
                    channel: data.latestConfirmation.channel,
                    body: data.latestConfirmation.body
                  }
                : null
            }
          />

          <div className="card">
            <h3 className="card-title mb-3">{t('po.authorising_approval')}</h3>
            {data.authorising ? (
              <div className="text-[13px]">
                <Link href={`/projects/${id}/approvals/${po.approvalReferenceId}`} className="font-semibold hover:underline">
                  {data.authorising.reference}
                </Link>
                <div className="text-ink-2 text-[12px] mt-1">{data.authorising.subject}</div>
                <div className="text-[11px] mt-1 inline-block px-2 py-0.5 rounded-full bg-ok-soft text-ok">
                  {t(`approval.status.${data.authorising.status}`)}
                </div>
              </div>
            ) : (
              <div className="text-[13px] text-warn">
                ⚠ {t('po.no_authorising_approval')}
              </div>
            )}
          </div>

          <PoAttachments
            projectId={id}
            poId={po.id}
            initial={data.attachments.map(a => ({
              ...a,
              createdAt: a.createdAt.toISOString()
            }))}
            canEdit={po.status === 'draft' || po.status === 'ready_for_review'}
          />
        </div>
      </div>
    </>
  );
}
