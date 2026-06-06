import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth/callback'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(p => path.startsWith(p));

  // Defensive OAuth-code rescue.
  //
  // If an unauthenticated request lands on any non-callback path with a
  // UUID-format `?code=` parameter, treat it as a misrouted OAuth return
  // and re-route to /auth/callback preserving the code.
  //
  // Why this is needed: when our login-page `redirectTo` is not present
  // in Supabase's Redirect URLs allow-list (or the Site URL drifts away
  // from the bare origin), Supabase silently falls back to Site URL and
  // ships the code there instead of /auth/callback. Without this rescue
  // the user is bounced to /login and login appears to fail.
  //
  // The PKCE code_verifier cookie set by signInWithOAuth on the login
  // client travels with this request, so the exchange in /auth/callback
  // still succeeds after the re-route.
  //
  // UUID regex narrows the rescue to actual Supabase auth codes — no
  // false positive on any legitimate `?code=` query param the app may
  // use for other purposes.
  if (!user && path !== '/auth/callback') {
    const code = request.nextUrl.searchParams.get('code');
    if (
      code &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
    ) {
      const callbackUrl = request.nextUrl.clone();
      callbackUrl.pathname = '/auth/callback';
      // Carry the original path as `next` so /auth/callback returns the
      // user there after the exchange (e.g. magic-link landing on a
      // specific /portal/projects/[id]). Default landings are skipped.
      if (path !== '/' && path !== '/dashboard' && path !== '/portal') {
        callbackUrl.searchParams.set('next', path);
      }
      return NextResponse.redirect(callbackUrl);
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}
