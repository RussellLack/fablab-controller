# Go-Live Runbook — `controller.fablabdesign.com`

The day-of execution doc. Eight steps, ~90–120 minutes wall-clock including waits, ~65 minutes of active work. Top to bottom — don't skip ahead.

For background context on any step, see the deeper [`DEPLOY-NETLIFY.md`](./DEPLOY-NETLIFY.md). This doc is the action list.

## Before you start — pre-flight

You should have ready to hand:
- [ ] A GitHub account
- [ ] A Netlify account (sign up at netlify.com if you don't — free)
- [ ] A Supabase account with the dev project you've been testing against (or a fresh prod project — see below)
- [ ] A Google Cloud Console account with the OAuth Client ID set up
- [ ] Login for **ProISP** (proisp.no, where fablabdesign.com is hosted)
- [ ] Local copy of the `app/` folder, working, can `npm run dev` successfully

**Production vs dev Supabase** — short version: you can launch with the dev Supabase project, but you should split before any real client data lands. Easiest path: launch on dev, validate everything works, then create a prod Supabase later and migrate (Supabase has a project-clone feature on paid tiers). For this runbook, assume you're using the same Supabase project you've been developing against.

---

## Step 1 — Push the `app/` codebase to GitHub (~10 min)

**Why:** Netlify deploys from a Git repo. No GitHub, no deploy.

**Do:**

1. Open a terminal and `cd` into the app folder:
   ```bash
   cd "/Users/russell/Documents/Claude/Projects/Fablab Design Project controller/app"
   ```
2. Initialise git (if you haven't):
   ```bash
   git init
   git add .
   git commit -m "Initial commit — Fablab Controller v0.1"
   ```
3. Go to [github.com/new](https://github.com/new) → create a **private** repo:
   - Name: `fablab-controller`
   - Visibility: **Private** (this is staff-only, not open source)
   - Don't add a README, .gitignore, or license (we have them)
4. Back in the terminal, copy the commands GitHub shows for "existing repository":
   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/fablab-controller.git
   git branch -M main
   git push -u origin main
   ```

**Expected outcome:** GitHub page refreshes to show your code. You see `package.json`, `netlify.toml`, `src/`, etc.

**Verify before continuing:**
- [ ] Repo is private
- [ ] `.env.local` is NOT pushed (check `.gitignore` did its job — your env secrets must not be in the repo)
- [ ] You can see `netlify.toml` at the root of the repo

**Gotchas:**
- **SSH key not set up?** Use the HTTPS URL instead (`https://github.com/...`) — GitHub will prompt you to log in via browser
- **`.env.local` ended up in the repo?** Stop, run `git rm --cached .env.local && git commit -m "Remove env"`. If you've already pushed it, also rotate the Supabase keys (they're now compromised)
- **The repo root contains the design docs too?** That's fine — Netlify will use `app/` as the base directory (step 2 below)

---

## Step 2 — Connect Netlify, set env vars, first deploy (~20 min)

**Why:** Get the site live on a netlify.app URL first, then attach the custom domain in step 3. Don't try to do both at once.

**Do:**

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. **Choose Git provider** → GitHub → authorise Netlify → pick `fablab-controller` repo
3. **Configure build settings:**
   - **Branch to deploy:** `main`
   - **Base directory:** `app` (only if your repo root contains the design docs at top level; leave blank if you pushed only `app/`)
   - **Build command:** auto-detected as `npm run build` from netlify.toml — leave it
   - **Publish directory:** auto-detected — leave it
4. Click **Deploy site** — Netlify will start building. **It will fail** on this first build (missing env vars) — that's fine.
5. While it builds (or after it fails), go to **Site configuration → Environment variables → Add a variable** and add these:

   | Key | Value | Scopes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase Settings → API | All |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase Settings → API (anon, not service_role) | All |
   | `DATABASE_URL` | from Supabase Settings → Database → Connection string (URI, **port 6543**) | Builds + Functions |

   Sentry env vars are optional at this point — you can add them after smoke testing.

6. **Trigger a fresh deploy:** Deploys → **Trigger deploy** → **Clear cache and deploy site**
7. Watch the build log. Should complete in 3–5 minutes.

**Expected outcome:** Build succeeds. Netlify shows you a URL like `something-narwhal-abc123.netlify.app`. Click it — you should be redirected to `/login`.

**Verify before continuing:**
- [ ] Build log shows `Build script success`
- [ ] Visiting the netlify.app URL loads the login page (not a 500 error)
- [ ] Browser dev tools network tab shows no obvious errors on page load

**Gotchas:**
- **Build fails with `Module not found: @netlify/plugin-nextjs`** — usually auto-injected by Netlify, but if not: in `package.json` add `"@netlify/plugin-nextjs": "^5.7.0"` to `devDependencies`, push, retry
- **Build fails with peer-dep errors** — confirm `netlify.toml` has `NPM_FLAGS = "--legacy-peer-deps"` in `[build.environment]`
- **Login page loads but Continue with Google does nothing** — that's expected at this stage; Supabase isn't configured to know about this netlify.app URL yet. We fix that after step 3
- **DATABASE_URL connection refused** — likely using port 5432 (direct) instead of 6543 (pooler). Check Supabase → Settings → Database → use "Transaction pooler" mode

---

## Step 3 — Add `controller.fablabdesign.com` in Netlify, CNAME at ProISP (~15 min)

**Why:** Reserve the domain in Netlify first so Netlify knows what CNAME to expect, then create the CNAME at ProISP.

### 3a. Reserve the domain in Netlify (~3 min)

1. Netlify → your site → **Site configuration → Domain management → Add a domain**
2. Enter `controller.fablabdesign.com` → **Verify**
3. Netlify will likely say it can't find DNS records — that's expected. Click **Yes, add domain**
4. Netlify will show you a CNAME target — usually `your-site-name.netlify.app`. **Copy this exact value**, you'll need it for ProISP.

### 3b. Add the CNAME at ProISP (~10 min)

1. Log in at [proisp.no](https://proisp.no) → customer area (Kundeområde)
2. Find your domain list → click `fablabdesign.com`
3. Navigate to **DNS-behandling** (or "DNS Records" / "DNS-innstillinger" depending on the panel version)
4. **Add a new record:**
   - Type: **CNAME**
   - Name (Hostnavn): **`controller`** — just the subdomain part, ProISP auto-appends `.fablabdesign.com`
   - Value (Target): the Netlify target you copied (e.g. `your-site-name.netlify.app`)
   - TTL: **300** (5 min)
5. Save. Some ProISP panel versions have a **"publish changes"** button at the bottom of the DNS view — easy to miss; check before navigating away.

**Don't touch:** the existing A/CNAME for `fablabdesign.com` (marketing site), MX records (email), TXT records (SPF/DKIM), NS records. You're only adding the new `controller` CNAME.

**Expected outcome:** ProISP shows the new CNAME in the records list. Netlify says *"Awaiting DNS propagation"*.

**Verify before continuing:**
- [ ] The CNAME record exists in ProISP with Name = `controller` (not `controller.fablabdesign.com`)
- [ ] The Value matches exactly what Netlify gave you
- [ ] No existing records were modified

**Gotchas:**
- **Record shows as `controller.fablabdesign.com.fablabdesign.com` in ProISP** — you double-prefixed. Edit and use just `controller`
- **ProISP rejects the value** — try adding a trailing dot: `your-site-name.netlify.app.`
- **ProISP support** (`support@proisp.no`) replies fast in Norwegian if anything looks off

---

## Step 4 — Wait for DNS + SSL (~5–30 min, mostly waiting)

**Why:** Netlify can't request an SSL certificate until DNS resolves globally. Most of this is just waiting.

**Do:**

1. Open [dnschecker.org](https://dnschecker.org) → enter `controller.fablabdesign.com` → record type **CNAME** → check
2. Wait until you see green checkmarks from most regions (Europe should be fastest from a ProISP origin)
3. Back in Netlify → Site configuration → Domain management → you'll see the status progress from "Awaiting DNS" → "DNS verified" → "HTTPS provisioned"
4. Refresh the Netlify page every few minutes

**Expected outcome:** Netlify domain management view shows:
- Primary domain: `controller.fablabdesign.com` (or you can change which is primary)
- HTTPS: green check / "Provisioned by Let's Encrypt"

**Verify before continuing:**
- [ ] `controller.fablabdesign.com` resolves globally on dnschecker.org
- [ ] Netlify shows the green HTTPS provisioned status
- [ ] Visit `https://controller.fablabdesign.com` in browser → loads the login page with a valid SSL padlock

**DO NOT proceed to step 5 until SSL is provisioned.** Supabase + the OAuth handshake both require HTTPS.

**Gotchas:**
- **DNS still not propagating after 30 min** — check ProISP that the record was actually saved (some panel versions have a "publish" step you might have missed)
- **SSL stuck at "Provisioning..."** — usually self-resolves in 5 min. If it sticks for 30+ min, click **Renew certificate** in Netlify's domain management
- **"Your connection is not private" / SSL error in browser** — wait longer; certificate hasn't issued yet
- **Mixed content warnings** — none should happen since the app has no hardcoded http:// URLs. If you see them, screenshot the dev tools console and we'll trace

---

## Step 5 — Update Supabase Auth configuration (~5 min)

**Why:** Supabase needs to know which URL is the legitimate origin for auth callbacks. Without this, the OAuth flow will reject the new domain.

**Do:**

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) → your project → **Authentication → URL Configuration**
2. **Site URL** → change from whatever it was (`http://localhost:3000` or the netlify.app URL) to:
   ```
   https://controller.fablabdesign.com
   ```
3. **Redirect URLs** → click **Add URL**, paste:
   ```
   https://controller.fablabdesign.com/**
   ```
   **Keep** the existing entries:
   - `http://localhost:3000/**` (for local dev)
   - The netlify.app URL entry (transition fallback — remove after step 8 succeeds)
4. **Save** at the bottom

**Expected outcome:** Site URL is `https://controller.fablabdesign.com`. Redirect URLs list has both the new domain AND localhost + netlify.app.

**Verify before continuing:**
- [ ] Site URL field shows the new subdomain with `https://`
- [ ] Redirect URLs list contains all three entries (custom + localhost + netlify.app)

**Gotchas:**
- **Don't change Google OAuth Client settings** — the redirect URI there is the Supabase callback (`https://YOUR-PROJECT.supabase.co/auth/v1/callback`), which doesn't depend on your app domain
- **Forgot the wildcard `/**` on the redirect URL?** Auth will reject post-login redirects. Add the suffix

---

## Step 6 — Set `NEXT_PUBLIC_APP_URL` in Netlify (~2 min)

**Why:** Server actions check the request origin against `allowedOrigins` in `next.config.mjs`. This env var tells Next.js the production origin is legitimate.

**Do:**

1. Netlify → Site configuration → Environment variables → **Add a variable**
2. Key: `NEXT_PUBLIC_APP_URL`
3. Value: `https://controller.fablabdesign.com`
4. Scopes: **All** (Builds + Functions + Runtime)
5. Save

**Expected outcome:** Environment variables list now includes `NEXT_PUBLIC_APP_URL`.

**Verify before continuing:**
- [ ] The value has `https://` prefix (not just `controller.fablabdesign.com`)
- [ ] Scoped to All

---

## Step 7 — Trigger a redeploy (~5 min)

**Why:** Env vars only apply to new builds. The current deploy doesn't know about `NEXT_PUBLIC_APP_URL` yet.

**Do:**

Either of:

**a) Push an empty commit:**
```bash
cd "/Users/russell/Documents/Claude/Projects/Fablab Design Project controller/app"
git commit --allow-empty -m "Redeploy for custom domain"
git push
```

**b) Trigger from Netlify UI:**
- Deploys → **Trigger deploy** → **Clear cache and deploy site**

Watch the build log. ~3–5 min.

**Expected outcome:** New build succeeds. Site at `https://controller.fablabdesign.com` reloads with the new build.

**Verify before continuing:**
- [ ] Build log shows green "Site is live ✨"
- [ ] `https://controller.fablabdesign.com` loads (might show old content briefly — hard refresh with Cmd+Shift+R if needed)

**Gotchas:**
- **Build fails with "Cannot find module"** — Netlify cache occasionally goes stale. The "Clear cache and deploy site" option fixes 90% of these
- **Build succeeds but new domain still shows old behaviour** — Cmd+Shift+R to hard refresh, or open in incognito

---

## Step 8 — Smoke test (~10 min)

**Why:** Confirm everything works end-to-end before declaring victory.

**Do:**

1. Open `https://controller.fablabdesign.com` in a fresh browser window (not the one you've been testing in — cached state will mask issues)
2. Should redirect to `/login`
3. Click **Continue with Google**
4. Pick a **fablab.no** Google account (or whichever test account you've allowed)
5. Should redirect back to `/dashboard`
6. **Test the bilingual toggle** — click EN, then NO; UI strings should switch in place
7. **Walk the demo path:**
   - Sidebar → Leads → click into a seeded lead → fill missing fields → Convert to project → land on Project detail
   - Project detail → Approvals tab → log the seeded approval as Approved → check the scope baseline tab now shows v1 as approved
   - Project detail → Packages tab → add a package + item
   - Sidebar → Finance → cross-project receivables visible
8. **Sign out** (or close incognito) to confirm middleware redirects unauthenticated requests to /login

**Expected outcome:** The full Wave 1+2 chain works on the production domain. The bilingual toggle is responsive. Sign-in is smooth.

**Verify on completion:**
- [ ] Sign-in via Google works on the new domain
- [ ] Dashboard loads with real data from your Supabase
- [ ] EN/NO toggle switches instantly
- [ ] You can navigate Leads → Project conversion successfully
- [ ] Sign-out + revisit redirects to /login

**Gotchas:**
- **"Access denied" after Google sign-in** — the `hd=fablab.no` parameter is restricting to fablab.no accounts. Use a fablab.no account, or temporarily comment out the `hd` parameter in `src/app/login/page.tsx`
- **Sign-in succeeds but dashboard fails with 500** — `handle_new_user` trigger may not have created your `public.users` row. From Supabase SQL editor, run the one-line backfill from `QUICKSTART.md` troubleshooting section
- **"Server actions origin not allowed"** — `NEXT_PUBLIC_APP_URL` wasn't set, or the redeploy didn't pick it up. Verify env var, trigger another redeploy
- **EN/NO toggle does nothing** — hard refresh; if it persists, check the browser console for hydration errors

---

## Cleanup after success

Once steps 1–8 are all green:

1. **Remove the netlify.app URL** from Supabase Authentication → URL Configuration → Redirect URLs (keep localhost for local dev)
2. **Optionally hide the netlify.app URL** in Netlify → Domain management → set `controller.fablabdesign.com` as primary, mark netlify.app as alias
3. **Add Sentry env vars** if not done already (see DEPLOY-NETLIFY.md §Sentry setup)
4. **Set up Netlify deploy notifications** → Site config → Build & deploy → Deploy notifications → email or Slack on failure

## If something breaks mid-runbook

| Symptom | Recovery |
|---|---|
| DNS won't propagate | Verify the CNAME at ProISP; some panels require a publish step. Wait 1hr before troubleshooting further. |
| SSL won't provision | Netlify domain → Renew certificate. Make sure DNS is fully propagated first. |
| Build fails after env var change | Trigger another deploy with **Clear cache and deploy site**. |
| Sign-in works locally but not on subdomain | Almost always either: (a) Site URL in Supabase not updated, (b) `controller.fablabdesign.com/**` not in Redirect URLs, (c) `NEXT_PUBLIC_APP_URL` env var not set in Netlify. Check all three. |
| Something else | Email me the screenshot + Netlify function log; I'll trace. |

## Roll back

If you need to revert the whole thing:
1. Netlify → Deploys → click the prior deploy → **Publish deploy** (instant rollback to that build)
2. Or remove the custom domain from Netlify (site goes back to netlify.app URL exclusively)
3. The DNS record at ProISP can stay — harmless if Netlify isn't claiming the domain anymore

## Total expected time

| Step | Active | Wait |
|---|---|---|
| 1. GitHub push | 10 min | — |
| 2. Netlify connect + env vars | 15 min | 5 min build |
| 3. Domain + CNAME at ProISP | 13 min | — |
| 4. DNS + SSL propagation | 2 min | 5–30 min |
| 5. Supabase config | 5 min | — |
| 6. Netlify env var | 2 min | — |
| 7. Redeploy | 1 min | 5 min build |
| 8. Smoke test | 10 min | — |
| **Total** | **~58 min** | **~15–40 min** |

**Wall-clock end-to-end: ~75–100 min.** Block out 2 hours, do it in one sitting, you'll have time to spare.
