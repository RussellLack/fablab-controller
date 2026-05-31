import { cache } from 'react';
import { db, projects, clients, users } from '@/db';
import { eq } from 'drizzle-orm';

/** Cached lookup so the project layout + page share one query per request. */
export const getProject = cache(async (id: string) => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db
      .select({
        id: projects.id,
        reference: projects.reference,
        title: projects.title,
        description: projects.description,
        currentStage: projects.currentStage,
        fablabRole: projects.fablabRole,
        projectType: projects.projectType,
        priority: projects.priority,
        budget: projects.budget,
        budgetCurrency: projects.budgetCurrency,
        siteAddress: projects.siteAddress,
        targetHandoverDate: projects.targetHandoverDate,
        clientName: clients.name,
        clientContact: clients.primaryContactName,
        clientEmail: clients.primaryContactEmail,
        ownerName: users.name
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(users, eq(projects.currentOwnerId, users.id))
      .where(eq(projects.id, id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
});
