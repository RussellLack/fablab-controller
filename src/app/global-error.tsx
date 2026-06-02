'use client';

/**
 * Next.js root error boundary — catches errors that bubble out of the root
 * layout itself (the most catastrophic class of React rendering errors).
 *
 * Reports the error to Sentry, then renders a minimal Fablab-branded fallback
 * UI. Must be a client component, must declare its own <html>/<body> because
 * it replaces RootLayout when triggered (so next-intl, fonts, providers etc.
 * are all unavailable here — keep it self-contained).
 *
 * Lower-level errors are caught by route-level error.tsx files; this is the
 * last line of defence.
 *
 * Spec: https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error
 * Sentry: https://docs.sentry.io/platforms/javascript/guides/nextjs/#errors-from-nested-react-server-components
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
          background: '#f6f5f1',
          color: '#1a1a1a',
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center'
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e0d8',
            borderRadius: 10,
            padding: '32px 36px',
            maxWidth: 480,
            width: 'calc(100% - 32px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 14
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#c2410c',
                color: 'white',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700
              }}
            >
              F
            </div>
            <strong style={{ fontSize: 14 }}>Fablab Controller</strong>
          </div>

          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: '0 0 6px'
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: '#5b5b5b',
              fontSize: 14,
              lineHeight: 1.5,
              margin: '0 0 18px'
            }}
          >
            An unexpected error occurred. The issue has been reported
            automatically; if it keeps happening, let Russell know.
          </p>

          {error?.digest ? (
            <p
              style={{
                fontFamily: '"SF Mono", Menlo, Consolas, monospace',
                fontSize: 11,
                color: '#8d8d8a',
                background: '#f6f5f1',
                border: '1px solid #e2e0d8',
                borderRadius: 6,
                padding: '6px 10px',
                margin: '0 0 18px',
                wordBreak: 'break-all'
              }}
            >
              Ref: {error.digest}
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => reset()}
              style={{
                background: '#1a1a1a',
                color: 'white',
                border: '1px solid #1a1a1a',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Try again
            </button>
            {/* Plain <a> by design — this is the global error boundary;
                next/link relies on the same React runtime that just
                crashed, so it can't be trusted as the recovery link. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                background: '#ffffff',
                color: '#1a1a1a',
                border: '1px solid #e2e0d8',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
