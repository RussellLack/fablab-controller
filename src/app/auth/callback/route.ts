import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { saveGoogleTokens } from '@/server/lib/google-tokens'
import { isStaffEmail } from '@/lib/auth-helpers'

/**
 * Build a same-origin redirect Response with a clean Location header.
 *
 * NOTE on the manual Response: on Netlify (via @netlify/plugin-nextjs)
 * the original request's query string leaks through into the Location
 * header even when we pass a fully-qualified clean URL to
 * `NextResponse.redirect()`. We've also verified that constructing a
 * manual Response with explicit `headers: { Location }` still leaks —
 * something in the plugin pipeline appends the original query on
 * same-origin redirects from route handlers. So we DON'T try to
 * defeat the leak any more. Instead, the route handler always
 * redirects to either /login (on failure) or the post-auth landing,
 * and the middleware rescue refuses to fire on public paths — so
 * even if the leaked `?code=…` rides along, the loop is broken.
 *
 * Returns 303 (See Other) which is the correct status for "completed
 * auth flow, look here next" — and a browser following 303 strips the
 * code from view once the next page renders.
 */
function redirectTo(landing: string, baseUrl: string): Response {
  const target = new URL(landing, baseUrl)
  target.search = ''
  return new Response(null, {
    status: 303,
    headers: { Location: target.toString() }
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  /** Optional ?next=… landing path — preserved across the magic-link round trip. */
  const next = url.searchParams.get('next')
  let sessionEmail: string | null = null
  let exchangeFailed = false

  // On Netlify, `request.url` resolves to the internal deploy URL
  // (e.g. https://<deploy>--fablab-controller.netlify.app) rather than
  // the public custom domain. Prefer NEXT_PUBLIC_APP_URL, then forwarded
  // headers, then finally the parsed request origin.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL
    ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin)

  if (code) {
    // Inline the supabase client (instead of using the shared @/lib/supabase/server)
    // so we don't inherit the try/catch around `cookieStore.set`. That catch is
    // correct for server components (where set() throws by design) but here in a
    // route handler it would silently swallow real cookie-write failures.
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          }
        }
      }
    )
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    sessionEmail = data.session?.user?.email ?? null

    if (error || !data.session) {
      // Code exchange failed. Most common cause is a missing or expired
      // PKCE code_verifier cookie — happens when the OAuth code lands
      // on the wrong path first (middleware rescues it but cookies
      // sometimes don't survive the cross-path redirect cleanly).
      //
      // Bounce to /login with an error marker so the loop ends; surface
      // the underlying error to both Sentry (if configured) and stderr
      // so it shows up in Netlify function logs either way.
      exchangeFailed = true
      const reason = error?.message ?? 'no session returned'
      const errCode = (error as { code?: string } | null)?.code
      const errStatus = (error as { status?: number } | null)?.status
      const tail = [
        errCode ? `code=${errCode}` : null,
        errStatus ? `status=${errStatus}` : null
      ].filter(Boolean).join(' ')
      // `[auth.callback]` prefix makes these easy to grep in Netlify's
      // Functions tab. Includes the email we attempted (if returned)
      // so the same user across multiple attempts is correlatable.
      console.error(
        `[auth.callback] exchange failed for ${sessionEmail ?? '<no email>'}: ${reason}${
          tail ? ` (${tail})` : ''
        }`
      )
      Sentry.captureException(
        new Error(`Auth code exchange failed: ${reason}`),
        { tags: { area: 'auth.callback' } }
      )
    } else if (data.session.user?.id && data.session.provider_token) {
      // Persist the Google provider tokens (gmail.send scope) for later
      // server-side use. Wrapped in try/catch so a missing/un-migrated
      // user_google_tokens table doesn't block sign-in.
      try {
        await saveGoogleTokens(data.session.user.id, {
          accessToken: data.session.provider_token,
          refreshToken: data.session.provider_refresh_token ?? null,
          scope:
            'openid email profile https://www.googleapis.com/auth/gmail.send'
        })
      } catch {
        // Token storage failure must not block sign-in. The user is still
        // authenticated; Gmail-send features will be unavailable until the
        // user_google_tokens table exists / is reachable.
      }
    }
  }

  // Failure → /login with error marker. Even if Netlify preserves the
  // ?code= on the redirect, /login is a public path and middleware
  // won't bounce back, so the loop ends.
  if (exchangeFailed) {
    return redirectTo('/login?error=auth_failed', baseUrl)
  }

  // Success → /dashboard (or /portal for customers, or ?next= override).
  let landing = '/dashboard'
  if (next && next.startsWith('/')) {
    landing = next
  } else if (sessionEmail && !isStaffEmail(sessionEmail)) {
    landing = '/portal'
  }
  return redirectTo(landing, baseUrl)
}
