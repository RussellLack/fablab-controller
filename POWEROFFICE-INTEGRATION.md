# Poweroffice Integration Design

Future deliverable — full bidirectional sync between Controller and Poweroffice.

**Status:** v1 = manual mirror (now). v2 = read-only API sync. v3 (optional) = bidirectional.

## Why this matters

Poweroffice is Fablab Design's accounting system. The Controller does *not* generate invoices — it tracks them for project P&L visibility. The Controller's value-add is the billing-trigger engine (telling staff when to invoice) and the project-level financial picture (Poweroffice doesn't know about projects, packages, items, scope, change orders).

## Mapping (Controller ↔ Poweroffice)

| Controller field | Poweroffice field | Direction (v2) |
|---|---|---|
| `invoices.externalReference` | invoice number | ← read |
| `invoices.externalUrl` | deep link to invoice in Poweroffice UI | ← read |
| `invoices.externalStatus` | Poweroffice's status enum (sent/paid/credited/etc.) | ← read |
| `invoices.externalSyncedAt` | last sync timestamp | controller-managed |
| `invoices.totalGross` | invoice gross total | ← read |
| `invoices.amountPaid` | paid amount (sum of payments in Poweroffice) | ← read |
| `invoices.balanceDue` | computed | derived |
| `invoices.status` | mapped: poweroffice paid → controller `paid`, etc. | controller-mapped |
| `payments.amount`, `receivedDate`, `bankReference` | individual payment lines | ← read |
| `clients.orgNumber` | customer matching key | bidirectional check |

## v2 — Read-only API sync (planned scope)

### Auth
- Poweroffice uses OAuth2. One-time admin setup: connect via OAuth, store refresh token in Supabase (encrypted column or Vault).

### Sync triggers
1. **On-demand** — "Sync from Poweroffice" button on Finance pages
2. **Webhook** — Poweroffice webhooks fire on invoice paid/sent/credited; Controller endpoint at `/api/poweroffice/webhook` updates the matching row by `externalReference`
3. **Polling fallback** — nightly cron via Netlify scheduled function: pulls invoices changed since `externalSyncedAt`

### Server actions to add
```
syncInvoicesFromPoweroffice(projectId?)
  → fetch invoices, upsert by externalReference
  → for each invoice, fetch payments, upsert by Poweroffice payment id
  → bump externalSyncedAt
```

### Conflict resolution
- Controller manual edits win on `notes` and `triggeredByEvent` (Controller-only fields)
- Poweroffice wins on everything monetary
- A `sync_conflicts` log captures any divergences for review

### Cost considerations (per `feedback-token-cost-minimisation`)
- Use Poweroffice API directly (no LLM in this loop)
- Polling once daily is sufficient; webhook for the urgent stuff
- Stay on Supabase free tier — invoices are low-volume

## v1 — Manual mirror (current state)

The Controller works without any Poweroffice integration:
- User raises invoice in Poweroffice as normal
- Clicks "+ Log Poweroffice invoice" in the Controller
- Pastes the Poweroffice invoice number into `externalReference`
- Records gross total and (optionally) payment receipts manually
- Project P&L works from this manual data

This is what's shipping today. Once volume justifies it, v2 lights up the API and the same UI populates automatically.

## What's already in place (v1 shipped)

- `invoices` table has the external_* columns ready
- `billingTriggers` and `notifications` for billing recommendations
- Per-project Finance tab + cross-project /finance page
- Trigger-firing on PO issuance — surfaces "you should invoice X for Y" in the pipeline

## What's NOT in place

- Poweroffice API client / OAuth setup
- Webhook endpoint at `/api/poweroffice/webhook`
- Sync server actions
- Conflict log table
- Encrypted token storage (Supabase Vault setup)

These are the deliverables for the v2 work.

## Open questions for v2

1. **Customer matching** — Poweroffice customers vs Controller clients. Match by `orgNumber`? Manual link on first sync?
2. **Multi-currency** — does Poweroffice track FX rates at issue, or only base currency? Need to verify before relying on its payment amounts.
3. **Voided invoices** — Poweroffice "credited" status: map to Controller `void` and create a credit-note payment, or treat as a separate entity?
4. **VAT treatment** — Poweroffice handles MVA + reverse-charge correctly. Make sure the Controller doesn't recompute and diverge.
5. **Bookkeeping period locks** — Poweroffice locks past periods. Webhook updates to a locked period should still sync into the Controller (read-only), but the Controller should refuse to recompute.
