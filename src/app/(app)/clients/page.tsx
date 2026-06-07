import { asc, sql } from 'drizzle-orm';
import { db, clients, projects, vendors } from '@/db';
import { ClientsExplorer, type ClientRow } from './explorer';
import { ClientDetailPanel } from './detail-panel';

/**
 * Clients list — server fetches the full set and (when split view is
 * active via `?selected=<id>`) pre-renders the inline detail panel
 * so the explorer never has to refetch on the client.
 *
 * Click any row → /clients/[id] (table & grid views), or load into
 * the right-hand panel in split view.
 */
async function getClients(): Promise<ClientRow[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        id: clients.id,
        name: clients.name,
        kind: clients.kind,
        primaryContactName: clients.primaryContactName,
        primaryContactEmail: clients.primaryContactEmail,
        primaryContactPhone: clients.primaryContactPhone,
        orgNumber: clients.orgNumber,
        paymentTermsDays: clients.paymentTermsDays,
        activeProjects: sql<number>`(
          select count(*)::int from ${projects}
          where ${projects.clientId} = ${clients.id}
            and ${projects.currentStage} not in ('cancelled', 'archived')
        )`,
        isAlsoVendor: sql<boolean>`EXISTS (
          SELECT 1 FROM ${vendors} v
          WHERE lower(v.name) = lower(clients.name)
             OR (clients.org_number IS NOT NULL
                 AND v.notes ~ ('Org\\.nr\\.: ' || clients.org_number || '(\\D|$)'))
        )`
      })
      .from(clients)
      .orderBy(asc(clients.name))
      .limit(1000);
    return rows as ClientRow[];
  } catch {
    return [];
  }
}

export default async function ClientsPage({
  searchParams
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const sp = await searchParams;
  const selectedId = sp.selected ?? null;
  const rows = await getClients();

  const selectedDetail = selectedId
    ? <ClientDetailPanel clientId={selectedId} mode="panel" />
    : null;

  return <ClientsExplorer rows={rows} selectedDetail={selectedDetail} />;
}
