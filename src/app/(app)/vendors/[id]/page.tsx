import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, vendors } from '@/db';
import { VendorDetailPanel } from '../detail-panel';
import { VendorEditForm, type EditableVendor } from './edit-form';

export default async function VendorDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isEditing = sp.edit === '1';

  if (!isEditing) return <VendorDetailPanel vendorId={id} mode="page" />;

  const [row] = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      kind: vendors.kind,
      country: vendors.country,
      defaultCurrency: vendors.defaultCurrency,
      contactName: vendors.contactName,
      contactEmail: vendors.contactEmail,
      contactPhone: vendors.contactPhone,
      address: vendors.address,
      typicalLeadTimeDays: vendors.typicalLeadTimeDays,
      paymentTerms: vendors.paymentTerms,
      rating: vendors.rating,
      active: vendors.active,
      categories: vendors.categories,
      notes: vendors.notes
    })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);
  if (!row) notFound();

  return <VendorEditForm vendor={row as EditableVendor} />;
}
