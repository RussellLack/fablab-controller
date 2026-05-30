import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, projects, packages, items, vendors } from '@/db';
import { eq, and, asc } from 'drizzle-orm';
import { RfqBuilderForm } from './form-client';

async function getCandidates(projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return null;
    const itemRows = await db.select({
      id: items.id, name: items.name, packageId: items.packageId,
      packageName: packages.name, quantity: items.quantity, unit: items.unit,
      itemType: items.itemType, status: items.status
    }).from(items).innerJoin(packages, eq(items.packageId, packages.id))
      .where(and(eq(packages.projectId, projectId), eq(items.status, 'specified')))
      .orderBy(asc(packages.sequence));
    const vendorRows = await db.select({ id: vendors.id, name: vendors.name, kind: vendors.kind })
      .from(vendors).where(eq(vendors.active, true)).orderBy(asc(vendors.name));
    return { project, items: itemRows, vendors: vendorRows };
  } catch { return null; }
}

export default async function NewRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCandidates(id);
  if (!data) notFound();
  const t = await getTranslations();
  return (
    <>
      <h2 className="text-[18px] font-semibold mb-1">{t('rfq.new_title')}</h2>
      <p className="text-ink-2 text-[13px] mb-6">{t('rfq.new_sub')}</p>
      <RfqBuilderForm
        projectId={data.project.id}
        projectRef={data.project.reference}
        items={data.items}
        vendors={data.vendors}
      />
    </>
  );
}
