import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { db, vendors } from '@/db';
import { AuditTimeline } from '@/components/audit-timeline';

export default async function VendorHistoryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vendor] = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);
  if (!vendor) notFound();
  const t = await getTranslations();
  return (
    <AuditTimeline
      entityType="vendor"
      entityId={id}
      entityName={vendor.name}
      backHref={`/vendors/${id}`}
      backLabel={t('audit.back_to_vendor')}
    />
  );
}
