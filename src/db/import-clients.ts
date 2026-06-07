/**
 * One-shot importer for `import/kunder.json` (derived from
 * Kunder.xlsx, the PowerOffice client export).
 *
 * Usage:
 *   npm run db:import:clients              → DRY RUN (default; no writes)
 *   npm run db:import:clients -- --commit  → apply inserts/updates
 *
 * Dedup strategy (decided with user):
 *   - Org rows (Organisasjonsnr. ≠ "Er person") match on `orgNumber`.
 *   - Individuals (Organisasjonsnr. = "Er person") match on exact `name`.
 *   - Match found → update non-null fields only (don't overwrite with blanks).
 *   - No match    → insert a new client.
 *
 * Kind heuristic:
 *   - "Er person"           → individual
 *   - otherwise              → business
 *   (We don't have a reliable signal for public_sector / cultural_institution
 *   / hospitality_group from this export; staff can refine kinds later.)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

// Use session pooler — long-running script + transaction pooler don't mix.
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, clients } from './index';

type Kunde = {
  'Kundenr.'?: string;
  Navn?: string;
  Kontaktperson?: string | null;
  'Kontaktpersons e-post'?: string | null;
  'Kontaktpersons telefon'?: string | null;
  Telefon?: string | null;
  'E-post'?: string | null;
  'Juridisk navn'?: string | null;
  'Organisasjonsnr.'?: string | null;
  'Adresse 1'?: string | null;
  'Adresse 2'?: string | null;
  Postnummer?: string | null;
  By?: string | null;
  Landkode?: string | null;
  'Bankkontonr.'?: string | null;
  'Kunde siden'?: string | null;
  Selger?: string | null;
};

type Mapped = {
  source: string;            // PowerOffice Kundenr. — for tracing in logs
  name: string;
  kind: 'individual' | 'business';
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  billingAddress: string | null;
  orgNumber: string | null;
  bankAccountRef: string | null;
  notes: string | null;
};

const ORG_PERSON_MARKER = 'Er person';

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function joinAddress(k: Kunde): string | null {
  const lines: string[] = [];
  const a1 = clean(k['Adresse 1']);
  const a2 = clean(k['Adresse 2']);
  const pc = clean(k.Postnummer);
  const city = clean(k.By);
  const cc = clean(k.Landkode);
  if (a1) lines.push(a1);
  if (a2) lines.push(a2);
  const cityLine = [pc, city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (cc && cc !== 'NO') lines.push(cc);  // omit NO; assume default
  return lines.length ? lines.join('\n') : null;
}

function mapRow(k: Kunde): Mapped | null {
  const name = clean(k.Navn);
  if (!name) return null;

  const orgRaw = clean(k['Organisasjonsnr.']);
  const isPerson = orgRaw === ORG_PERSON_MARKER;
  const orgNumber = isPerson ? null : orgRaw;

  // Prefer per-contact-person fields, fall back to org-level.
  const email = clean(k['Kontaktpersons e-post']) ?? clean(k['E-post']);
  const phone = clean(k['Kontaktpersons telefon']) ?? clean(k.Telefon);

  // Bank account refs come out as long numbers — schema caps at 60 chars.
  const bank = clean(k['Bankkontonr.']);

  // Build a notes string preserving provenance + any sales/customer-since info.
  const noteParts: string[] = [];
  const pono = clean(k['Kundenr.']);
  if (pono) noteParts.push(`PowerOffice Kundenr.: ${pono}`);
  const since = clean(k['Kunde siden']);
  if (since) noteParts.push(`Kunde siden: ${since.slice(0, 10)}`);
  const seller = clean(k.Selger);
  if (seller) noteParts.push(`Selger: ${seller}`);
  const juridiskNavn = clean(k['Juridisk navn']);
  if (juridiskNavn && juridiskNavn !== name && juridiskNavn !== ORG_PERSON_MARKER) {
    noteParts.push(`Juridisk navn: ${juridiskNavn}`);
  }

  return {
    source: pono ?? '(no Kundenr.)',
    name,
    kind: isPerson ? 'individual' : 'business',
    primaryContactName: clean(k.Kontaktperson),
    primaryContactEmail: email,
    primaryContactPhone: phone,
    billingAddress: joinAddress(k),
    orgNumber,
    bankAccountRef: bank ? bank.slice(0, 60) : null,
    notes: noteParts.length ? noteParts.join(' · ') : null
  };
}

async function findExisting(m: Mapped) {
  if (m.orgNumber) {
    const [row] = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.orgNumber, m.orgNumber));
    if (row) return row;
  }
  // Fallback for individuals or rows without org no.: exact name match.
  const [row] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.name, m.name));
  return row ?? null;
}

/** Build an UPDATE payload containing only fields we'd actually fill in. */
function buildUpdatePatch(m: Mapped, existing: { id: string; name: string }) {
  const patch: Record<string, string | null> = {};
  // Always trust new contact / address data over null existing values, but
  // never overwrite a non-null value with null (don't lose existing info).
  const candidates: Array<keyof Mapped> = [
    'primaryContactName', 'primaryContactEmail', 'primaryContactPhone',
    'billingAddress', 'orgNumber', 'bankAccountRef', 'notes', 'kind'
  ];
  for (const field of candidates) {
    const v = m[field];
    if (v === null || v === undefined) continue;
    patch[field as string] = String(v);
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const mode = commit ? 'COMMIT' : 'DRY-RUN';
  console.log(`\n📇 import-clients (${mode})\n`);

  const jsonPath = resolve(__dirname, '../../../import/kunder.json');
  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Kunde[];
  console.log(`Loaded ${raw.length} rows from ${jsonPath}`);

  const mapped: Mapped[] = [];
  for (const row of raw) {
    const m = mapRow(row);
    if (m) mapped.push(m);
  }
  console.log(`Mapped ${mapped.length} valid client rows.`);

  const plan = {
    insert: [] as Mapped[],
    update: [] as Array<{ existing: { id: string; name: string }; m: Mapped; patch: Record<string, string | null> }>,
    skip: [] as Array<{ existing: { id: string; name: string }; m: Mapped; reason: string }>
  };

  for (const m of mapped) {
    const existing = await findExisting(m);
    if (!existing) {
      plan.insert.push(m);
      continue;
    }
    const patch = buildUpdatePatch(m, existing);
    if (patch) plan.update.push({ existing, m, patch });
    else plan.skip.push({ existing, m, reason: 'no new fields to fill' });
  }

  console.log(`\n── Plan ──────────────────────────────────────────`);
  console.log(`  Insert: ${plan.insert.length}`);
  console.log(`  Update: ${plan.update.length}`);
  console.log(`  Skip:   ${plan.skip.length}`);

  if (plan.insert.length) {
    console.log(`\n  Sample inserts (first 5):`);
    for (const m of plan.insert.slice(0, 5)) {
      console.log(`    + [${m.kind}] ${m.name}${m.orgNumber ? ` · org ${m.orgNumber}` : ''}${m.primaryContactEmail ? ` · ${m.primaryContactEmail}` : ''}`);
    }
    if (plan.insert.length > 5) console.log(`    … and ${plan.insert.length - 5} more`);
  }
  if (plan.update.length) {
    console.log(`\n  Sample updates (first 5):`);
    for (const { existing, m, patch } of plan.update.slice(0, 5)) {
      const fields = Object.keys(patch).join(', ');
      console.log(`    ~ ${existing.name} (id ${existing.id.slice(0, 8)}…) ← {${fields}}`);
    }
    if (plan.update.length > 5) console.log(`    … and ${plan.update.length - 5} more`);
  }
  if (plan.skip.length) {
    console.log(`\n  ${plan.skip.length} rows skipped — existing client already has every field populated.`);
  }

  if (!commit) {
    console.log(`\n✋ DRY-RUN — no DB writes performed. Re-run with --commit to apply.\n`);
    process.exit(0);
  }

  console.log(`\n🚀 Applying changes…`);
  let inserted = 0;
  let updated = 0;

  for (const m of plan.insert) {
    await db.insert(clients).values({
      name: m.name,
      kind: m.kind,
      primaryContactName: m.primaryContactName,
      primaryContactEmail: m.primaryContactEmail,
      primaryContactPhone: m.primaryContactPhone,
      billingAddress: m.billingAddress,
      orgNumber: m.orgNumber,
      bankAccountRef: m.bankAccountRef,
      notes: m.notes
    });
    inserted++;
  }

  for (const { existing, patch } of plan.update) {
    await db.update(clients).set(patch).where(eq(clients.id, existing.id));
    updated++;
  }

  console.log(`\n✅ Done. Inserted ${inserted}, updated ${updated}.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Import failed:', err);
  process.exit(1);
});
