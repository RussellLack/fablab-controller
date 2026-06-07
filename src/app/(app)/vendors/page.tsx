import { db, vendors, clients } from '@/db';
import { eq, desc, sql } from 'drizzle-orm';
import { VendorsExplorer, type VendorRow } from './explorer';

/**
 * Vendors list — server fetches all active vendors once, the
 * client-side <VendorsExplorer> handles search / sort / filter UI.
 */
async function getVendors(): Promise<VendorRow[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db
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
      .limit(1000);
    return rows as VendorRow[];
  } catch {
    return [];
  }
}

export default async function VendorsPage() {
  const rows = await getVendors();
  return <VendorsExplorer rows={rows} />;
}
