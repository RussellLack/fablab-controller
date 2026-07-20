# Public intake endpoint — operational notes

`/api/public/intake` on the controller receives leads from the marketing
site's `/api/onboarding` forwarder. This doc is the operator's reference
for the shipped pipeline: request contract, environment, and things that
tend to catch you out.

- **Controller**: `RussellLack/fablab-controller` → `controller.fablabdesign.com`
- **Marketing**: `RussellLack/fablab-design` → `fablabdesign.com`
- **Database**: Supabase project `syrxllhzollftyvlhtqf`

## How it flows

```
Browser form on fablabdesign.com
  ↓ POST JSON
/api/onboarding (marketing, Next.js API route)
  ├─ validates required fields, email regex, honeypot (company_website)
  └─ ↓ POST JSON + x-intake-secret header (server-to-server)
     /api/public/intake (controller, Next.js API route)
       ├─ auth: x-intake-secret matches INTAKE_SHARED_SECRET
       ├─ validates body via leadDraftSchema (zod)
       ├─ generates LEAD-YYYY-NNNN reference
       └─ inserts into Supabase `leads` table with source='website'
```

Middleware exempts `/api/public/*` on the controller from the Supabase
auth round-trip, so the endpoint is reachable without a session cookie.

## Request contract (controller `/api/public/intake`)

Headers: `content-type: application/json`, `x-intake-secret: <secret>`.

Body: JSON object, all fields **optional** and **camelCase**. Must
include at least one of `prospectiveClientName`, `primaryContactEmail`,
or `desiredOutcome` (else 400 `Empty intake`).

Accepted fields:

`prospectiveClientName, clientKind, primaryContactName, primaryContactEmail,
primaryContactPhone, propertyAddress, projectType, roomsOrZones,
desiredOutcome, budgetExpectation, budgetCurrency, timelineExpectation,
decisionMakers, approvalProcess, existingSuppliers, knownConstraints,
designStylePreferences, procurementExpectations,
deliveryInstallExpectations, fablabExpectedRole, source, notes`.

Constrained enums:

- `clientKind`: `individual | business | public_sector | cultural_institution | hospitality_group`
- `projectType`: `residential | commercial | hospitality | retail | workplace | cultural | mixed`
- `budgetCurrency`: `NOK | EUR | USD | GBP | SEK | DKK` (default `NOK`)
- `fablabExpectedRole`: `design_advisory_only | design_and_specification | procurement_support | procurement_and_resale | supplier_coordination | delivery_coordination | installation_coordination | full_project_control`
- `source`: `referral | direct_inquiry | repeat_client | partner | website | other` — the route hard-codes `website`; sending it is a no-op.

Loose:

- `budgetExpectation`: number or numeric string. Stored as `numeric(14,2)`.
- `primaryContactEmail`: must parse as an email if present; empty string allowed.

Responses:

- `200 { ok: true, id, reference }` — reference is `LEAD-YYYY-NNNN`.
- `400 { ok: false, error: "Invalid JSON" | "Invalid input", fieldErrors? | "Empty intake" }`
- `401 { ok: false, error: "Unauthorised" }`
- `500 { ok: false, error: "Insert failed" | "Could not save intake" }` — usually means the DB is unreachable.
- `503 { ok: false, error: "Intake not configured" }` — `INTAKE_SHARED_SECRET` unset.

## Marketing forwarder contract (`/api/onboarding`)

Wraps the controller with stricter input handling:

- Whitelists a subset of `ALLOWED_FIELDS` (all controller fields except `source`).
- Requires `prospectiveClientName, clientKind, primaryContactName, primaryContactEmail, projectType, desiredOutcome`.
- Rejects invalid emails at the forwarder (400).
- **Honeypot**: `company_website` — if a bot fills it, returns `200 { ok: true }` and forwards nothing.
- Returns `200 { ok: true, reference }` on success (just the reference, not the full controller response).
- 502 on upstream network failure or non-2xx from controller.
- 503 if either `FABLAB_CONTROLLER_INTAKE_URL` or `FABLAB_CONTROLLER_INTAKE_SECRET` is unset.

## Environment variables

Names differ between the two projects on purpose — each project owns its
own naming. The **secret value is the same** across both.

### Controller (Netlify project `fablab-controller`)

| Key | Contexts | Scopes | Secret | Notes |
|---|---|---|---|---|
| `INTAKE_SHARED_SECRET` | deploy-preview, production | functions, runtime | yes | Value stored only in Netlify + your password manager. Not in this repo. |
| `DATABASE_URL` | all | builds, functions, post_processing, runtime | no | Supabase pooler URL. |
| Standard: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`, `NODE_VERSION` | | | Dashboard auth. |

### Marketing (Netlify project `fablabdesign`)

| Key | Contexts | Scopes | Secret | Notes |
|---|---|---|---|---|
| `FABLAB_CONTROLLER_INTAKE_URL` | deploy-preview, production | functions, runtime | no | `https://controller.fablabdesign.com/api/public/intake` |
| `FABLAB_CONTROLLER_INTAKE_SECRET` | deploy-preview, production | functions, runtime | yes | Must match controller's `INTAKE_SHARED_SECRET` value. |

**Preview isolation caveat**: `FABLAB_CONTROLLER_INTAKE_URL` for the
`deploy-preview` context points at **production** controller.
Submissions from marketing-site Deploy Previews therefore land in the
production DB. If you want per-preview isolation, either
(a) point marketing preview at a specific controller preview URL for the
duration of that PR, or (b) accept it and clean up test rows after.

## Env-var change gotcha

Netlify's Next.js runtime bakes non-`NEXT_PUBLIC_*` env vars into the
function bundle **at build time**. Setting or renaming a var doesn't
take effect until the site rebuilds. If you set an env var and the
endpoint still returns 503, trigger a rebuild:

- push any commit (empty `--allow-empty` is fine), or
- click "Trigger deploy" in the Netlify UI.

## Supabase auto-pause

The `syrxllhzollftyvlhtqf` project (fablab-controller DB) auto-pauses on
inactivity. Symptoms: intake returns `500 Could not save intake`,
dashboard is unreachable, `execute_sql` times out. Fix: restore via the
Supabase console or MCP (`restore_project`) — takes ~2 min. During this
session the project was restored once from an `INACTIVE` state; the
dashboard was down for the whole pause window.

## Smoke tests

Once secrets are set and both sites are deployed, these all pass on prod.
The direct-controller tests need the secret; you can find its
fingerprint (last 4 chars: `d6b8` at time of writing) in the Netlify
`is_secret: true` readback but the full value only lives in the password
manager.

```bash
# End-to-end via marketing forwarder → controller → DB.
curl -X POST https://fablabdesign.com/api/onboarding \
  -H "content-type: application/json" \
  -d '{
    "prospectiveClientName":"Smoke Test AS",
    "clientKind":"business",
    "primaryContactName":"Smoke Person",
    "primaryContactEmail":"smoke@example.com",
    "projectType":"hospitality",
    "desiredOutcome":"Smoke test — delete me"
  }'
# → 200 { ok: true, reference: "LEAD-YYYY-NNNN" }

# Honeypot — returns 200 but no row written.
curl -X POST https://fablabdesign.com/api/onboarding \
  -H "content-type: application/json" \
  -d '{"prospectiveClientName":"Bot",...,"company_website":"http://bot"}'
# → 200 { ok: true }, no controller row.

# Missing required fields.
curl -X POST https://fablabdesign.com/api/onboarding \
  -H "content-type: application/json" -d '{"primaryContactEmail":"x@x.com"}'
# → 400 { ok: false, error: "Missing required fields", missing: [...] }

# Direct controller call with correct secret (needs <SECRET>).
curl -X POST https://controller.fablabdesign.com/api/public/intake \
  -H "content-type: application/json" -H "x-intake-secret: <SECRET>" \
  -d '{"primaryContactEmail":"smoke@example.com","desiredOutcome":"smoke"}'
# → 200 { ok: true, id, reference }
```

Clean up smoke rows in Supabase:

```sql
DELETE FROM leads WHERE primary_contact_email LIKE '%@example.com';
```

## Known operational debt

- **Supabase DB password (`postgres.syrxllhzollftyvlhtqf`)** is
  low-entropy (`Fablab2026Controller`). Sits in Netlify env in
  plaintext. Rotate at Supabase → update `DATABASE_URL` in Netlify.
- **Marketing `SMTP_PASS` and `SANITY_API_READ_TOKEN`** are not marked
  `is_secret: true` in Netlify. Attempting to convert them via the MCP
  either 422s or silently no-ops on the Team Dev plan — try the Netlify
  UI, or accept them as server-scoped-but-readable (functionally still
  safe from browser exposure).
- **Google OAuth on Deploy Previews** — `NEXT_PUBLIC_APP_URL` is set to
  `controller.fablabdesign.com` for all contexts, so logging into the
  dashboard on a preview URL fails (redirect-URI mismatch). Only
  matters if you actually need dashboard login on previews; irrelevant
  to the intake pipeline.
