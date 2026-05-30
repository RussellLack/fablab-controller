/**
 * Sentry — Edge runtime init. Same as server, but for code that runs in the
 * Edge runtime (middleware.ts) — different runtime, separate init required.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
    enabled: process.env.NODE_ENV === 'production'
  });
}
