/**
 * Sentry — browser-side init. Captures unhandled errors, unhandled promise
 * rejections, and explicit Sentry.captureException(...) calls from client
 * components.
 *
 * Free tier (5K errors/mo) is sufficient for this app's volume. We
 * deliberately skip performance tracing and session replay to stay
 * within free limits and minimise data egress (see `feedback-token-cost-minimisation`).
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    // Environment + release tagging for the dashboard
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV
      ?? process.env.NEXT_PUBLIC_CONTEXT
      ?? process.env.NODE_ENV
      ?? 'development',

    // Free-tier-conscious defaults
    tracesSampleRate: 0,                                  // no performance tracing
    replaysSessionSampleRate: 0,                          // no session replay
    replaysOnErrorSampleRate: 0,                          // not even on errors
    profilesSampleRate: 0,                                // no profiling

    // Don't sample low-noise errors in dev
    enabled: process.env.NODE_ENV === 'production',

    // Strip sensitive cookies/headers before sending
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },

    // Common false positives to ignore
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured'
    ]
  });
}
