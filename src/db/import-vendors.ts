/**
 * One-shot importer for `import/leverandorer.json` (derived from
 * Leverandører.csv, the PowerOffice supplier export — which is
 * actually XLSX inside despite the .csv extension).
 *
 * Usage:
 *   npm run db:import:vendors              → DRY RUN (default; no writes)
 *   npm run db:import:vendors -- --commit  → apply inserts/updates
 *
 * Dedup strategy:
 *   - Match by exact `name` (case-insensitive). Vendors don't have a
 *     dedicated orgNumber column, so name is the natural key.
 *   - Match found → update non-null fields only (preserve any data
 *     the controller already had).
 *   - No match    → insert a new vendor.
 *
 * Kind default:
 *   - All imported rows get kind='supplier'. PowerOffice doesn't
 *     distinguish suppliers / fabricators / contractors, so refine
 *     later in /vendors.
 *
 * Currency mapping (from Landkode):
 *   NO → NOK, DK → DKK, SE → SEK, GB → GBP, everything else → EUR
 *
 * Active flag:
 *   - Utestengt = 'Ja' (suspended) → active = false
 *   - else                          → active = true
 *
 * Provenance:
 *   - PowerOffice Leverandørnr., Organisasjonsnr., Bankkontonr.,
 *     "Pålitelig leverandør" and "Standardkonto" all preserved in
 *     the notes field for traceability and accounting reference.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db, vendors } from './index';

type Leverandor = {
  'Leverandørnr.'?: string;
  'Navn'?: string;
  'Kontaktperson'?: string | null;
  'Telefon'?: string | null;
  'E-post'?: string | null;
  'Juridisk navn'?: string | null;
  'Organisasjonsnr.'?: string | null;
  'Leverandør siden'?: string | null;
  'Adresse 1'?: string | null;
  'Adresse 2'?: string | null;
  'Postnummer'?: string | null;
  'By'?: string | null;
  'Landkode'?: string | null;
  'Bankkontonr.'?: string | null;
  'Pålitelig leverandør'?: string | null;
  'Standardkonto'?: string | null;
  'Utestengt'?: string | null;
};

type Currency = 'NOK' | 'EUR' | 'USD' | 'GBP' | 'SEK' | 'DKK';

type Mapped = {
  source: string;       // Leverandørnr. — for log readability
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  country: string | null;
  defaultCurrency: Currency;
  active: boolean;
  notes: string | null;
};

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function currencyFor(country: string | null): Currency {
  switch (country) {
    case 'NO': return 'NOK';
    case 'DK': return 'DKK';
    case 'SE': return 'SEK';
    case 'GB': return 'GBP';
    default:   return 'EUR';
  }
}

function joinAddress(k: Leverandor): string | null {
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
  if (cc && cc !== 'NO') lines.push(cc);
  return lines.length ? lines.join('\n') : null;
}

function mapRow(k: Leverandor): Mapped | null {
  const name = clean(k.Navn);
  if (!name) return null;

  const country = clean(k.Landkode);
  const utestengt = clean(k.Utestengt);

  const noteParts: string[] = [];
  const leverNr = clean(k['Leverandørnr.']);
  if (leverNr) noteParts.push(`PowerOffice Leverandørnr.: ${leverNr}`);
  const orgNr = clean(k['Organisasjonsnr.']);
  if (orgNr) noteParts.push(`Org.nr.: ${orgNr}`);
  const juridiskNavn = clean(k['Juridisk navn']);
  if (juridiskNavn && juridiskNavn !== name) noteParts.push(`Juridisk navn: ${juridiskNavn}`);
  const since = clean(k['Leverandør siden']);
  if (since) noteParts.push(`Leverandør siden: ${since}`);
  const bank = clean(k['Bankkontonr.']);
  if (bank) noteParts.push(`Bankkontonr.: ${bank}`);
  const standardkonto = clean(k['Standardkonto']);
  if (standardkonto) noteParts.push(`Standardkonto: ${standardkonto}`);
  const palitelig = clean(k['Pålitelig leverandør']);
  if (palitelig === 'Ja') noteParts.push('Pålitelig: Ja');
  if (utestengt === 'Ja') noteParts.push('PowerOffice-status: Utestengt');

  return {
    source: leverNr ?? '(no Leverandørnr.)',
    name,
    contactName: clean(k.Kontaktperson),
    contactEmail: clean(k['E-post']),
    contactPhone: clean(k.Telefon),
    address: joinAddress(k),
    country: country && country.length === 2 ? country : null,
    defaultCurrency: currencyFor(country),
    active: utestengt !== 'Ja',
    notes: noteParts.length ? noteParts.join(' · ') : null
  };
}

async function findExisting(m: Mapped) {
  const [row] = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(sql`lower(${vendors.name}) = lower(${m.name})`);
  return row ?? null;
}

function buildUpdatePatch(m: Mapped): Record<string, string | boolean | null> | null {
  const patch: Record<string, string | boolean | null> = {};
  // Fill any field where the new data is non-null. Don't overwrite
  // existing controller data with null.
  if (m.contactName) patch.contactName = m.contactName;
  if (m.contactEmail) patch.contactEmail = m.contactEmail;
  if (m.contactPhone) patch.contactPhone = m.contactPhone;
  if (m.address) patch.address = m.address;
  if (m.country) patch.country = m.country;
  if (m.notes) patch.notes = m.notes;
  // active and defaultCurrency are always set on insert; on update we
  // only flip active if the source says explicitly suspended.
  if (m.active === false) patch.active = false;
  return Object.keys(patch).length > 0 ? patch : null;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const mode = commit ? 'COMMIT' : 'DRY-RUN';
  console.log(`\n🏭 import-vendors (${mode})\n`);

  const jsonPath = resolve(__dirname, '../../../import/leverandorer.json');
  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Leverandor[];
  console.log(`Loaded ${raw.length} rows from ${jsonPath}`);

  const mapped: Mapped[] = [];
  for (const row of raw) {
    const m = mapRow(row);
    if (m) mapped.push(m);
  }
  console.log(`Mapped ${mapped.length} valid vendor rows.`);

  const plan = {
    insert: [] as Mapped[],
    update: [] as Array<{ existing: { id: string; name: string }; m: Mapped; patch: Record<string, string | boolean | null> }>,
    skip: [] as Array<{ existing: { id: string; name: string }; m: Mapped; reason: string }>
  };

  for (const m of mapped) {
    const existing = await findExisting(m);
    if (!existing) {
      plan.insert.push(m);
      continue;
    }
    const patch = buildUpdatePatch(m);
    if (patch) plan.update.push({ existing, m, patch });
    else plan.skip.push({ existing, m, reason: 'no new fields to fill' });
  }

  console.log(`\n── Plan ──────────────────────────────────────────`);
  console.log(`  Insert: ${plan.insert.length}`);
  console.log(`  Update: ${plan.update.length}`);
  console.log(`  Skip:   ${plan.skip.length}`);

  // Country + currency + active breakdown
  const byCountry = mapped.reduce<Record<string, number>>((acc, m) => {
    const key = m.country ?? '(none)';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Countries: ${JSON.stringify(byCountry)}`);
  const inactive = mapped.filter(m => !m.active).length;
  console.log(`  Inactive (Utestengt): ${inactive}`);

  if (plan.insert.length) {
    console.log(`\n  Sample inserts (first 5):`);
    for (const m of plan.insert.slice(0, 5)) {
      console.log(`    + ${m.name}${m.country ? ` · ${m.country}` : ''} · ${m.defaultCurrency}${m.contactEmail ? ` · ${m.contactEmail}` : ''}${!m.active ? ' [INACTIVE]' : ''}`);
    }
    if (plan.insert.length > 5) console.log(`    … and ${plan.insert.length - 5} more`);
  }

  if (!commit) {
    console.log(`\n✋ DRY-RUN — no DB writes performed. Re-run with --commit to apply.\n`);
    process.exit(0);
  }

  console.log(`\n🚀 Applying changes…`);
  let inserted = 0, updated = 0;

  for (const m of plan.insert) {
    await db.insert(vendors).values({
      name: m.name,
      kind: 'supplier',
      contactName: m.contactName,
      contactEmail: m.contactEmail,
      contactPhone: m.contactPhone,
      address: m.address,
      country: m.country,
      defaultCurrency: m.defaultCurrency,
      active: m.active,
      notes: m.notes
    });
    inserted++;
  }

  for (const { existing, patch } of plan.update) {
    await db.update(vendors).set(patch).where(eq(vendors.id, existing.id));
    updated++;
  }

  console.log(`\n✅ Done. Inserted ${inserted}, updated ${updated}, skipped ${plan.skip.length}.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Import failed:', err);
  process.exit(1);
});
