import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, clients } from '@/db';
import { ClientDetailPanel } from '../detail-panel';
import { ClientEditForm, type EditableClient } from './edit-form';

/**
 * Standalone full-page detail for a client. Switches into edit mode
 * when ?edit=1 is in the URL — same route, different render.
 */
export default async function ClientDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isEditing = sp.edit === '1';

  if (!isEditing) {
    return <ClientDetailPanel clientId={id} mode="page" />;
  }

  // Fetch the editable fields directly — the edit form needs the
  // raw column values, not the joined view used by the read panel.
  const [row] = await db
    .select({
      id: clients.id,
      name: clients.name,
      kind: clients.kind,
      primaryContactName: clients.primaryContactName,
      primaryContactEmail: clients.primaryContactEmail,
      primaryContactPhone: clients.primaryContactPhone,
      billingAddress: clients.billingAddress,
      orgNumber: clients.orgNumber,
      paymentTermsDays: clients.paymentTermsDays,
      bankAccountRef: clients.bankAccountRef,
      notes: clients.notes
    })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!row) notFound();

  return <ClientEditForm client={row as EditableClient} />;
}
