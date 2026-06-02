import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { JourneyOverlay } from '@/components/journey-overlay';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isStaffEmail } from '@/lib/auth-helpers';

// Every authenticated route depends on the session cookie and queries the
// database per request — they must never be statically prerendered. Setting
// `dynamic = 'force-dynamic'` on this layout cascades to all child routes.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Customers (non-Workspace emails — they signed in via magic link) belong
  // in the portal route group, not the staff app. Bounce them back so they
  // can't accidentally browse staff routes by URL.
  if (!isStaffEmail(user.email)) redirect('/portal');

  // Derive display name + initials from the auth user
  const name = (user.user_metadata?.full_name as string) ?? user.email ?? 'User';
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="grid grid-cols-[230px_1fr] grid-rows-[56px_1fr] min-h-screen">
      <Header userName={name} userInitials={initials} />
      <Sidebar />
      <main className="p-6 px-8 overflow-auto">{children}</main>
      <JourneyOverlay />
    </div>
  );
}
