import { getCurrentUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isStaffEmail } from '@/lib/auth-helpers';
import { PortalHeader } from '@/components/portal/portal-header';

/**
 * Customer portal layout.
 *
 * Auth contract:
 *   - Must be signed in (no session → /login).
 *   - Must NOT be staff (Workspace email → bounce to /dashboard).
 * Per-project access is enforced inside each portal page, by checking
 * that the signed-in email has an accepted, non-revoked invitation
 * for the requested project (see /portal/projects/[id]).
 *
 * Layout is deliberately minimal — no sidebar, no journey overlay,
 * no internal navigation. Customer sees the branded header + their
 * current project content + sign-out.
 */
export const dynamic = 'force-dynamic';

export default async function PortalLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect('/login');
  if (isStaffEmail(user.email)) redirect('/dashboard');

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <PortalHeader email={user.email ?? ''} />
      <main className="flex-1 max-w-3xl w-full mx-auto p-6 px-8">{children}</main>
    </div>
  );
}
