import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n.ts');

// Pin the workspace root to this directory so Next.js doesn't pick up a
// stray package-lock.json elsewhere on the filesystem (e.g. ~/package-lock.json).
// Knock-on effect: Sentry's webpack plugin then finds src/app/global-error.tsx
// correctly and stops warning about a missing global error handler.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build allowed origins from env so the same config works locally and on Netlify.
// Netlify sets `URL` for production deploys and `DEPLOY_PRIME_URL` for previews.
const allowedOrigins = ['localhost:3000'];
const addOrigin = (value) => {
  if (!value) return;
  try { allowedOrigins.push(new URL(value).host); } catch {}
};
addOrigin(process.env.URL);
addOrigin(process.env.DEPLOY_PRIME_URL);
addOrigin(process.env.NEXT_PUBLIC_APP_URL);

/**
 * Security headers applied to every server-rendered response.
 *
 * Why these are here and not in netlify.toml: when @netlify/plugin-nextjs
 * serves a page through a Function (which is every Next.js SSR / RSC /
 * dynamic route), the [[headers]] rules in netlify.toml are bypassed.
 * Only static assets in /_next/static/* pick those up. Setting headers
 * from next.config.mjs ensures HTML responses for actual users get the
 * same baseline.
 *
 * HSTS is added at the Netlify edge automatically — we don't duplicate
 * it here.
 *
 * Permissions-Policy denies all powerful features by default; the brief
 * wizard uses file inputs for client uploads but doesn't need camera /
 * mic / geolocation. Add features back here only as the product grows
 * into needing them.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()'
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders }
    ];
  },
  experimental: {
    serverActions: { allowedOrigins }
  }
};

// Apply next-intl, then Sentry. Sentry's plugin uploads source maps at build
// time so errors in the dashboard have pretty stack traces. Source map
// upload runs only when SENTRY_AUTH_TOKEN is set (CI / Netlify prod build);
// local builds skip it silently.
export default withSentryConfig(withNextIntl(nextConfig), {
  // Org + project come from Sentry dashboard → Settings
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token authorises source-map upload. Required only at CI/build time.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Hide source maps from public web access — they're uploaded to Sentry only
  hideSourceMaps: true,

  // Suppress build-time logs unless something fails
  silent: !process.env.CI,

  // Don't fail the build if Sentry is misconfigured
  disableLogger: true,

  // Tunnel `/monitoring` to bypass ad-blockers (Sentry-recommended)
  tunnelRoute: '/monitoring'
});
