import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { saveGoogleTokens } from '@/server/lib/google-tokens'
import { isStaffEmail } from '@/lib/auth-helpers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  /** Optional ?next=… landing path — preserved across the magic-link round trip. */
  const next = url.searchParams.get('next')
  let sessionEmail: string | null = null

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

    // Persist the Google provider tokens (gmail.send scope) for later
    // server-side use. Wrapped in try/catch so a missing/un-migrated
    // user_google_tokens table doesn't block sign-in.
    if (!error && data.session?.user?.id && data.session.provider_token) {
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

  // On Netlify, `request.url` resolves to the internal deploy URL
  // (e.g. https://<deploy>--fablab-controller.netlify.app) rather than
  // the public custom domain. Prefer NEXT_PUBLIC_APP_URL, then forwarded
  // headers, then finally the parsed request origin.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL
    ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin)

  // Where to send the user after sign-in:
  //   - explicit ?next= wins (used by magic-link invitations that point at
  //     a specific /portal/projects/[id])
  //   - else: staff → /dashboard, customer (non-Workspace email) → /portal
  let landing = '/dashboard'
  if (next && next.startsWith('/')) {
    landing = next
  } else if (sessionEmail && !isStaffEmail(sessionEmail)) {
    landing = '/portal'
  }

  return NextResponse.redirect(`${baseUrl}${landing}`)
}
