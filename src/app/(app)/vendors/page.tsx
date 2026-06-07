import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, vendors, clients } from '@/db';
import { eq, desc, sql } from 'drizzle-orm';

async function getVendors() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db
      .select({
        id: vendors.id,
        name: vendors.name,
        kind: vendors.kind,
        country: vendors.country,
        categories: vendors.categories,
        contactName: vendors.contactName,
        contactEmail: vendors.contactEmail,
        typicalLeadTimeDays: vendors.typicalLeadTimeDays,
        rating: vendors.rating,
        // Dual-role flag: this vendor also exists as a client (matched by
        // case-insensitive name OR Norwegian org no. — the vendor's org no.
        // is stashed in notes as "Org.nr.: <N>" by the importer, so a row
        // like "Kinnarps AS Fakturamottak" still matches client "Kinnarps AS"
        // when both share the same Norwegian org no.).
        //
        // NOTE: outer-table references (vendors.name, vendors.notes) are
        // written as literal SQL rather than ${vendors.name} because drizzle
        // renders unqualified column names that get shadowed by the inner
        // subquery's column scope and silently match every row.
        isAlsoClient: sql<boolean>`EXISTS (
          SELECT 1 FROM ${clients} c
          WHERE lower(c.name) = lower(vendors.name)
             OR (c.org_number IS NOT NULL
                 AND vendors.notes ~ ('Org\\.nr\\.: ' || c.org_number || '(\\D|$)'))
        )`
      })
      .from(vendors)
      .where(eq(vendors.active, true))
      .orderBy(desc(vendors.createdAt))
      .limit(200);
  } catch {
    return [];
  }
}

export default async function VendorsPage() {
  const rows = await getVendors();
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('vendors.title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">{rows.length} active</p>
        </div>
        <Link href="/vendors/new" className="btn btn-primary">{t('action.new_vendor')}</Link>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('vendor.empty')}</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {rows.map(v => (
            <div key={v.id} className="card hover:border-line-strong cursor-pointer">
              <div className="flex flex-wrap items-center gap-1 mb-2">
                <span className="pill pill-type pill-supplier">
                  {t('entity_type.supplier')}
                </span>
                {v.isAlsoClient && (
                  <span
                    className="pill pill-type pill-customer"
                    title={t('entity_type.dual_role_title')}
                  >
                    {t('entity_type.customer')}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="font-semibold text-[14px]">{v.name}</div>
                  <div className="text-[11px] text-ink-3 mt-0.5">{t(`vendor.kind.${v.kind}`)}{v.country ? ` · ${v.country}` : ''}</div>
                </div>
                {v.rating && <span className="text-xs">★ {v.rating}</span>}
              </div>
              {v.categories.length > 0 && <div className="text-xs text-ink-2 mt-2.5">{v.categories.join(' · ')}</div>}
              <div className="text-xs text-ink-2 mt-1.5">{v.contactName} · {v.contactEmail}</div>
              {v.typicalLeadTimeDays && <div className="text-xs text-ink-3 mt-1">Lead: {v.typicalLeadTimeDays}d</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
