# Deploy to Netlify

End-to-end production deployment in ~20 minutes once you've completed [QUICKSTART.md](./QUICKSTART.md) locally.

## Architecture on Netlify

```
Browser ───▶ Netlify Edge ─┐                            Google OAuth
                           ├─▶ Static assets (CDN)      ↑
                           ├─▶ Server Components (functions)
                           └─▶ Server Actions (functions) ─▶ Supabase (Postgres + Auth + Storage)
                                                                ↑
                                                                └─── Realtime (when wired)
```

Two cloud accounts in play: **Netlify** (hosting + functions) and **Supabase** (DB + auth + storage). The same Supabase project you used in QUICKSTART is fine for production — separate it later when you have real client data.

## 1. Get the code into Git

The Netlify deploy reads from a Git repo (GitHub, GitLab, Bitbucket, or Azure DevOps).

```bash
cd "Fablab Design Project controller/app"
git init
git add .
git commit -m "Initial commit — Fablab Controller v0.1 (Waves 1+2)"

# Create a private GitHub repo first (don't add a README, .gitignore, or license — we have them)
git remote add origin git@github.com:russelllack/fablab-controller.git
git branch -M main
git push -u origin main
```

> **Folder layout note:** if your repo root is the parent folder (with the design docs at top level), tell Netlify the `app/` subfolder is the base directory in step 2. The `netlify.toml` lives in whatever folder Netlify uses as the base.

## 2. Create the Netlify site

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import from Git**
2. Pick your provider (GitHub) → authorise → choose the `fablab-controller` repo
3. **Build settings:**
   - Base directory: `app` (only if your repo has the design docs at top level — leave blank if you push `app/` as the repo root)
   - Build command: `npm run build` (auto-detected from `netlify.toml`)
   - Publish directory: `.next` (auto-detected)
   - Functions directory: auto-detected
4. **Don't deploy yet** — we need env vars first. Click **Deploy site** anyway; the first build will fail at runtime with "missing env var", which is fine. We fix that in step 3.

Netlify gives you a placeholder name like `incandescent-narwhal-abc123.netlify.app`. Note it — you'll need it for OAuth.

## 3. Add environment variables

**Site configuration → Environment variables → Add a variable:**

| Key | Value | Scopes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` | All scopes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (the anon key) | All scopes |
| `DATABASE_URL` | the transaction-pooler URL (port **6543**) | Builds + Functions |

> The `DATABASE_URL` must use the **transaction pooler** (port 6543), not the direct connection (5432). Serverless functions open + close connections rapidly; the pooler is built for that pattern.

Don't expose `DATABASE_URL` to the runtime (it's not `NEXT_PUBLIC_*` — Netlify treats it as server-only by default). Good.

## 4. Update Supabase + Google OAuth for production

**In Supabase** → Authentication → URL Configuration:
- **Site URL:** `https://YOUR-NETLIFY-DOMAIN.netlify.app`
- **Redirect URLs:** add `https://YOUR-NETLIFY-DOMAIN.netlify.app/**` AND `http://localhost:3000/**` (so local dev still works)
- Deploy previews: add `https://*--YOUR-PROJECT.netlify.app/**` if you use them (Netlify's preview URL pattern)

**In Google Cloud Console** → Credentials → your OAuth Client → Authorised redirect URIs:
- Keep `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (this is the only redirect Google needs — Supabase handles the final hop to your app)

You don't need to add the Netlify domain to Google directly. The flow is:
```
Login button (Netlify) → Google consent → Supabase callback → app/auth/callback → Dashboard
```

## 5. Migrate the database

The Drizzle migrations should be version-controlled and applied as a one-time setup per environment. Run **once** from your local Mac against the production Supabase:

```bash
# Switch your local .env.local DATABASE_URL to point at production temporarily
npm run db:generate    # creates migration SQL from the current schema in src/db/migrations/
git add src/db/migrations && git commit -m "Add initial migrations" && git push

npm run db:migrate     # applies migrations to whatever DATABASE_URL points to (production!)
npm run db:setup       # one-shot: GIST exclusion constraint, handle_new_user trigger, backfill
```

⚠ **Switch your `.env.local` back to dev** when you're done. Or use two env files (`.env.local.dev` and `.env.local.prod`) and swap with a shell function.

Don't run `db:push` against production — it skips migration history and is dev-only.

### Seeding production (optional, one-time)

If you want the demo data in production for a short pilot:
```bash
npm run db:seed
```
Skip this for real go-live. The pilot data has fake clients (Tromsø Museum is real; check before keeping live).

## 6. Trigger the first real deploy

After env vars + Supabase config are in:
```bash
# Either push an empty commit
git commit --allow-empty -m "Trigger Netlify rebuild with env vars"
git push

# Or in the Netlify UI: Deploys → Trigger deploy → Clear cache and deploy site
```

Watch the build log. Common first-time issues:
- ⚠ `Module not found: @netlify/plugin-nextjs` — Netlify usually auto-injects this; if it doesn't, add `"@netlify/plugin-nextjs": "^5.7.0"` to `devDependencies` and push
- ⚠ npm install failures with peer-dep errors — `NPM_FLAGS=--legacy-peer-deps` in `netlify.toml` should handle it; double-check it's there
- ⚠ Build timeout (default 15 min) — the Next.js + Drizzle schema compile takes ~3-5 min. Should be fine.

## 7. Smoke test

Visit your Netlify URL → land on `/login` → sign in with a `fablab.no` Google account → should redirect to `/dashboard`.

First sign-in creates the `public.users` row via the `handle_new_user` trigger from `db:setup`. If that didn't run, the dashboard will fail silently — go back to step 5 and run `npm run db:setup`.

Walk the demo path from QUICKSTART section 6. If something's off, the Netlify function logs (Functions → Function log) show server errors in real time.

## 8. Custom domain — `controller.fablabdesign.com`

End-to-end in ~15 minutes + DNS propagation wait. The apex `fablabdesign.com` is untouched — only the `controller.` subdomain is wired.

> **Standing rule — never put Netlify at the apex while Webflow runs the marketing site.**
>
> Every Netlify-hosted property on `fablabdesign.com` must be on its own subdomain via **CNAME or subdomain delegation** (the pattern below).
> Do not add Netlify apex A records to `fablabdesign.com`, do not point an
> `ALIAS`/`ANAME` at Netlify, and do not redirect the apex through Netlify
> while the marketing site is live at `www.fablabdesign.com`. This applies to
> every future Netlify subdomain — pick a new label (`portal-staging`,
> `docs`, whatever) and use the CNAME pattern from §8.2.

### 8.1. Add the domain in Netlify

1. **Site configuration → Domain management → Add a domain**
2. Enter `controller.fablabdesign.com`
3. Netlify will say *"Awaiting external DNS"* and show you a target value — usually one of:
   - **CNAME target:** `your-site-name.netlify.app` (preferred — handles automatic failover)
   - Or an A record set if you can't use CNAME at the subdomain level (rare)
4. Note the exact CNAME target Netlify shows — paste it into the DNS step below

### 8.2. Add the DNS record at ProISP

`fablabdesign.com` is hosted and DNS-managed at **ProISP** (proisp.no), the Norwegian hosting provider. Here's the ProISP-specific path:

1. **Log in** at [proisp.no](https://proisp.no) → customer area (kundeområde)
2. **Find the domain** — list of your domains; click `fablabdesign.com`
3. **Open DNS management** — usually labelled *"DNS-behandling"*, *"DNS-innstillinger"*, or *"DNS records"* depending on the panel version
4. **Add a new record:**
   - Type: **CNAME**
   - Name (or Hostnavn): **`controller`** — just the subdomain part. ProISP auto-appends the apex `.fablabdesign.com`.
   - Value / Target / Pointing to: the CNAME target Netlify gave you (e.g. `your-site-name.netlify.app`)
   - TTL: **300** seconds (raise to 3600 once it's stable)
5. **Save** — ProISP usually applies DNS changes immediately on save, but some plans have a "publish changes" button at the bottom of the DNS view. Check before navigating away.

**Don't touch the existing records** for `fablabdesign.com`:
- The `A` / `CNAME` records pointing at ProISP's web hosting (for the marketing site)
- `MX` records (email)
- `TXT` records (SPF / DKIM / domain verification)
- `NS` records (nameserver delegation — keep DNS authority at ProISP)

You're adding a brand new CNAME for the `controller` subdomain only.

> **ProISP-specific gotchas:**
> - If ProISP shows a "trailing dot required" hint on the target value, format it as `your-site-name.netlify.app.` (with a final period). Both forms usually work but the panel may be picky.
> - The DNS change is visible globally in 5–30min. ProISP doesn't have a propagation cache that delays it further.
> - If you have multiple admins on the ProISP account, only owners/admins can add DNS records.
> - ProISP support (`support@proisp.no`) responds quickly in Norwegian if the panel won't accept the CNAME.

> **Common pitfall (any registrar):** some panels expect the full FQDN in the Name field (`controller.fablabdesign.com`), others expect just `controller`. If you see your record render as `controller.fablabdesign.com.fablabdesign.com` after saving, you've double-prefixed — edit and use just `controller`.

### 8.3. Wait for DNS propagation

- Usually **5–30 minutes**, occasionally longer
- Check with: `dig controller.fablabdesign.com` or [dnschecker.org](https://dnschecker.org)
- When it returns the Netlify CNAME globally, you're done waiting

### 8.4. Netlify auto-provisions SSL

Once DNS resolves, Netlify automatically requests a Let's Encrypt certificate. Usually completes within 5 minutes of DNS being live. You'll see the green "Netlify DNS" → "HTTPS" status in the Domain management view. **Don't proceed to 8.5 until SSL is provisioned** — Supabase + the OAuth callback both require HTTPS.

### 8.5. Update Supabase Auth configuration

In Supabase → **Authentication → URL Configuration**:

1. **Site URL** → change to `https://controller.fablabdesign.com`
2. **Redirect URLs** → add `https://controller.fablabdesign.com/**`
3. **Keep** the existing `http://localhost:3000/**` entry (so local dev still works)
4. **Keep** the existing `*.netlify.app` entry for a transition period — once you've verified the custom domain works end-to-end, you can remove it

### 8.6. Google OAuth — no changes needed

The OAuth redirect URI is the Supabase callback (`https://YOUR-PROJECT.supabase.co/auth/v1/callback`), not your app domain. Google doesn't need to know about `controller.fablabdesign.com` at all.

### 8.7. Update Netlify env vars

**Site configuration → Environment variables:**

| Key | New value | Scope |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://controller.fablabdesign.com` | All |

This feeds into `next.config.mjs`'s `allowedOrigins` so server actions accept requests from the custom domain.

### 8.8. Trigger a redeploy

```bash
git commit --allow-empty -m "Switch to controller.fablabdesign.com" && git push
```

Or use Netlify's "Trigger deploy → Clear cache and deploy site". The new build picks up the env var.

### 8.9. Smoke test

1. Visit `https://controller.fablabdesign.com` → should redirect to `/login`
2. Click Continue with Google → should sign in cleanly → land on `/dashboard`
3. Test the EN/NO toggle to confirm cookies work on the new origin
4. Optional: run the Playwright smoke against the new URL (`E2E_BASE_URL=https://controller.fablabdesign.com npm run test:e2e`)

### 8.10. Add a robots block (staff-only tool)

This is internal-only — don't want Google indexing it. Create `app/public/robots.txt`:
```
User-agent: *
Disallow: /
```
Commit + push → next deploy picks it up.

### Optional — apex redirect

If you'd ever want `fablabdesign.com/controller` to redirect to `controller.fablabdesign.com`, add a redirect on the marketing site. Out of scope for now — the standalone subdomain is the clean primary.

## Production checklist

Before going live with real client data:

- [ ] Use a **separate Supabase project** for production (don't reuse the dev one)
- [ ] Set up Supabase **point-in-time backups** (Settings → Database → Backups; free tier covers 7 days)
- [ ] **Sentry wired** (see below for setup) — `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` + `SENTRY_AUTH_TOKEN` env vars in Netlify
- [ ] Run **`db:setup`** to install the booking exclusion constraint and `handle_new_user` trigger
- [ ] Restrict OAuth to **fablab.no** Workspace only (already wired via `hd=fablab.no` param; consider also enforcing server-side via a Supabase RLS check on `auth.users.email`)
- [ ] Configure **Netlify deploy notifications** (Slack / email) so you know when prod builds fail
- [ ] Switch from `db:push` workflow to `db:generate` + `db:migrate` (proper version-controlled migrations)
- [ ] Add a `robots.txt` blocking indexing (this is staff-only — don't want it in Google)
- [ ] Consider **password rotation** policy for the Supabase `service_role` key (we don't use it currently — only `anon` key — so this is forward-looking)
- [ ] **MVA / VAT setup** — confirm the 25% default is correct for all client types; reduced-rate exemptions for cultural projects may apply

## Sentry setup (runtime error tracking)

5-minute wire-up. Free tier (5K errors/mo, 1 user) is plenty for this app's volume.

1. **Sign up** at [sentry.io](https://sentry.io) → create an organization "fablab-design" → new project "fablab-controller" → platform **Next.js**
2. **Grab the DSN** from Settings → Client Keys (DSN) — looks like `https://abc@o123.ingest.sentry.io/456`
3. **Generate an auth token** at Settings → Account → API → Auth Tokens
   - Scopes: `project:releases` + `project:read` (for source-map upload at build time)
   - Save the token immediately — Sentry only shows it once
4. **Set Netlify env vars** (Site config → Environment variables):

| Key | Value | Scopes |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | the DSN | All |
| `SENTRY_DSN` | the same DSN | Builds + Functions |
| `SENTRY_AUTH_TOKEN` | the auth token | Builds only (not Functions — never exposed) |
| `SENTRY_ORG` | `fablab-design` | Builds |
| `SENTRY_PROJECT` | `fablab-controller` | Builds |

5. **Trigger a redeploy** — `git commit --allow-empty -m "Enable Sentry" && git push`. Watch the build log; you should see `[sentry-cli] Uploaded source maps successfully` near the end.
6. **Smoke test** — visit a page that throws, or call `Sentry.captureMessage('test from prod')` from a server action. Check the Sentry dashboard within ~1min.

### What Sentry catches

- Unhandled errors in **Server Components** (rendering failures)
- Unhandled errors in **Server Actions** (the highest-stakes — they mutate data: PO issuance, scope approval, lead conversion)
- Unhandled errors in **Route Handlers** (`/auth/callback`)
- Unhandled errors in **Middleware** (Supabase session refresh, route guards)
- Unhandled errors + promise rejections in **Client Components**
- React Server Component request errors via `onRequestError` (without this, RSC errors get silently swallowed in production — really nasty)

### What's deliberately off (to stay in free tier)

- Performance tracing (`tracesSampleRate: 0`) — Sentry's APM. Free tier limit is 10K performance units; we'd burn through it fast.
- Session replay — useful but data-heavy
- Profiling — same reasoning

These can be enabled later via the config files at `sentry.{client,server,edge}.config.ts` if needed.

### Source maps

The Sentry plugin uploads source maps to Sentry at build time (only when `SENTRY_AUTH_TOKEN` is set). The `hideSourceMaps: true` flag hides them from public web access — stack traces in Sentry's dashboard get the original TypeScript line numbers, but a curious user opening DevTools doesn't see them.

### Ad-blocker bypass

Sentry's `tunnelRoute: '/monitoring'` proxies Sentry traffic through your own domain so ad-blockers don't drop errors. The Controller adds a `/monitoring/*` route that forwards to Sentry's ingest endpoint.

## Cost projection on Netlify + Supabase

Per [05-cost-and-token-strategy.md](../05-cost-and-token-strategy.md):
- **Netlify Starter** (free) covers staff-only traffic comfortably (100 GB bandwidth/mo, 125k function invocations/mo)
- **Supabase Free** covers the v1 data volume (500 MB DB, 1 GB storage, 50k MAU)
- **Combined v1: $0/mo** — well within both free tiers for a single design firm's project load

Upgrade triggers:
- Function invocations > 125k/mo → Netlify Pro $19/mo
- DB > 500 MB (likely from accumulated audit logs) → Supabase Pro $25/mo

## CI/CD on Netlify

Each `git push` to `main` triggers a production deploy. Each PR triggers a deploy preview with its own URL and (if you set it up) its own Supabase branch.

Recommended Git workflow:
- Feature branches off `main`
- PRs auto-deploy to preview URLs
- Squash-merge into `main` for clean history
- `main` → auto-deploys to production

### GitHub Actions — type check + lint + build on PRs

A workflow at `.github/workflows/ci.yml` runs three jobs in parallel on every PR and push to `main`:

1. **Type check** — `npx tsc --noEmit`. Catches every TypeScript error before merge.
2. **Lint** — `npm run lint`. Next.js + React + a11y rules.
3. **Build** — `npm run build`. Proves the app compiles end-to-end; catches RSC compile errors and bundler issues that lint/typecheck miss.

All three run on Node 22 with `--legacy-peer-deps` (matching Netlify). They run independently — one failure doesn't cancel the others, so you see every signal on one PR.

**Repo layout note:** the workflow file lives at `app/.github/workflows/ci.yml`.
- If `app/` is your repo root → workflow already in the right place ✓
- If your repo root has the design docs at top level and `app/` is a subfolder → move `app/.github/` to the repo root, and add `defaults: { run: { working-directory: app } }` at the top of `ci.yml` so commands run inside the subfolder

**Speed:** ~90s for type-check + lint with npm cache warm, ~3min for build. Total round-trip < 5 minutes for the longest job. Concurrency cancels in-flight runs when a new commit lands on the same branch.

**Required checks before merge** — recommended once you have a collaborator:
- GitHub → repo Settings → Branches → branch protection rule on `main`
- Require status checks: `Type check`, `Lint`, `Build`
- Optionally require a PR review

### Netlify build vs GitHub Actions

The Netlify build and the GitHub Actions build both compile the app — duplicate work? Slightly, but useful:
- GitHub Actions = PR signal *before* merge. Stops broken code reaching `main`.
- Netlify build = production deploy after merge. Has real env vars + connects to prod Supabase for any build-time queries.

Together they form a typical safety net: PRs get type-check + lint + build feedback in ~5min; merging to `main` then triggers the production deploy with the same code that already passed CI.

## Rollback

Netlify keeps every successful deploy. **Deploys → click any prior deploy → Publish deploy.** Instant rollback, no rebuild.

If you need to roll back the database too, restore from Supabase point-in-time backup (Pro tier required for granular restore; Free tier has daily snapshots).
