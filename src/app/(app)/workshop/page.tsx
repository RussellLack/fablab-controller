import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, vendors, purchaseOrders, projects } from '@/db';

/**
 * Workshop — REFERENCE list view.
 *
 * The in-house workshop has no dedicated schema yet (jobs / capacity /
 * shop-floor scheduling are future scope). The only existing data
 * hook is vendors with `kind = 'internal_workshop'` (or `isInternal`
 * set) — these are the workshop entities the rest of the system can
 * place POs against.
 *
 * This page honestly surfaces what exists today:
 *   1. Each internal-workshop vendor card
 *   2. Live POs currently assigned to those vendors (what the shop is
 *      actually building right now, across all projects)
 *   3. A scope note pointing at the future fuller surface (capacity,
 *      job board, throughput) so the gap is visible, not hidden.
 */

const ACTIVE_PO_STATUSES = [
  'ready_for_review', 'issued', 'confirmed', 'partially_fulfilled'
] as const;

async function getWorkshopState() {
  if (!process.env.DATABASE_URL) {
    return { shops: [], activePos: [] };
  }
  try {
    const shops = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        contactName: vendors.contactName,
        contactEmail: vendors.contactEmail,
        typicalLeadTimeDays: vendors.typicalLeadTimeDays,
        notes: vendors.notes,
        active: vendors.active
      })
      .from(vendors)
      .where(eq(vendors.kind, 'internal_workshop'))
      .orderBy(desc(vendors.active), vendors.name);

    const shopIds = shops.map((s) => s.id);
    const activePos = shopIds.length
      ? await db
          .select({
            id: purchaseOrders.id,
            reference: purchaseOrders.reference,
            status: purchaseOrders.status,
            vendorId: purchaseOrders.vendorId,
            projectId: purchaseOrders.projectId,
            projectRef: projects.reference,
            projectTitle: projects.title,
            deliveryDeadline: purchaseOrders.deliveryDeadline,
            totalGross: purchaseOrders.totalGross
          })
          .from(purchaseOrders)
          .leftJoin(projects, eq(purchaseOrders.projectId, projects.id))
          .where(
            and(
              inArray(purchaseOrders.vendorId, shopIds),
              inArray(purchaseOrders.status, [...ACTIVE_PO_STATUSES])
            )
          )
          .orderBy(purchaseOrders.deliveryDeadline)
          .limit(100)
      : [];

    return { shops, activePos };
  } catch {
    return { shops: [], activePos: [] };
  }
}

export default async function WorkshopPage() {
  const { shops, activePos } = await getWorkshopState();
  const t = await getTranslations();

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {t('nav.workshop')}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('workshop_page.subtitle')}
          </p>
        </div>
        <Link
          href="/vendors/new?kind=internal_workshop"
          className="btn btn-ghost text-[12px]"
        >
          {t('workshop_page.add_shop')}
        </Link>
      </div>

      {shops.length === 0 ? (
        <div className="card text-[13px] space-y-2">
          <p className="text-ink">{t('workshop_page.empty_title')}</p>
          <p className="text-ink-2">{t('workshop_page.empty_body')}</p>
          <Link
            href="/vendors/new?kind=internal_workshop"
            className="btn btn-primary text-[12px] mt-2"
          >
            {t('workshop_page.add_shop')}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            {shops.map((s) => (
              <div key={s.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-[14px]">{s.name}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      {t('vendor.kind.internal_workshop')}
                      {!s.active && (
                        <span className="ml-2 text-warn">
                          · {t('workshop_page.inactive')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {s.contactName && (
                  <div className="text-xs text-ink-2 mt-2.5">
                    {s.contactName}
                    {s.contactEmail && (
                      <span className="text-ink-3"> · {s.contactEmail}</span>
                    )}
                  </div>
                )}
                {s.typicalLeadTimeDays && (
                  <div className="text-xs text-ink-3 mt-1">
                    {t('workshop_page.lead')}: {s.typicalLeadTimeDays}d
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold">
              {t('workshop_page.active_jobs')}
            </h2>
            <span className="text-[11px] text-ink-3 uppercase tracking-wider">
              {activePos.length}
            </span>
          </div>
          {activePos.length === 0 ? (
            <div className="card text-ink-2 text-[13px]">
              {t('workshop_page.no_active_jobs')}
            </div>
          ) : (
            <div className="card p-0 overflow-hidden mb-8">
              <table className="w-full text-[13px]">
                <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
                  <tr>
                    <th className="text-left px-4 py-2.5">{t('workshop_page.col_po')}</th>
                    <th className="text-left px-4 py-2.5">{t('workshop_page.col_project')}</th>
                    <th className="text-left px-4 py-2.5">{t('workshop_page.col_status')}</th>
                    <th className="text-left px-4 py-2.5">{t('workshop_page.col_deadline')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activePos.map((po) => (
                    <tr key={po.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-mono text-[12px]">
                        <Link
                          href={`/projects/${po.projectId}/pos/${po.id}`}
                          className="text-ink hover:underline"
                        >
                          {po.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">
                        <Link
                          href={`/projects/${po.projectId}`}
                          className="hover:underline"
                        >
                          <span className="font-mono text-[12px] text-ink-3">{po.projectRef}</span>
                          {po.projectTitle && (
                            <span className="ml-1.5">{po.projectTitle}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-ink-2 text-[12px]">
                        {po.status}
                      </td>
                      <td className="px-4 py-2.5 text-ink-2 font-mono text-[12px]">
                        {po.deliveryDeadline ?? <span className="text-ink-3">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card bg-bg/40 text-[12px] text-ink-2 leading-relaxed">
        <div className="text-ink font-semibold mb-1">{t('workshop_page.scope_note_title')}</div>
        {t('workshop_page.scope_note_body')}
      </div>
    </>
  );
}
