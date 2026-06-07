import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, vendors, clients, purchaseOrders, projects, rfqs, rfqVendors } from '@/db';
import { eq, desc, sql } from 'drizzle-orm';
import { formatMoney, formatDate } from '@/lib/utils';

/**
 * Vendor detail page — single source of truth for one vendor.
 *
 * Header: typology pill(s) + name + kind/country sub-line.
 * Two-column cards: contact / commercial.
 * Address card.
 * Related work — POs (this vendor's active assignments) + RFQs (this
 * vendor was invited to), each linked to its project home.
 * Notes card.
 *
 * Customer pill appears alongside Supplier when this vendor's name or
 * Norwegian org no. also matches a client — clicking through to
 * /clients lets staff jump to the customer-side record.
 */

type Params = Promise<{ id: string }>;

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
        sentAt: rfqs.sentAt,
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

export default async function VendorDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const [vendor, pos, vRfqs] = await Promise.all([
    getVendor(id),
    getVendorPOs(id),
    getVendorRFQs(id)
  ]);
  if (!vendor) notFound();

  const t = await getTranslations();

  return (
    <>
      <Link
        href="/vendors"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-3"
      >
        ← {t('entity_detail.back_to_vendors')}
      </Link>

      <div className="mb-6">
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
        <h1 className="text-[24px] font-semibold tracking-tighter">{vendor.name}</h1>
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

      <div className="grid grid-cols-2 gap-4 mb-4">
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
        <div className="card mb-4">
          <div className="card-title">{t('entity_detail.address_section')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2">{vendor.address}</p>
        </div>
      )}

      {/* Related POs */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[14px] font-semibold">{t('entity_detail.related_pos')}</h2>
          <span className="text-[11px] uppercase tracking-wider text-ink-3">{pos.length}</span>
        </div>
        {pos.length === 0 ? (
          <div className="card text-ink-2 text-[13px]">{t('entity_detail.no_pos')}</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('col.ref')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.project')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.status')}</th>
                  <th className="text-right px-4 py-2.5">{t('col.amount')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.deadline')}</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${p.projectId}/pos/${p.id}`} className="ref hover:underline">
                        {p.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2 text-[12px]">
                      <Link href={`/projects/${p.projectId}`} className="hover:underline">
                        <span className="font-mono text-ink-3">{p.projectRef}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2 text-[12px]">{p.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      {formatMoney(p.totalGross, p.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-3 text-[12px]">
                      {p.deliveryDeadline ?? <span>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Related RFQs */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[14px] font-semibold">{t('entity_detail.related_rfqs')}</h2>
          <span className="text-[11px] uppercase tracking-wider text-ink-3">{vRfqs.length}</span>
        </div>
        {vRfqs.length === 0 ? (
          <div className="card text-ink-2 text-[13px]">{t('entity_detail.no_rfqs')}</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('col.ref')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.title')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.project')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {vRfqs.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${r.projectId}/rfqs/${r.id}`} className="ref hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{r.title}</td>
                    <td className="px-4 py-2.5 text-ink-3 text-[12px] font-mono">{r.projectRef}</td>
                    <td className="px-4 py-2.5 text-ink-2 text-[12px]">{r.status}</td>
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
    </>
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
