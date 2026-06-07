/**
 * One-shot importer for `import/prosjekter.json` (derived from
 * Prosjekter.xlsx, the PowerOffice project export).
 *
 * Usage:
 *   npm run db:import:projects              → DRY RUN (default; no writes)
 *   npm run db:import:projects -- --commit  → apply inserts/updates
 *
 * Reference scheme:
 *   - Every imported project gets `reference = PWO-{Kode}` (e.g. PWO-1,
 *     PWO-42). This is the upsert key — re-running after a fresh
 *     PowerOffice export will update existing rows, not duplicate them.
 *
 * Client join:
 *   - Each PowerOffice project row carries `Kundenr.` (the customer's
 *     PowerOffice id). We previously stored that on each client in the
 *     `notes` field as `PowerOffice Kundenr.: <N>`. We parse those once
 *     into a Kundenr → clientId map and join projects against it.
 *
 * Internal projects (Internt=Ja):
 *   - There's no external customer — we create / reuse a synthetic
 *     "Fablab Design AS" client (kind=business, marked clearly in notes)
 *     and link all internal projects to it.
 *
 * Status → stage mapping:
 *   - "Fullført" (completed)  → archived
 *   - "Pågår"   (in progress) → brief (default; staff triages from here)
 *   - "På vent" (on hold)     → on_hold
 *
 * Required fields without a source signal:
 *   - projectType → 'mixed'                 (no signal in PowerOffice export)
 *   - fablabRole  → 'full_project_control'  (most common default)
 *   - priority    → 'normal'
 *   - budget / margin / rollups left blank — those are populated by the
 *     controller's own pipelines, not PowerOffice numbers.
 *
 * Owner mapping:
 *   - Prosjektleder is matched case-insensitively against `users.name`.
 *     No match → currentOwnerId stays null; the original PM name is
 *     preserved in the description so context isn't lost.
 *
 * Numeric source data (Inntekter, Kostnader, etc.) is preserved in
 * the description for reference but NOT pushed into the rollup
 * columns — those belong to the controller's own pipeline.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, clients, projects, users } from './index';

type Prosjekt = {
  'Kode'?: string;
  'Navn'?: string;
  'Internt'?: string;
  'Kundenr.'?: string;
  'Kunde'?: string;
  'Kontaktperson'?: string | null;
  'Prosjektleder'?: string | null;
  'Kategori'?: string | null;
  'Avdeling'?: string | null;
  'Lokasjon'?: string | null;
  'Startdato'?: string | null;
  'Sluttdato'?: string | null;
  'Fakturering'?: string | null;
  'Medgått tid'?: string | null;
  'Fakturerbar tid'?: string | null;
  'Fakturerbar %'?: string | null;
  'Inntekter'?: string | null;
  'Kostnader'?: string | null;
  'Status'?: string | null;
};

type ProjectStage =
  | 'brief' | 'concept' | 'design_development' | 'specification'
  | 'procurement_production' | 'installation' | 'handover'
  | 'on_hold' | 'cancelled' | 'archived' | 'in_dispute';

type Mapped = {
  reference: string;
  title: string;
  description: string | null;
  clientId: string;
  clientName: string;          // for log readability
  projectType: 'mixed';
  fablabRole: 'full_project_control';
  currentStage: ProjectStage;
  currentOwnerId: string | null;
  ownerLabel: string;          // for log readability
  isoStartDate: string | null;
};

const INTERNAL_CLIENT_NAME = 'Fablab Design AS (Internt)';

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function statusToStage(s: string | null | undefined): ProjectStage {
  const v = clean(s);
  if (v === 'Fullført') return 'archived';
  if (v === 'På vent') return 'on_hold';
  return 'brief';  // Pågår + everything else
}

function isoDate(v: string | null | undefined): string | null {
  const s = clean(v);
  if (!s) return null;
  // PowerOffice ships ISO dates with " 00:00:00" suffix; drop the time.
  return s.slice(0, 10);
}

function buildDescription(p: Prosjekt, ownerLabel: string): string {
  const parts: string[] = [];
  parts.push(`Imported from PowerOffice (Kode ${clean(p.Kode) ?? '?'}).`);
  if (p.Status) parts.push(`Original status: ${p.Status}.`);
  if (p.Kontaktperson) parts.push(`Kontaktperson: ${p.Kontaktperson}.`);
  if (ownerLabel) parts.push(`Prosjektleder: ${ownerLabel}.`);
  if (p.Kategori) parts.push(`Kategori: ${p.Kategori}.`);
  if (p.Lokasjon) parts.push(`Lokasjon: ${p.Lokasjon}.`);
  if (p.Fakturering) parts.push(`Fakturering: ${p.Fakturering}.`);

  const tilegnet = clean(p['Medgått tid']);
  const fakt = clean(p['Fakturerbar tid']);
  const inntekter = clean(p.Inntekter);
  const kostnader = clean(p.Kostnader);
  const stats: string[] = [];
  if (tilegnet) stats.push(`Medgått tid ${tilegnet}h`);
  if (fakt) stats.push(`Fakturerbar tid ${fakt}h`);
  if (inntekter) stats.push(`Inntekter NOK ${inntekter}`);
  if (kostnader) stats.push(`Kostnader NOK ${kostnader}`);
  if (stats.length) parts.push(`PowerOffice stats: ${stats.join(', ')}.`);

  parts.push('Stage in the controller starts at brief / archived per PowerOffice status — refine once triaged.');
  return parts.join(' ');
}

async function getOrCreateInternalClient(commit: boolean): Promise<string> {
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.name, INTERNAL_CLIENT_NAME));
  if (existing) return existing.id;
  if (!commit) return '(dry-run: would create)' as unknown as string;

  const [created] = await db
    .insert(clients)
    .values({
      name: INTERNAL_CLIENT_NAME,
      kind: 'business',
      notes: 'Synthetic internal client. Owns Fablab Design AS in-house projects imported from PowerOffice (rows flagged Internt=Ja).'
    })
    .returning({ id: clients.id });
  return created!.id;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const mode = commit ? 'COMMIT' : 'DRY-RUN';
  console.log(`\n📐 import-projects (${mode})\n`);

  const jsonPath = resolve(__dirname, '../../../import/prosjekter.json');
  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Prosjekt[];
  console.log(`Loaded ${raw.length} rows from ${jsonPath}`);

  // ── Build the Kundenr → client lookup once ─────────────────────────
  const allClients = await db.select({
    id: clients.id, name: clients.name, notes: clients.notes
  }).from(clients);
  const byKundenr = new Map<string, { id: string; name: string }>();
  for (const c of allClients) {
    if (!c.notes) continue;
    const m = c.notes.match(/PowerOffice Kundenr\.:\s*(\d+)/);
    if (m && m[1]) byKundenr.set(m[1], { id: c.id, name: c.name });
  }
  console.log(`Built Kundenr→client map: ${byKundenr.size} entries`);

  // ── Build a name→userId map for Prosjektleder matching ─────────────
  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
  const byUserName = new Map<string, { id: string; name: string }>();
  for (const u of allUsers) byUserName.set(u.name.toLowerCase(), u);

  // ── Internal client (may need to be created) ───────────────────────
  const internalRows = raw.filter(r => r.Internt === 'Ja');
  let internalClientId: string | null = null;
  if (internalRows.length) {
    internalClientId = await getOrCreateInternalClient(commit);
    console.log(`Internal projects: ${internalRows.length} → client "${INTERNAL_CLIENT_NAME}" (${internalClientId.slice(0, 8)}…)`);
  }

  // ── Map each row ────────────────────────────────────────────────────
  const mapped: Mapped[] = [];
  const missingClients: Array<{ kode: string; navn: string; kundenr: string; kunde: string }> = [];

  for (const p of raw) {
    const kode = clean(p.Kode);
    const navn = clean(p.Navn);
    if (!kode || !navn) continue;

    let clientId: string | null = null;
    let clientName: string = '';
    if (p.Internt === 'Ja') {
      clientId = internalClientId;
      clientName = INTERNAL_CLIENT_NAME;
    } else {
      const kundenr = clean(p['Kundenr.']);
      const match = kundenr ? byKundenr.get(kundenr) : null;
      if (!match) {
        missingClients.push({
          kode, navn, kundenr: kundenr ?? '(none)', kunde: clean(p.Kunde) ?? '(none)'
        });
        continue;
      }
      clientId = match.id;
      clientName = match.name;
    }

    const pmRaw = clean(p.Prosjektleder);
    const matchedUser = pmRaw ? byUserName.get(pmRaw.toLowerCase()) : null;

    mapped.push({
      reference: `PWO-${kode}`,
      title: navn.slice(0, 300),
      description: buildDescription(p, pmRaw ?? ''),
      clientId: clientId!,
      clientName,
      projectType: 'mixed',
      fablabRole: 'full_project_control',
      currentStage: statusToStage(p.Status),
      currentOwnerId: matchedUser?.id ?? null,
      ownerLabel: matchedUser
        ? `${matchedUser.name} (matched)`
        : pmRaw ? `${pmRaw} (no user; null)` : '(no PM)',
      isoStartDate: isoDate(p.Startdato)
    });
  }

  // ── Plan: insert vs update by reference ────────────────────────────
  const refs = mapped.map(m => m.reference);
  const existing = refs.length
    ? await db.select({ id: projects.id, reference: projects.reference })
        .from(projects)
    : [];
  const existingByRef = new Map<string, string>();
  for (const e of existing) existingByRef.set(e.reference, e.id);

  const plan = {
    insert: [] as Mapped[],
    update: [] as Array<{ id: string; m: Mapped }>
  };
  for (const m of mapped) {
    const id = existingByRef.get(m.reference);
    if (id) plan.update.push({ id, m });
    else plan.insert.push(m);
  }

  // ── Report ─────────────────────────────────────────────────────────
  console.log(`\n── Plan ──────────────────────────────────────────`);
  console.log(`  Insert: ${plan.insert.length}`);
  console.log(`  Update: ${plan.update.length}`);
  console.log(`  Skipped (no client): ${missingClients.length}`);

  const stageCounts = mapped.reduce<Record<string, number>>((acc, m) => {
    acc[m.currentStage] = (acc[m.currentStage] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Stage breakdown: ${JSON.stringify(stageCounts)}`);

  const ownerCounts = mapped.reduce<Record<string, number>>((acc, m) => {
    const key = m.currentOwnerId ? 'matched' : 'null';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Owner mapping: ${JSON.stringify(ownerCounts)}`);

  if (plan.insert.length) {
    console.log(`\n  Sample inserts (first 5):`);
    for (const m of plan.insert.slice(0, 5)) {
      console.log(`    + ${m.reference} [${m.currentStage}] ${m.title} · client "${m.clientName}" · owner ${m.ownerLabel}`);
    }
    if (plan.insert.length > 5) console.log(`    … and ${plan.insert.length - 5} more`);
  }

  if (missingClients.length) {
    console.log(`\n  Skipped — no client matched in DB:`);
    for (const m of missingClients) {
      console.log(`    ✗ PWO-${m.kode} "${m.navn}" · Kundenr=${m.kundenr} Kunde="${m.kunde}"`);
    }
  }

  if (!commit) {
    console.log(`\n✋ DRY-RUN — no DB writes performed. Re-run with --commit to apply.\n`);
    process.exit(0);
  }

  console.log(`\n🚀 Applying changes…`);
  let inserted = 0, updated = 0;

  for (const m of plan.insert) {
    await db.insert(projects).values({
      reference: m.reference,
      title: m.title,
      description: m.description,
      clientId: m.clientId,
      projectType: m.projectType,
      fablabRole: m.fablabRole,
      currentStage: m.currentStage,
      currentOwnerId: m.currentOwnerId
    });
    inserted++;
  }

  for (const { id, m } of plan.update) {
    await db.update(projects).set({
      title: m.title,
      description: m.description,
      currentStage: m.currentStage,
      currentOwnerId: m.currentOwnerId
    }).where(eq(projects.id, id));
    updated++;
  }

  console.log(`\n✅ Done. Inserted ${inserted}, updated ${updated}, skipped ${missingClients.length}.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Import failed:', err);
  process.exit(1);
});
