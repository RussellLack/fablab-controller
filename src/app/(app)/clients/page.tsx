import { asc, sql } from 'drizzle-orm';
import { db, clients, projects, vendors } from '@/db';
import { ClientsExplorer, type ClientRow } from './explorer';

/**
 * Clients list — server fetches all rows once, the client-side
 * <ClientsExplorer> handles search / sort / filter UI.
 *
 * Read-only; creation flows still live in /leads/new. Click any row
 * to open /clients/[id].
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
        // Dual-role detection — qualified literals inside the subquery
        // (see /clients/[id] for the drizzle-shadowing explanation).
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

export default async function ClientsPage() {
  const rows = await getClients();
  return <ClientsExplorer rows={rows} />;
}
