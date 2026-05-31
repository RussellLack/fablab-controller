import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

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
    await supabase.auth.exchangeCodeForSession(code)
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

  return NextResponse.redirect(`${baseUrl}/dashboard`)
}
