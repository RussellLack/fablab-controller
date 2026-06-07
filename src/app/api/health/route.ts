import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Sentry, Netlify monitoring, and uptime
 * probes. Intentionally unauthenticated — monitoring services don't
 * carry a session.
 *
 * Returns:
 *   • status      — always "ok" if the function ran at all. Failures
 *                   surface as a 5xx instead.
 *   • commit      — git SHA of the running deploy (Netlify injects
 *                   COMMIT_REF on every build).
 *   • environment — Netlify context (production / deploy-preview /
 *                   branch-deploy) so probes targeting prod can
 *                   ignore preview noise.
 *   • timestamp   — server-side ISO time, useful for sanity-checking
 *                   clock skew against the caller.
 *
 * Cache-Control: no-store so monitoring services always see a fresh
 * response, never a cached one. Otherwise the edge would happily
 * serve a 5-minute-old success after the function had started
 * failing.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      commit: process.env.COMMIT_REF ?? null,
      environment: process.env.CONTEXT ?? 'unknown',
      timestamp: new Date().toISOString()
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0'
      }
    }
  );
}
