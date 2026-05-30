# Fablab Design Controller — App

The working code for the Fablab Design project controller, scaffolded from the
data model and wireframes in the parent folder.

## What's in this slice

This is the first end-to-end slice — auth, i18n, database, and four screens
wired together. The full data model (v0.8 / Wave 4) is in `src/db/schema.ts`
even though most entities don't have screens yet.

**Working today**
- Supabase Auth with Google Workspace SSO (domain-restricted to `fablab.no`)
- Bilingual EN/NO toggle on every screen, cookie-persisted
- Drizzle ORM with the complete v0.8 schema (every entity from Waves 1–4)
- Login, Dashboard, Projects list, Project detail (Brief tab) — all reading from Supabase
- App shell: sidebar nav, header, role banner, 7-stage flow visual

**Coming next** (layered, in build-order from `04-tech-stack.md`)
- Lead intake → Project creation flow (Wave 1)
- Procurement workflow: RFQ → Quote → PO (Waves 1–2)
- Finance: Invoice + Payment + BillingTrigger (Wave 2)
- Risk + Change + Issue + Decision (Wave 3)
- Shipment + LessonsLearned + Templates (Wave 4)
- The §18 agent modules (LLM-assist layered on the structured data)

## Stack

- **Framework**: Next.js 15 (App Router, RSC, TypeScript strict)
- **Data spine**: Supabase — Postgres + Auth + Storage + Realtime
- **ORM**: Drizzle with `drizzle-kit` for migrations
- **i18n**: `next-intl` with cookie-based locale (no URL prefix — staff-only tool)
- **UI**: Tailwind v3 with custom design tokens matching the wireframe palette
- **Hosting target**: Netlify (configured but not deployed yet)

See `../04-tech-stack.md` and `../05-cost-and-token-strategy.md` for the full
rationale and free-tier cost analysis.

## Setup — first time

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) → create a new project in the **`eu-central-1`** region (Norway latency)
2. From **Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. From **Settings → Database → Connection string** (URI mode, **port 6543** for the transaction pooler), copy → `DATABASE_URL`

### 2. Configure Google Workspace OAuth

1. In Supabase → **Authentication → Providers → Google** → enable
2. In **Google Cloud Console** → create OAuth Client ID:
   - Type: Web application
   - Authorised redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
3. Paste Client ID + Client Secret back into Supabase
4. In Supabase → **Authentication → URL Configuration** → set Site URL to `http://localhost:3000` (and your prod URL when deployed)

> The domain restriction `hd=fablab.no` is enforced client-side (see `src/app/login/page.tsx`). For full server-side enforcement, add a Supabase Edge Function or RLS check on `auth.users.email`.

### 3. Local env

```bash
cp .env.local.example .env.local
# Then edit .env.local with the three values from step 1
```

### 4. Install + migrate + seed

```bash
npm install
npm run db:push       # creates all tables in Supabase
npm run db:seed       # inserts a sample project so screens have data
npm run dev           # http://localhost:3000
```

Sign in with a `fablab.no` Google account, you land on the Dashboard.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | Next.js linter |
| `npm run db:generate` | Generate migration SQL from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema directly to DB (dev only — skips migration history) |
| `npm run db:studio` | Open Drizzle Studio (visual DB inspector) |
| `npm run db:seed` | Reset + insert sample data |

## File layout

```
src/
├── app/
│   ├── layout.tsx              Root layout with i18n provider
│   ├── page.tsx                Redirects → /dashboard
│   ├── globals.css             Tailwind base + design tokens
│   ├── login/page.tsx          Google SSO sign-in
│   ├── auth/callback/route.ts  OAuth callback handler
│   └── (app)/                  Authenticated routes
│       ├── layout.tsx          App shell (sidebar + header)
│       ├── dashboard/page.tsx
│       └── projects/
│           ├── page.tsx        List
│           └── [id]/page.tsx   Detail (Brief tab)
├── components/
│   ├── header.tsx              Top bar with lang toggle
│   ├── sidebar.tsx             Nav (Work / Catalogue / Admin)
│   ├── lang-toggle.tsx         EN/NO switcher
│   ├── role-banner.tsx         Fablab Role Profile warning (Wave 1)
│   └── stage-flow.tsx          7-stage project lifecycle visual
├── db/
│   ├── schema.ts               ★ THE CANONICAL DATA MODEL — every v0.8 entity
│   ├── index.ts                Drizzle client
│   ├── seed.ts                 Sample data
│   └── migrations/             Generated SQL (gitignored meta/)
├── lib/
│   ├── supabase/               Browser/server/middleware Supabase clients
│   ├── i18n.ts                 next-intl request config
│   └── utils.ts                Money + date formatters, class joiner
└── middleware.ts               Combined Supabase auth + route guard
```

## How the bilingual toggle works

`next-intl` reads the user's locale from the `locale` cookie (set by the
`<LangToggle />` component). The cookie is `samesite=lax`, persists for 1 year.
On toggle, `router.refresh()` re-renders the page with the alternate message
bundle — no page reload, no flash.

Strings live in `messages/en.json` and `messages/no.json`. For UI strings
that change rarely, ship them as JSON. The DB-backed `translations` table
(in the schema) is for strings that need in-app editing without a deploy —
wire that up when the translation review screen lands.

> The default locale is **`no`** — Fablab is Norwegian by default per `03-bilingual-pattern.md`.

## How auth works

1. User lands on `/login`
2. Clicks Continue with Google → Supabase OAuth → Google consent
3. Google redirects to `/auth/callback?code=…`
4. The route handler exchanges the code for a session, sets the auth cookie
5. Middleware (`src/middleware.ts`) protects all routes except `/login` and `/auth/callback`
6. On every request, `updateSession` refreshes the access token if needed

The `users` table mirrors Supabase's `auth.users` via shared UUID. App-level
fields (`roles[]`, `language_pref`, `active`) live in `public.users`. A row
should be created automatically on first sign-in via a trigger or in your
auth callback — not yet wired here; add a `handle_new_user` trigger in
Supabase or extend the callback.

## Build order (incremental waves)

1. **Spine (this slice)** — auth, i18n, project list, project detail
2. **Wave 1 logic** — Lead intake gate, Approval flow, Scope tab
3. **Procurement** — RFQ builder, Quote comparison, PO issuance
4. **Finance** — Invoice + Payment, BillingTrigger automation
5. **Risk & change** — ChangeOrder, RiskItem, Issue, Decision, DefectClaim
6. **Polish** — Room/Shipment/LessonsLearned/DocumentTemplate, TimeEntry categories
7. **AI assist** — §18 agent modules on top of the structured data

Each wave is functionally usable on its own. The data model already supports
every wave — only the screens layer in incrementally.

## What's NOT yet wired (known)

- Auto-creating `public.users` row on first Supabase sign-in (add trigger)
- Server actions for mutations (project create, item edit, etc.)
- Sentry integration (error tracking)
- DeepL pipeline (Norwegian MT for the translations table)
- Realtime subscriptions (for live dashboard updates and booking calendar)
- Tests (Vitest + Playwright)
- CI (GitHub Actions)

None of these block local dev. Layer them in as the project hardens.

## Reference docs (in the parent folder)

- `00-industry-best-practices.md` — canonical reference, treat as non-negotiable
- `03-bilingual-pattern.md` — i18n implementation details
- `04-tech-stack.md` — stack decisions + trade-offs
- `05-cost-and-token-strategy.md` — keep monthly costs near zero
- `16-data-model-v6.md` — the data model (v0.8, feature-complete)
- `10-wireframes-v2.html` — the visual reference
