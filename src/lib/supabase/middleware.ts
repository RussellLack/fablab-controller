import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/health'];

// Hard ceiling on the Supabase auth round-trip from the edge. Netlify Edge
// cold-starts can already eat 1-3s of Deno boot before our code runs; if
// Supabase is slow on top of that the whole edge function times out and
// the user sees "the edge function timed out" error. Degrading gracefully
// (treating the request as signed-out) is strictly better than crashing.
// 3s is generous — warm hits return in <100ms.
const GET_USER_TIMEOUT_MS = 3_000;

type GetUserResult = Awaited<ReturnType<ReturnType<typeof createServerClient>['auth']['getUser']>>;

function getUserWithTimeout(
  supabase: ReturnType<typeof createServerClient>
): Promise<GetUserResult> {
  return Promise.race([
    supabase.auth.getUser(),
    new Promise<GetUserResult>((resolve) =>
      setTimeout(
        () => resolve({ data: { user: null }, error: null } as unknown as GetUserResult),
        GET_USER_TIMEOUT_MS
      )
    )
  ]);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(p => path.startsWith(p));

  // Fast path: skip the Supabase round-trip entirely for routes that don't
  // need to know who the user is.
  //   - /auth/callback handles its own cookie exchange.
  //   - /api/health is an unauthenticated probe; we want it to respond as
  //     fast as possible for monitoring services.
  if (path.startsWith('/auth/callback') || path.startsWith('/api/health')) {
    return NextResponse.next({ request });
  }

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

  // Refresh session if expired — with a hard timeout so a slow / hanging
  // auth round-trip can't take down the entire edge function.
  const { data: { user } } = await getUserWithTimeout(supabase);

  // Defensive OAuth-code rescue.
  //
  // If an unauthenticated request lands on any non-callback, non-public
  // path with a UUID-format `?code=` parameter, treat it as a misrouted
  // OAuth return and re-route to /auth/callback preserving the code.
  //
  // Why this is needed: when our login-page `redirectTo` is not present
  // in Supabase's Redirect URLs allow-list (or the Site URL drifts away
  // from the bare origin), Supabase silently falls back to Site URL and
  // ships the code there instead of /auth/callback. Without this rescue
  // the user is bounced to /login and login appears to fail.
  //
  // The `!isPublic` guard is critical: it stops the rescue from firing
  // on /login itself. /auth/callback redirects exchange failures to
  // /login?error=auth_failed; if Netlify leaks the original `?code=`
  // through, that URL becomes /login?error=auth_failed&code=… and
  // without this guard the rescue would bounce that straight back to
  // /auth/callback — infinite loop.
  //
  // UUID regex narrows the rescue to actual Supabase auth codes — no
  // false positive on any legitimate `?code=` query param the app may
  // use for other purposes.
  if (!user && !isPublic) {
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
