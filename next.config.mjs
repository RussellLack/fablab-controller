import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n.ts');

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
