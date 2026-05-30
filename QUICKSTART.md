# Local Run — Quickstart

Get the Fablab Controller running on your Mac in ~15 minutes.

## 0. Prerequisites

```bash
node --version    # need 20+ (you'll have it if you've used modern Next.js)
npm --version
```

If `node` is missing: `brew install node@22`

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) (free tier is fine)
2. **New project** → name "fablab-controller" → region **`eu-central-1`** (Frankfurt — closest to Norway)
3. Pick a strong database password and **save it** — you'll need it in step 3
4. Wait ~2 minutes for the project to provision

## 2. Grab the three connection values

From your Supabase project dashboard:

- **Settings → API:**
  - `Project URL` → goes in `NEXT_PUBLIC_SUPABASE_URL`
  - `anon` `public` key → goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Settings → Database → Connection string:**
  - Toggle to **URI** mode
  - Choose **Transaction pooler** (port 6543) — this is what we need for serverless functions
  - Copy the URL → goes in `DATABASE_URL`
  - Replace `[YOUR-PASSWORD]` with your actual DB password

## 3. Configure Google Workspace OAuth

1. **In Supabase** → Authentication → Providers → enable **Google**
   - Leave the Client ID + Secret blank for now
2. **In Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):
   - New project → "Fablab Controller" (or reuse an existing one)
   - APIs & Services → Credentials → **Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Authorised JavaScript origins: `http://localhost:3000`
   - Authorised redirect URIs: paste the **Callback URL** Supabase showed you in step 1 (looks like `https://YOUR-PROJECT.supabase.co/auth/v1/callback`)
   - Save → copy the **Client ID** and **Client Secret**
3. **Back in Supabase** → Google provider → paste Client ID + Client Secret → Save
4. **Supabase → Authentication → URL Configuration** → set Site URL to `http://localhost:3000`

## 4. Wire up the local app

```bash
cd "Fablab Design Project controller/app"
cp .env.local.example .env.local
```

Edit `.env.local` with the three values from step 2. It should look like:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
DATABASE_URL=postgresql://postgres.abcdefghijklmn:YOUR_DB_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

## 5. Install, migrate, seed, run

```bash
npm install              # ~30s, may show React 19 RC peer warnings — safe to ignore
npm run db:push          # creates all v0.8 tables in Supabase
npm run db:seed          # inserts sample project + leads + RFQ + approval + invoices
npm run dev              # → http://localhost:3000
```

Open `http://localhost:3000` → you'll be redirected to `/login` → click **Continue with Google** → sign in with your fablab.no account → land on the Dashboard.

## 6. Walk the demo path

1. **Sidebar → Leads** — see the 4 seeded leads at varying intake completeness. Click LEAD-2026-0058 (Bjørvika Restaurant Group, 11/19) → fill the missing fields → watch the meter turn green → click **Convert to project**
2. **Sidebar → Projects → FD-2026-0142** (Tromsø) — the seeded project. Top of page: role banner ("Procurement and Resale"), 7-stage flow, tab bar
3. **Approvals tab** → APPR-0142-0001 (sent) → click **Log client response** → pick Approved → save. The Scope baseline v1 auto-promotes to `approved` (Rule R2 unblocked)
4. **Packages tab** → "+ New package" → "Gallery lighting" → category. Then on the package → "+ New item" → Erco Parscan, 24 each, sourced
5. **RFQs tab** → "+ New RFQ" → pick the item, invite a vendor (first add one at **Sidebar → Vendors → + New vendor**). Save → Send → record a quote → select winner
6. **POs tab** → "+ New PO" → pick that vendor → Create draft. PO detail will refuse to issue with *"Issuance blocked by Rule R3"* until the item has an approved Approval. Request the approval, mark it approved → return to PO → **Issue**. PO becomes BINDING; finance tab gets a billing-trigger notification proposing the invoice
7. **Finance tab** → see the trigger fire, log the Poweroffice invoice number, record payment

## Troubleshooting

**"Cannot find name 'X'" TypeScript errors after install** — run `npm install` again; some package metadata can race the first time

**"Connection refused" on db:push** — your `DATABASE_URL` is wrong. Common issue: forgot to replace `[YOUR-PASSWORD]`. Less common: using the direct connection (port 5432) instead of the transaction pooler (port 6543) — we need 6543

**OAuth redirect mismatch** — the redirect URI in Google Cloud Console must exactly match the one Supabase shows. Copy-paste, don't retype

**"Sign in error: Access denied"** — `hd=fablab.no` constraint is rejecting your account. Either sign in with a fablab.no Google account, or temporarily comment out the `hd` parameter in `src/app/login/page.tsx` while testing with a personal account

**Drizzle migration warnings about exclusion constraints** — the `bookings` exclusion constraint (Postgres GIST) needs a raw SQL hand-off; if `db:push` doesn't handle it, run this in the Supabase SQL editor:
```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    equipment_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('scheduled', 'in_progress'));
```

**`handle_new_user` trigger not created** — the `auth.users` → `public.users` row sync isn't wired. Quick fix: after first sign-in, run this in Supabase SQL editor:
```sql
INSERT INTO public.users (id, email, name, roles, language_pref)
SELECT id, email,
  COALESCE(raw_user_meta_data->>'full_name', email),
  ARRAY['project_lead']::text[],
  'no'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users);
```
Productionise this as a Postgres trigger when the user-management UI lands.

## Known caveats (not blocking)

- React 19 RC peer warnings during npm install — harmless, ignored
- The first-load of any page might be slow (Next dev server cold-start with full Drizzle schema is ~3s)
- Norwegian translations are mostly DeepL-quality — domain reviewer needed for legal phrasing in approval banners, RFQ disclaimers, PO binding language
- No tests yet — running through the demo path manually is your test suite for now
- The Poweroffice integration is currently manual entry. See `POWEROFFICE-INTEGRATION.md` for the v2 plan.

## When things work

You should see:
- Dashboard renders with project + item counts from your seeded DB
- Sidebar Leads badge shows 4
- The bilingual EN/NO toggle in the top-right switches every visible string in place, instantly
- All 22 §22 control questions are queryable for the seeded Tromsø Museum project

If anything specific breaks: copy the error and the URL you were on, and I'll fix it.
