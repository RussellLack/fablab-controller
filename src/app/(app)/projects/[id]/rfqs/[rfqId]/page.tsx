import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, rfqs, rfqItems, rfqVendors, quotes, items, vendors, rfqAttachments } from '@/db';
import { eq, inArray, asc } from 'drizzle-orm';
import { formatDate } from '@/lib/utils';
import { RfqDetailClient } from './client';
import { RfqAttachments } from '@/components/rfq-attachments';

async function getRfqDetail(rfqId: string, projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId)).limit(1);
    if (!rfq || rfq.projectId !== projectId) return null;

    const rfqItemRows = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId));
    const itemIds = rfqItemRows.map(r => r.itemId);
    const itemDetails = itemIds.length === 0 ? [] :
      await db.select({ id: items.id, name: items.name, quantity: items.quantity, unit: items.unit, winningQuoteId: items.winningQuoteId })
        .from(items).where(inArray(items.id, itemIds));

    const rfqVendorRows = await db.select().from(rfqVendors).where(eq(rfqVendors.rfqId, rfqId));
    const vendorIds = rfqVendorRows.map(r => r.vendorId);
    const vendorDetails = vendorIds.length === 0 ? [] :
      await db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(inArray(vendors.id, vendorIds));

    const quoteRows = await db.select().from(quotes).where(eq(quotes.rfqId, rfqId));

    const attachmentRows = await db
      .select({
        id: rfqAttachments.id,
        filename: rfqAttachments.filename,
        storagePath: rfqAttachments.storagePath,
        mimeType: rfqAttachments.mimeType,
        sizeBytes: rfqAttachments.sizeBytes,
        createdAt: rfqAttachments.createdAt
      })
      .from(rfqAttachments)
      .where(eq(rfqAttachments.rfqId, rfqId))
      .orderBy(asc(rfqAttachments.createdAt));

    return { rfq, items: itemDetails, vendors: vendorDetails, quotes: quoteRows, attachments: attachmentRows };
  } catch { return null; }
}

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string; rfqId: string }> }) {
  const { id, rfqId } = await params;
  const data = await getRfqDetail(rfqId, id);
  if (!data) notFound();
  const t = await getTranslations();
  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href={`/projects/${id}/rfqs`} className="hover:text-ink">{t('crumbs.rfqs')}</Link>{' / '}
        {data.rfq.reference}
      </div>

      <div className="border-2 rounded-lg p-3.5 px-4.5 mb-4 bg-info-soft border-info text-info">
        <div className="text-[11px] uppercase tracking-wider font-bold">⚠ {t('rfq.banner_label')}</div>
        <div className="text-[13px] mt-1 leading-snug">{data.rfq.disclaimerText}</div>
      </div>

      <RfqDetailClient
        projectId={id}
        rfq={{
          id: data.rfq.id, reference: data.rfq.reference, title: data.rfq.title,
          status: data.rfq.status, sentAt: data.rfq.sentAt,
          responseDeadline: data.rfq.responseDeadline
        }}
        items={data.items}
        vendors={data.vendors}
        quotes={data.quotes}
      />

      <div className="mt-4">
        <RfqAttachments
          projectId={id}
          rfqId={data.rfq.id}
          initial={data.attachments.map(a => ({
            ...a,
            createdAt: a.createdAt.toISOString()
          }))}
          canEdit={data.rfq.status === 'draft'}
        />
      </div>
    </>
  );
}
