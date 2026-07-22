import { NextResponse } from 'next/server';
import { eq, asc, desc, sql } from 'drizzle-orm';
import { db, clients, vendors, projects } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffAllowed } from '@/lib/staff-access';

/**
 * Search index for the global Cmd-K command palette.
 *
 * Returns one compact array of every searchable entity (clients,
 * vendors, projects) with just the fields the palette needs to
 * match + render results: id, type, name/title, ref, and one
 * secondary line (contact email for clients/vendors, client name
 * for projects).
 *
 * Staff-only — same gate as the rest of the (app) routes. Cached
 * for one minute at the edge because the index changes rarely and
 * we don't want to rebuild it on every keystroke.
 *
 * Roughly 300 rows × ~150 bytes = ~45 KB at current scale; well
 * under the threshold where lazy client-side fetching becomes a
 * concern.
 */

export const dynamic = 'force-dynamic';

type Entry = {
  type: 'client' | 'vendor' | 'project';
  id: string;
  name: string;
  ref?: string;
  secondary?: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !(await isStaffAllowed(user.email))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ entries: [] satisfies Entry[] });
  }

  try {
    const [clientRows, vendorRows, projectRows] = await Promise.all([
      db
        .select({
          id: clients.id,
          name: clients.name,
          email: clients.primaryContactEmail,
          orgNo: clients.orgNumber
        })
        .from(clients)
        .orderBy(asc(clients.name))
        .limit(2000),
      db
        .select({
          id: vendors.id,
          name: vendors.name,
          email: vendors.contactEmail,
          country: vendors.country
        })
        .from(vendors)
        .where(eq(vendors.active, true))
        .orderBy(asc(vendors.name))
        .limit(2000),
      db
        .select({
          id: projects.id,
          ref: projects.reference,
          title: projects.title,
          stage: projects.currentStage,
          clientName: sql<string | null>`(
            SELECT c.name FROM ${clients} c WHERE c.id = ${projects.clientId}
          )`
        })
        .from(projects)
        .orderBy(desc(projects.createdAt))
        .limit(2000)
    ]);

    const entries: Entry[] = [
      ...clientRows.map(
        (c): Entry => ({
          type: 'client',
          id: c.id,
          name: c.name,
          secondary: c.email ?? c.orgNo ?? undefined
        })
      ),
      ...vendorRows.map(
        (v): Entry => ({
          type: 'vendor',
          id: v.id,
          name: v.name,
          secondary: v.email ?? v.country ?? undefined
        })
      ),
      ...projectRows.map(
        (p): Entry => ({
          type: 'project',
          id: p.id,
          name: p.title,
          ref: p.ref,
          secondary: p.clientName ?? p.stage
        })
      )
    ];

    return NextResponse.json(
      { entries },
      {
        headers: {
          // 60s edge cache; SWR 5 min — the index changes slowly enough
          // that being slightly stale is fine, but the palette needs
          // fresh-ish data after imports.
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300'
        }
      }
    );
  } catch {
    return NextResponse.json({ entries: [] satisfies Entry[] });
  }
}
