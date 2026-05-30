# Testing — Playwright Smoke

The Controller has one e2e smoke suite that exercises the full Wave 1+2 demo
path against a running app. It catches regressions in the gates (R1 / R2 / R3)
that types + lint can't.

## What it covers

| Test | What it verifies |
|---|---|
| Dashboard renders after login | Auth + middleware + Server Components compile + first-paint data |
| Bilingual toggle switches in place | next-intl locale cookie + RSC re-render works |
| R1 — refuses conversion when intake incomplete | Lead → Project gate enforced (Convert button disabled) |
| R1 — converts when intake complete | Conversion creates Client + Project + ScopeBaseline draft + redirects |
| R2 — scope approval auto-promotes version | Approving a scope-target Approval flips the ScopeBaselineVersion to `approved` |
| R3 — PO issue gate blocks unapproved items | Skipped if seed has no draft PO; otherwise verifies the banner |

The smoke is intentionally narrow — it's a regression net, not exhaustive
unit testing. Add unit tests for individual server actions when those start
to grow in complexity (Wave 3+).

## Local run

You need:
- A `.env.local` configured (see `QUICKSTART.md`)
- Supabase set up with the v0.8 schema (`npm run db:push && npm run db:setup`)
- Seed data loaded (`npm run db:seed`)
- The **Supabase service-role key** in `SUPABASE_SERVICE_ROLE_KEY` (the test login route needs admin API access to mint sessions — get from Supabase → Settings → API)
- `ENABLE_TEST_LOGIN=1` set when starting the dev server

First-time setup:
```bash
npm install --legacy-peer-deps
npm run test:e2e:install        # downloads Chromium for Playwright
```

Run the smoke:
```bash
npm run test:e2e
```

The Playwright config starts `npm run dev` automatically with
`ENABLE_TEST_LOGIN=1` and tears it down after.

For interactive debugging:
```bash
npm run test:e2e:ui             # opens the Playwright UI mode
```

## How the auth bypass works

Production deploys don't have a way for tests to log in — Google OAuth needs
a human + a real Google account. So we have a test-only route at
`/api/test/login` that uses the Supabase admin API to mint a session cookie
for a known seed email (`seed@fablab.no`, created by `db:seed`).

The route is **double-gated**:
1. `NODE_ENV !== 'production'` (Next.js sets this on production builds)
2. `ENABLE_TEST_LOGIN === '1'` (must be set explicitly)

Both must be true for the route to function — otherwise it returns 403. The
production deploy on Netlify will never have `ENABLE_TEST_LOGIN` set, so
this surface is closed in prod.

## Database state

Tests share a single DB and run sequentially (`workers: 1`). They mutate
state — converting leads, recording approvals, etc. Re-seeding between runs
keeps the suite deterministic:

```bash
npm run db:seed && npm run test:e2e
```

A cleaner pattern (per-test isolation) lands when test volume justifies it.
For a smoke suite, re-seed + sequential is the simpler honest answer.

## CI — currently manual-trigger only

`.github/workflows/e2e.yml` is configured but commented out for `pull_request`.
It runs only on manual `workflow_dispatch` until a dedicated test Supabase
project is set up.

To enable PR runs:
1. Create a separate Supabase project ("fablab-controller-e2e")
2. Set six GitHub Action secrets:
   - `E2E_SUPABASE_URL`
   - `E2E_SUPABASE_ANON_KEY`
   - `E2E_SUPABASE_SERVICE_ROLE_KEY`
   - `E2E_DATABASE_URL`
3. Uncomment the `pull_request` trigger in `.github/workflows/e2e.yml`

Why a separate Supabase: the e2e tests reset the DB on every run (`db:push +
db:seed`). Doing that against the dev DB would wipe in-progress local work.
A dedicated test project costs nothing on the free tier and keeps the suite
non-destructive.

## What's NOT tested yet

The smoke doesn't cover:
- The procurement spine end-to-end (RFQ → Quote → PO → Issue). The R3 test
  currently skips when no draft PO is seeded — extend seed.ts to include
  one if you want the full chain tested.
- Sentry capture (no test mode for error injection yet)
- Realtime updates (Supabase Realtime subscriptions)
- Multi-user / RLS edge cases
- The Poweroffice integration (out of scope; v2 work)

Add tests when those flows mature. The pattern is in `tests/e2e/helpers.ts`
and `demo-path.spec.ts` — copy + extend.
