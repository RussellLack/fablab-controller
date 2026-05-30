/**
 * Next.js 15 instrumentation hook — runs once when a runtime starts.
 * Loads the appropriate Sentry config for the current runtime (Node or Edge).
 *
 * The client config (sentry.client.config.ts) is loaded automatically by
 * the Sentry Next.js plugin — no manual import needed.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

/**
 * Forwards uncaught nested errors from React Server Components to Sentry.
 * Without this, RSC render errors get swallowed silently in production.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: 'Pages Router' | 'App Router'; routePath: string; routeType: string }
) {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(err, request, context);
}
