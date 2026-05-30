import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Derive display name + initials from the auth user
  const name = (user.user_metadata?.full_name as string) ?? user.email ?? 'User';
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="grid grid-cols-[230px_1fr] grid-rows-[56px_1fr] min-h-screen">
      <Header userName={name} userInitials={initials} />
      <Sidebar />
      <main className="p-6 px-8 overflow-auto">{children}</main>
    </div>
  );
}
