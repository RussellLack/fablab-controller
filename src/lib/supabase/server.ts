import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

/**
 * Per-request memoised current user.
 *
 * `supabase.auth.getUser()` revalidates the JWT against Supabase's auth
 * server — a real network round-trip — and our layouts + pages each call
 * it independently. Wrapping with React.cache() deduplicates the call
 * inside a single server render so only the first caller pays the cost.
 *
 * Use this from Server Components, layouts, and pages. Server actions
 * and route handlers each handle their own one-off request, so they
 * can keep calling `supabase.auth.getUser()` directly.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/** Supabase client for use in Server Components and Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't set cookies; ignore. Middleware handles refresh.
          }
        }
      }
    }
  );
}
