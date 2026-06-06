/**
 * Test-only login route — sets a Supabase session cookie for the given test
 * email so Playwright can drive the app without going through Google OAuth.
 *
 * SECURITY: hard-gated by NODE_ENV !== 'production' AND ENABLE_TEST_LOGIN === '1'.
 * Both conditions must be true. Production deploys will 403 here.
 *
 * Usage from a test:
 *   POST /api/test/login { "email": "seed@fablabdesign.com" }
 *   → sets cookies, returns 200, redirects expected
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const TEST_LOGIN_ALLOWED =
  process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_LOGIN === '1';

export async function POST(request: Request) {
  if (!TEST_LOGIN_ALLOWED) {
    return NextResponse.json({ error: 'Test login disabled' }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 });
  }

  const { email } = await request.json().catch(() => ({ email: null }));
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  // Admin client — uses service role to mint a session for any user
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Find or create the user
  const { data: existing } = await admin.auth.admin.listUsers();
  let user = existing.users.find(u => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: 'Test User' }
    });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? 'createUser failed' }, { status: 500 });
    }
    user = data.user;
  }

  // Mint an access token for that user (admin-only API)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (linkErr || !linkData.properties) {
    return NextResponse.json({ error: linkErr?.message ?? 'generateLink failed' }, { status: 500 });
  }

  // Exchange the OTP token for a session via the SSR client (which sets cookies)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        }
      }
    }
  );

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email'
  });
  if (verifyErr) {
    return NextResponse.json({ error: verifyErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: user.id });
}
