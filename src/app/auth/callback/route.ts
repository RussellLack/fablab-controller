import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // On Netlify, `request.url` resolves to the internal deploy URL
  // (e.g. https://<deploy>--fablab-controller.netlify.app) rather than
  // the public custom domain. Redirecting to that origin would land
  // the browser on a different host than the one where the session
  // cookie was just set, breaking the session and causing a login
  // loop. Prefer the explicitly configured app URL, then fall back to
  // forwarded headers, then finally to the parsed request origin.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL
    ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin)

  return NextResponse.redirect(`${baseUrl}/dashboard`)
}
