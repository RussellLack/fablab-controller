import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, purchaseOrders, vendors, projects, approvals } from '@/db';
import { eq, desc, and, sql } from 'drizzle-orm';
import { formatDate, formatMoney, cx } from '@/lib/utils';
import { BindingBadge, poStatusToBinding } from '@/components/binding-badge';
import { PoLauncher } from './po-launcher';
import type { CandidateVendor, CandidateApproval } from '@/components/wizard/po-wizard';

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

async function getWizardData(projectId: string): Promise<{
  projectRef: string;
  siteAddress: string | null;
  candidates: CandidateVendor[];
  approvals: CandidateApproval[];
}> {
  if (!process.env.DATABASE_URL) {
    return { projectRef: '', siteAddress: null, candidates: [], approvals: [] };
  }
  try {
    const [project] = await db
      .select({ reference: projects.reference, siteAddress: projects.siteAddress })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    // One row per item: vendor + item + winning quote. Used to group by vendor.
    const rows = await db.execute<{
      vendor_id: string;
      vendor_name: string;
      item_id: string;
      item_name: string;
      quantity: string;
      unit: string;
      unit_cost: string;
      currency: string | null;
    }>(
      sql`SELECT v.id AS vendor_id, v.name AS vendor_name,
                 i.id AS item_id, i.name AS item_name,
                 COALESCE(q.quoted_quantity, i.quantity) AS quantity,
                 i.unit, q.unit_cost, q.currency
          FROM vendors v
          JOIN quotes q ON q.vendor_id = v.id AND q.status = 'winning'
          JOIN items i ON i.winning_quote_id = q.id
          JOIN packages p ON p.id = i.package_id
          WHERE p.project_id = ${projectId}
            AND NOT EXISTS (
              SELECT 1 FROM purchase_order_lines pol
              JOIN purchase_orders po ON po.id = pol.purchase_order_id
              WHERE pol.item_id = i.id AND po.status != 'cancelled'
            )
          ORDER BY v.name, i.name`
    );

    // Group rows by vendor into CandidateVendor shape
    const byVendor = new Map<string, CandidateVendor>();
    for (const r of rows) {
      const existing = byVendor.get(r.vendor_id);
      const item = {
        id: r.item_id,
        name: r.item_name,
        quantity: r.quantity,
        unit: r.unit,
        unitCost: r.unit_cost,
        currency: r.currency
      };
      if (existing) {
        existing.items.push(item);
        existing.itemCount = existing.items.length;
      } else {
        byVendor.set(r.vendor_id, {
          id: r.vendor_id,
          name: r.vendor_name,
          itemCount: 1,
          items: [item]
        });
      }
    }
    const candidates = Array.from(byVendor.values());

    const approvalRows = await db
      .select({
        id: approvals.id,
        reference: approvals.reference,
        subject: approvals.subject,
        status: approvals.status
      })
      .from(approvals)
      .where(
        and(
          eq(approvals.projectId, projectId),
          sql`${approvals.status} IN ('approved', 'approved_with_conditions')`
        )
      );

    return {
      projectRef: project?.reference ?? '',
      siteAddress: project?.siteAddress ?? null,
      candidates,
      approvals: approvalRows
    };
  } catch {
    return { projectRef: '', siteAddress: null, candidates: [], approvals: [] };
  }
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
  const wizard = await getWizardData(id);
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-ink-2 text-[13px]">{rows.length} {t('po.count_suffix')}</p>
        <PoLauncher
          projectId={id}
          projectRef={wizard.projectRef}
          defaultSiteAddress={wizard.siteAddress}
          candidates={wizard.candidates}
          approvals={wizard.approvals}
        />
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
