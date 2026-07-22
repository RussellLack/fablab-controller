import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { db, users, staffAllowlist } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { getStaffContext } from '@/lib/staff-access';
import { TeamClient, type TeamMember } from './team-client';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const ctx = await getStaffContext(user.email, user.id);
  if (!ctx.allowed) redirect('/portal');
  // Admin-only screen.
  if (!ctx.isAdmin) redirect('/dashboard');

  // Signed-in members (real users rows) + pending invites (allowlist rows with
  // no matching users row yet). Merged into one roster.
  const signedIn = await db
    .select({
      email: users.email,
      name: users.name,
      roles: users.roles,
      active: users.active
    })
    .from(users)
    .orderBy(users.name);

  const pending = await db
    .select({
      email: staffAllowlist.email,
      name: staffAllowlist.name,
      roles: staffAllowlist.roles,
      active: staffAllowlist.active
    })
    .from(staffAllowlist)
    .where(sql`lower(${staffAllowlist.email}) not in (select lower(email) from ${users})`);

  const members: TeamMember[] = [
    ...signedIn.map((m) => ({
      email: m.email,
      name: m.name ?? m.email,
      roles: m.roles ?? [],
      active: m.active,
      pending: false
    })),
    ...pending.map((m) => ({
      email: m.email,
      name: m.name ?? m.email,
      roles: m.roles ?? [],
      active: m.active,
      pending: true
    }))
  ];

  return (
    <TeamClient members={members} currentEmail={(user.email ?? '').toLowerCase()} />
  );
}
