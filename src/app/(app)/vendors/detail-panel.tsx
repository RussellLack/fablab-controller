import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, vendors, clients, purchaseOrders, projects, rfqs, rfqVendors } from '@/db';
import { eq, desc, sql } from 'drizzle-orm';
import { formatMoney } from '@/lib/utils';

/**
 * Shared vendor-detail content — used by /vendors/[id] (full page)
 * and the inline split-view panel inside /vendors. Layout collapses
 * to single column in panel mode and trims the related-work tables
 * to fit a narrower viewport.
 */

async function getVendor(id: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        kind: vendors.kind,
        country: vendors.country,
        contactName: vendors.contactName,
        contactEmail: vendors.contactEmail,
        contactPhone: vendors.contactPhone,
        address: vendors.address,
        typicalLeadTimeDays: vendors.typicalLeadTimeDays,
        paymentTerms: vendors.paymentTerms,
        defaultCurrency: vendors.defaultCurrency,
        rating: vendors.rating,
        active: vendors.active,
        categories: vendors.categories,
        notes: vendors.notes,
        isAlsoClient: sql<boolean>`EXISTS (
          SELECT 1 FROM ${clients} c
          WHERE lower(c.name) = lower(vendors.name)
             OR (c.org_number IS NOT NULL
                 AND vendors.notes ~ ('Org\\.nr\\.: ' || c.org_number || '(\\D|$)'))
        )`,
        matchedClientId: sql<string | null>`(
          SELECT c.id FROM ${clients} c
          WHERE lower(c.name) = lower(vendors.name)
             OR (c.org_number IS NOT NULL
                 AND vendors.notes ~ ('Org\\.nr\\.: ' || c.org_number || '(\\D|$)'))
          LIMIT 1
        )`
      })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

async function getVendorPOs(vendorId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db
      .select({
        id: purchaseOrders.id,
        reference: purchaseOrders.reference,
        status: purchaseOrders.status,
        deliveryDeadline: purchaseOrders.deliveryDeadline,
        totalGross: purchaseOrders.totalGross,
        currency: purchaseOrders.currency,
        projectId: purchaseOrders.projectId,
        projectRef: projects.reference,
        projectTitle: projects.title
      })
      .from(purchaseOrders)
      .leftJoin(projects, eq(purchaseOrders.projectId, projects.id))
      .where(eq(purchaseOrders.vendorId, vendorId))
      .orderBy(desc(purchaseOrders.issuedAt))
      .limit(200);
  } catch {
    return [];
  }
}

async function getVendorRFQs(vendorId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db
      .select({
        id: rfqs.id,
        reference: rfqs.reference,
        title: rfqs.title,
        status: rfqs.status,
        projectId: rfqs.projectId,
        projectRef: projects.reference
      })
      .from(rfqVendors)
      .innerJoin(rfqs, eq(rfqVendors.rfqId, rfqs.id))
      .leftJoin(projects, eq(rfqs.projectId, projects.id))
      .where(eq(rfqVendors.vendorId, vendorId))
      .orderBy(desc(rfqs.createdAt))
      .limit(200);
  } catch {
    return [];
  }
}

export async function VendorDetailPanel({
  vendorId,
  mode = 'page'
}: {
  vendorId: string;
  mode?: 'page' | 'panel';
}) {
  const [vendor, pos, vRfqs] = await Promise.all([
    getVendor(vendorId),
    getVendorPOs(vendorId),
    getVendorRFQs(vendorId)
  ]);
  if (!vendor) {
    return <div className="card text-ink-2 text-[13px]">Vendor not found.</div>;
  }
  const t = await getTranslations();
  const isPanel = mode === 'panel';

  return (
    <div className={isPanel ? 'h-full overflow-y-auto pr-1' : ''}>
      {!isPanel && (
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/vendors"
            className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
          >
            ← {t('entity_detail.back_to_vendors')}
          </Link>
          <Link href={`/vendors/${vendor.id}?edit=1`} className="btn text-[12px]">
            {t('entity_edit.edit_button')}
          </Link>
        </div>
      )}
      {isPanel && (
        <div className="flex justify-end mb-2">
          <Link
            href={`/vendors/${vendor.id}`}
            className="text-[11px] text-ink-3 hover:text-ink underline-offset-2 hover:underline"
          >
            {t('entity_detail.open_full_page')} →
          </Link>
        </div>
      )}

      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="pill pill-type pill-supplier">{t('entity_type.supplier')}</span>
          {vendor.isAlsoClient && vendor.matchedClientId && (
            <Link
              href={`/clients/${vendor.matchedClientId}`}
              className="pill pill-type pill-customer hover:opacity-80"
              title={t('entity_type.dual_role_title')}
            >
              {t('entity_type.customer')}
            </Link>
          )}
          {!vendor.active && (
            <span className="pill text-ink-3 bg-bg border border-line">
              {t('entity_detail.inactive')}
            </span>
          )}
        </div>
        <h1 className={isPanel ? 'text-[18px] font-semibold tracking-tighter' : 'text-[24px] font-semibold tracking-tighter'}>
          {vendor.name}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1">
          {t(`vendor.kind.${vendor.kind}`)}
          {vendor.country && ` · ${vendor.country}`}
          {vendor.defaultCurrency && ` · ${vendor.defaultCurrency}`}
          {vendor.rating && ` · ★ ${vendor.rating}`}
        </p>
        {vendor.categories.length > 0 && (
          <p className="text-ink-3 text-[12px] mt-1">{vendor.categories.join(' · ')}</p>
        )}
      </div>

      <div className={isPanel ? 'space-y-3 mb-3' : 'grid grid-cols-2 gap-4 mb-4'}>
        <div className="card">
          <div className="card-title">{t('entity_detail.contact_section')}</div>
          <dl className="text-[13px] space-y-1.5 mt-2">
            <DetailRow label={t('entity_detail.contact_name')} value={vendor.contactName} />
            <DetailRow label={t('entity_detail.contact_email')} value={vendor.contactEmail} mono />
            <DetailRow label={t('entity_detail.contact_phone')} value={vendor.contactPhone} mono />
          </dl>
        </div>
        <div className="card">
          <div className="card-title">{t('entity_detail.commercial_section')}</div>
          <dl className="text-[13px] space-y-1.5 mt-2">
            <DetailRow label={t('entity_detail.currency')} value={vendor.defaultCurrency} />
            <DetailRow
              label={t('entity_detail.lead_time')}
              value={vendor.typicalLeadTimeDays ? `${vendor.typicalLeadTimeDays} ${t('entity_detail.days')}` : null}
            />
            <DetailRow label={t('entity_detail.payment_terms_supplier')} value={vendor.paymentTerms} />
          </dl>
        </div>
      </div>

      {vendor.address && (
        <div className="card mb-3">
          <div className="card-title">{t('entity_detail.address_section')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2">{vendor.address}</p>
        </div>
      )}

      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[14px] font-semibold">{t('entity_detail.related_pos')}</h2>
          <span className="text-[11px] uppercase tracking-wider text-ink-3">{pos.length}</span>
        </div>
        {pos.length === 0 ? (
          <div className="card text-ink-2 text-[13px]">{t('entity_detail.no_pos')}</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] uppercase tracking-wider text-ink-3 bg-bg">
                <tr>
                  <th className="text-left px-3 py-2">{t('col.ref')}</th>
                  <th className="text-left px-3 py-2">{t('col.project')}</th>
                  {!isPanel && <th className="text-left px-3 py-2">{t('col.status')}</th>}
                  {!isPanel && <th className="text-right px-3 py-2">{t('col.amount')}</th>}
                  {!isPanel && <th className="text-left px-3 py-2">{t('col.deadline')}</th>}
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${p.projectId}/pos/${p.id}`} className="ref hover:underline">
                        {p.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-ink-2 text-[11px]">
                      <Link href={`/projects/${p.projectId}`} className="hover:underline">
                        <span className="font-mono text-ink-3">{p.projectRef}</span>
                      </Link>
                    </td>
                    {!isPanel && <td className="px-3 py-2 text-ink-2 text-[11px]">{p.status}</td>}
                    {!isPanel && (
                      <td className="px-3 py-2 text-right">{formatMoney(p.totalGross, p.currency)}</td>
                    )}
                    {!isPanel && (
                      <td className="px-3 py-2 text-ink-3 text-[12px]">
                        {p.deliveryDeadline ?? <span>—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[14px] font-semibold">{t('entity_detail.related_rfqs')}</h2>
          <span className="text-[11px] uppercase tracking-wider text-ink-3">{vRfqs.length}</span>
        </div>
        {vRfqs.length === 0 ? (
          <div className="card text-ink-2 text-[13px]">{t('entity_detail.no_rfqs')}</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] uppercase tracking-wider text-ink-3 bg-bg">
                <tr>
                  <th className="text-left px-3 py-2">{t('col.ref')}</th>
                  <th className="text-left px-3 py-2">{t('col.title')}</th>
                  {!isPanel && <th className="text-left px-3 py-2">{t('col.status')}</th>}
                </tr>
              </thead>
              <tbody>
                {vRfqs.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${r.projectId}/rfqs/${r.id}`} className="ref hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.title}</td>
                    {!isPanel && <td className="px-3 py-2 text-ink-2 text-[11px]">{r.status}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {vendor.notes && (
        <div className="card">
          <div className="card-title">{t('entity_detail.notes_section')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2 text-ink-2">{vendor.notes}</p>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="text-ink-3 w-32 shrink-0">{label}</dt>
      <dd className={mono ? 'font-mono text-[12px]' : ''}>
        {value ?? <span className="text-ink-3">—</span>}
      </dd>
    </div>
  );
}
