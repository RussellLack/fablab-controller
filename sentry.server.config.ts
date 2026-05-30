/**
 * Sentry — Node.js runtime init. Captures errors in:
 *   - Server Components (rendering failures)
 *   - Route Handlers (/auth/callback etc.)
 *   - Server Actions (the highest-stakes ones — they mutate data)
 *   - The seed/setup scripts (if imported via tsx)
 *
 * Server-side DSN is NOT public — uses SENTRY_DSN, not NEXT_PUBLIC_SENTRY_DSN.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    enabled: process.env.NODE_ENV === 'production',

    // Strip sensitive data before sending
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    }
  });
}
