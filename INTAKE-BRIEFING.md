# Briefing: fablab-controller — finish public intake endpoint + fix preview auth

## Context

`fablab-controller` is a Next.js app (App Router) deployed on Netlify from
GitHub (`RussellLack/fablab-controller`), served in production at
`https://controller.fablabdesign.com`. It's an internal dashboard gated by
Supabase auth with Google OAuth. Supabase middleware protects all routes
except an allowlist.

We recently opened PR #1 (`feat/public-intake-endpoint` branch,
"feat: public intake endpoint for website leads"). It adds a public,
POST-only endpoint so the marketing website can submit leads into the
controller. The PR is open, not merged — leave merge decisions to the human.

## What PR #1 already contains (do not redo)

1. New file `src/app/api/public/intake/route.ts` — POST-only handler. Gated
   by an `x-intake-secret` request header compared against
   `INTAKE_SHARED_SECRET`. Returns 503 if `INTAKE_SHARED_SECRET` is unset,
   401 on bad/missing header. Validates the body with `leadDraftSchema`,
   requires at least one of `prospectiveClientName`, `primaryContactEmail`,
   or `desiredOutcome` (else 400 `Empty intake`), inserts a lead into
   Supabase, and generates a `LEAD-${year}-${NNNN}` reference.
2. `src/lib/supabase/middleware.ts` — `/api/public` added to the public
   allowlist and to the early-return fast-path so the endpoint bypasses auth:
   - `const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/health', '/api/public'];`
   - early return includes `|| path.startsWith('/api/public')`
3. `.env.local.example` — a commented placeholder documenting
   `INTAKE_SHARED_SECRET` (no real value committed).

## Request contract (verified against `leadDraftSchema` and `src/db/schema.ts`)

Headers: `content-type: application/json`, `x-intake-secret: <THE_SECRET>`.

Body: JSON object; all fields **optional and camelCase**. Must include at
least one of `prospectiveClientName`, `primaryContactEmail`, or
`desiredOutcome`. Any unknown field is ignored.

Accepted fields — exact names:

`prospectiveClientName, clientKind, primaryContactName, primaryContactEmail,
primaryContactPhone, propertyAddress, projectType, roomsOrZones,
desiredOutcome, budgetExpectation, budgetCurrency, timelineExpectation,
decisionMakers, approvalProcess, existingSuppliers, knownConstraints,
designStylePreferences, procurementExpectations,
deliveryInstallExpectations, fablabExpectedRole, source, notes`.

Constrained enum values (must match exactly if sent):

- `clientKind`: `individual | business | public_sector | cultural_institution | hospitality_group`
- `projectType`: `residential | commercial | hospitality | retail | workplace | cultural | mixed`
- `budgetCurrency`: `NOK | EUR | USD | GBP | SEK | DKK` (defaults to `NOK`)
- `fablabExpectedRole`: `design_advisory_only | design_and_specification | procurement_support | procurement_and_resale | supplier_coordination | delivery_coordination | installation_coordination | full_project_control`
- `source`: `referral | direct_inquiry | repeat_client | partner | website | other` (the route hard-codes `website` regardless — sending it is a no-op)

Loose fields:

- `budgetExpectation`: number **or** numeric string (e.g. `5000` or
  `"5000"`); empty string is treated as omitted.
- `primaryContactEmail`: must parse as an email if present; empty string is
  allowed.

Responses:

- `200 { ok: true, id, reference }` — `reference` is `LEAD-YYYY-NNNN`.
- `400 { ok: false, error: "Invalid JSON" | "Invalid input", fieldErrors? | "Empty intake" }`
- `401 { ok: false, error: "Unauthorised" }`
- `500 { ok: false, error: "Insert failed" | "Could not save intake" }`
- `503 { ok: false, error: "Intake not configured" }` (secret unset)

## Two open problems to solve

### Problem A — Preview login fails (config, not code)

The Netlify env var `NEXT_PUBLIC_APP_URL` is set to
`https://controller.fablabdesign.com` for all deploy contexts, including
Deploy Previews. So on the preview domain, Google OAuth builds its
callback against the production URL → redirect-URI mismatch → login never
completes. Supabase URL/anon key and Google client secret are correct and
identical across contexts; the app URL is the only mismatch.

Fix (config, human must apply the parts touching OAuth/secrets):

- Make `NEXT_PUBLIC_APP_URL` context-specific in Netlify: keep production
  as `https://controller.fablabdesign.com`, but for the Deploy Preview
  context use Netlify's `$DEPLOY_PRIME_URL` (or `$URL`) so it matches the
  live preview domain.
- Add the corresponding preview callback URL(s) to the Google OAuth
  allowed redirect URIs.
- Note: because preview URLs are per-PR, consider whether logging into the
  dashboard on previews is even worth supporting, vs. just testing the API
  endpoint (see Problem B).

### Problem B — Intake endpoint returns 503

`INTAKE_SHARED_SECRET` is not set in the Netlify project. Current env vars
present: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NODE_VERSION`.

Fix (human must set the secret — do not commit it):

- Add `INTAKE_SHARED_SECRET` in Netlify env (set for at least Production
  and Deploy Preview contexts). Keep the real value out of the repo.
- After it's set, the endpoint can be tested directly, no dashboard login
  required:

```bash
curl -X POST https://deploy-preview-1--fablab-controller.netlify.app/api/public/intake \
  -H "content-type: application/json" \
  -H "x-intake-secret: <THE_SECRET>" \
  -d '{
    "prospectiveClientName": "Test Client AS",
    "clientKind": "business",
    "primaryContactName": "Test Person",
    "primaryContactEmail": "test@example.com",
    "primaryContactPhone": "+47 900 00 000",
    "propertyAddress": "Karl Johans gate 1, Oslo",
    "projectType": "hospitality",
    "desiredOutcome": "Refit ground-floor bar and lounge",
    "budgetExpectation": "5000",
    "budgetCurrency": "NOK",
    "notes": "Test intake from website form"
  }'
```

Minimal smoke test (one required field is enough to pass the empty-intake
guard):

```bash
curl -X POST https://deploy-preview-1--fablab-controller.netlify.app/api/public/intake \
  -H "content-type: application/json" \
  -H "x-intake-secret: <THE_SECRET>" \
  -d '{"primaryContactEmail":"test@example.com"}'
```

## Verification tasks for Claude Code

1. Confirm the route contract above still matches
   `src/app/api/public/intake/route.ts` and `src/lib/validations/lead.ts`
   after any subsequent commits. Report any drift.
2. Verify the Supabase `leads` table still has `status` (enum, default
   `'new'`) and that `budget_expectation` remains `numeric` (route inserts
   a string). Report any mismatch rather than guessing.
3. Middleware sanity check: confirm `/api/public` is correctly excluded
   from auth in `src/lib/supabase/middleware.ts` and that no other route
   was accidentally exposed.
4. Don't merge PR #1 and don't put any real secret in the repo. Report
   findings; the human sets env vars and OAuth config and decides on merge.

## Hard constraints

- Never commit `INTAKE_SHARED_SECRET` or any real credential.
- Do not merge the PR.
- Env vars and Google OAuth redirect URIs are set by the human in
  Netlify/Google Console, not in code.
