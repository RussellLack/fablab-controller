import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, projects, clients, purchaseOrders } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { NewInvoiceForm } from './form-client';

async function getNewInvoiceContext(projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [proj] = await db.select({
      id: projects.id,
      reference: projects.reference,
      budgetCurrency: projects.budgetCurrency,
      clientName: clients.name,
      paymentTermsDays: clients.paymentTermsDays
    }).from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, projectId)).limit(1);
    if (!proj) return null;

    const pos = await db.select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      subtotalNet: purchaseOrders.subtotalNet,
      totalGross: purchaseOrders.totalGross,
      currency: purchaseOrders.currency,
      status: purchaseOrders.status
    }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.projectId, projectId), eq(purchaseOrders.status, 'issued')))
      .orderBy(desc(purchaseOrders.createdAt));

    return { project: proj, pos };
  } catch { return null; }
}

export default async function NewInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getNewInvoiceContext(id);
  if (!ctx) notFound();
  const t = await getTranslations();
  return (
    <>
      <h2 className="text-[18px] font-semibold mb-1">{t('invoice.new_title')}</h2>
      <p className="text-ink-2 text-[13px] mb-6">{t('invoice.new_sub')}</p>
      <NewInvoiceForm
        projectId={ctx.project.id}
        projectRef={ctx.project.reference}
        clientName={ctx.project.clientName}
        paymentTermsDays={ctx.project.paymentTermsDays ?? 30}
        defaultCurrency={ctx.project.budgetCurrency ?? 'NOK'}
        availablePos={ctx.pos}
      />
    </>
  );
}
