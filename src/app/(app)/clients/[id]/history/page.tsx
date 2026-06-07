import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { db, clients } from '@/db';
import { AuditTimeline } from '@/components/audit-timeline';

export default async function ClientHistoryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!client) notFound();
  const t = await getTranslations();
  return (
    <AuditTimeline
      entityType="client"
      entityId={id}
      entityName={client.name}
      backHref={`/clients/${id}`}
      backLabel={t('audit.back_to_client')}
    />
  );
}
