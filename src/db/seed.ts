/**
 * Seed script — populates the database with a realistic sample project so
 * the first-slice screens have something to render.
 *
 * Run: `npm run db:seed`
 *
 * Idempotent: deletes any prior seed rows (by `reference` prefix) before inserting.
 */

import 'dotenv/config';
import {
  db, users, clients, projects, packages, items, leads,
  scopeBaselines, scopeBaselineVersions, approvals,
  billingTriggers, invoices, invoiceLines, payments
} from './index';
import { eq, like } from 'drizzle-orm';

async function main() {
  console.log('🌱 Seeding Fablab Controller…');

  // ── Cleanup prior seed rows ────────────────────────────────────────
  await db.delete(payments).where(like(payments.reference, 'PAY-%'));
  await db.delete(invoiceLines);
  await db.delete(invoices).where(like(invoices.reference, 'INV-%'));
  await db.delete(billingTriggers);
  await db.delete(approvals).where(like(approvals.reference, 'APPR-%'));
  await db.delete(items);
  await db.delete(packages);
  await db.delete(scopeBaselineVersions);
  await db.delete(scopeBaselines);
  await db.delete(projects).where(like(projects.reference, 'FD-2026-%'));
  await db.delete(leads).where(like(leads.reference, 'LEAD-2026-%'));
  await db.delete(clients).where(eq(clients.name, 'Tromsø Museum'));

  // ── Seed user ─────────────────────────────────────────────────────
  // NOTE: real user IDs come from Supabase Auth (auth.users). For seed,
  // create a placeholder you can re-link to your real auth.users.id later.
  const [user] = await db.insert(users).values({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'seed@fablab.no',
    name: 'Russell L.',
    roles: ['project_lead', 'admin', 'approver'],
    languagePref: 'no'
  }).onConflictDoNothing().returning();

  // ── Client ────────────────────────────────────────────────────────
  const [client] = await db.insert(clients).values({
    name: 'Tromsø Museum',
    kind: 'cultural_institution',
    primaryContactName: 'Sigrid B.',
    primaryContactEmail: 'sigrid.b@tromsomuseum.no',
    primaryContactPhone: '+47 77 64 12 00',
    billingAddress: 'Lars Thørings veg 10, 9013 Tromsø',
    paymentTermsDays: 30,
    notes: 'Heritage-listed building — Riksantikvaren oversight applies.'
  }).returning();

  if (!client) throw new Error('Failed to insert client');

  // ── Leads (varying completeness — demonstrates the R1 gate) ─────────
  // Fully complete — would be convertible
  await db.insert(leads).values({
    reference: 'LEAD-2026-0042',
    source: 'referral',
    status: 'converted',
    ownerId: user?.id ?? null,
    prospectiveClientName: 'Tromsø Museum',
    clientKind: 'cultural_institution',
    primaryContactName: 'Sigrid B.',
    primaryContactEmail: 'sigrid.b@tromsomuseum.no',
    primaryContactPhone: '+47 77 64 12 00',
    propertyAddress: 'Storgata 1, 9008 Tromsø',
    projectType: 'cultural',
    roomsOrZones: 'Gallery main hall, entrance lobby, archive vestibule',
    desiredOutcome: 'Refit gallery for Sami textile collection. Soft opening 15 Jun.',
    budgetExpectation: '1800000',
    timelineExpectation: 'Soft opening 15 June 2026',
    decisionMakers: 'Sigrid B. (curator) + Tromsø Museum board',
    approvalProcess: 'Curator drafts → board approves at monthly meeting',
    existingSuppliers: 'None retained',
    knownConstraints: 'Listed building; no wall penetrations without conservator approval',
    designStylePreferences: 'Contemporary minimalism complementing heritage',
    procurementExpectations: 'Fablab to procure and resell FF&E with margin',
    deliveryInstallExpectations: 'On-site installation by Fablab team',
    fablabExpectedRole: 'procurement_and_resale'
  });

  // Mostly complete — 14/16 (missing approvalProcess + designStylePreferences)
  await db.insert(leads).values({
    reference: 'LEAD-2026-0055',
    source: 'referral',
    status: 'qualifying',
    ownerId: user?.id ?? null,
    prospectiveClientName: 'Bergen Galleri Forening',
    clientKind: 'cultural_institution',
    primaryContactName: 'Helene M.',
    primaryContactEmail: 'helene@bergengalleri.no',
    primaryContactPhone: '+47 55 30 21 14',
    propertyAddress: 'Nygårdsgaten 2, 5015 Bergen',
    projectType: 'cultural',
    roomsOrZones: 'Main gallery, two side galleries, reception',
    desiredOutcome: 'Refit for rotating contemporary art programme',
    budgetExpectation: '2400000',
    timelineExpectation: 'Opening Q4 2026',
    decisionMakers: 'Helene M. + board',
    existingSuppliers: 'None',
    knownConstraints: 'Limited ceiling height in side galleries',
    procurementExpectations: 'Fablab to manage FF&E',
    deliveryInstallExpectations: 'Fablab + local installer',
    fablabExpectedRole: 'full_project_control'
  });

  // Partially complete — 9/16 (the wireframe example)
  await db.insert(leads).values({
    reference: 'LEAD-2026-0058',
    source: 'referral',
    status: 'qualifying',
    ownerId: user?.id ?? null,
    prospectiveClientName: 'Bjørvika Restaurant Group',
    clientKind: 'business',
    primaryContactName: 'Lars Mikkelsen',
    primaryContactEmail: 'lars@bjorvikarestaurants.no',
    propertyAddress: 'Sørenga 1, 0194 Oslo',
    projectType: 'hospitality',
    roomsOrZones: 'Main dining room (140 covers), bar/lounge, private dining, entrance, restrooms',
    budgetExpectation: '2800000',
    timelineExpectation: 'Soft opening Q1 2027',
    decisionMakers: 'Lars Mikkelsen + investor board',
    fablabExpectedRole: 'full_project_control'
  });

  // Barely started — 4/16
  await db.insert(leads).values({
    reference: 'LEAD-2026-0056',
    source: 'website',
    status: 'new',
    ownerId: user?.id ?? null,
    prospectiveClientName: 'K. & M. Andersen (private)',
    clientKind: 'individual',
    primaryContactEmail: 'k.andersen@example.no',
    projectType: 'residential'
  });

  // ── Project ───────────────────────────────────────────────────────
  const [project] = await db.insert(projects).values({
    reference: 'FD-2026-0142',
    title: 'Sami textile gallery refit',
    description: 'Refit of the Sami textile exhibition gallery at Tromsø Museum. ~180m². Brief covers lighting redesign for textile preservation, bespoke display vitrines, acoustic wall treatment, custom seating, signage and wayfinding. Heritage-sensitive — listed building, no fixings into stone walls.',
    clientId: client.id,
    projectType: 'cultural',
    fablabRole: 'procurement_and_resale',
    currentStage: 'procurement_production',
    currentOwnerId: user?.id ?? null,
    siteAddress: 'Storgata 1, 9008 Tromsø',
    priority: 'high',
    budget: '1800000',
    budgetCurrency: 'NOK',
    vatRate: '25.00',
    targetHandoverDate: '2026-06-20'
  }).returning();

  if (!project) throw new Error('Failed to insert project');

  // ── A second smaller project to populate the list view ───────────
  await db.insert(projects).values({
    reference: 'FD-2026-0144',
    title: 'Hotel Marin lobby + bar fit-out',
    description: 'Hotel lobby and ground-floor bar reconfiguration. Hospitality fit-out with bespoke bar joinery, banquette seating, lighting refresh.',
    clientId: client.id,
    projectType: 'hospitality',
    fablabRole: 'full_project_control',
    currentStage: 'concept',
    siteAddress: 'Marin Strandgate, Tromsø',
    priority: 'normal',
    budget: '4200000',
    budgetCurrency: 'NOK',
    vatRate: '25.00',
    targetHandoverDate: '2026-09-15'
  });

  // ── A package + item for the main project ────────────────────────
  const [pkg] = await db.insert(packages).values({
    projectId: project.id,
    name: 'Gallery lighting package',
    kind: 'category',
    sequence: 1,
    status: 'in_procurement',
    budget: '380000'
  }).returning();

  if (pkg) {
    await db.insert(items).values({
      packageId: pkg.id,
      name: 'Erco Parscan track spotlight',
      description: 'Adjustable track spotlight, LED 24W, 2700K, CRI 95+ (museum-grade). Black finish. DALI-2 dimmable. UV-filtered.',
      itemType: 'sourced',
      category: 'lighting',
      subcategory: 'track_spotlight',
      quantity: '24',
      unit: 'each',
      status: 'ordered',
      costState: 'committed',
      manufacturer: 'Erco',
      countryOfOrigin: 'DE',
      hsCode: '9405.10'
    });
  }

  // ── ScopeBaseline + initial draft for the main project ──────────
  const [baseline] = await db.insert(scopeBaselines).values({
    projectId: project.id
  }).returning();

  if (baseline) {
    const [version] = await db.insert(scopeBaselineVersions).values({
      scopeBaselineId: baseline.id,
      versionNumber: 1,
      status: 'draft',
      createdBy: user?.id ?? '00000000-0000-0000-0000-000000000001',
      projectAreas: 'Sami textile gallery, main hall (~180m²), entrance lobby (~40m²)',
      includedServices: [
        'Design concept', 'Design development', 'FF&E specification',
        'Bespoke vitrine commissioning', 'Lighting redesign', 'Acoustic treatment',
        'Signage & wayfinding', 'Procurement & resale of FF&E',
        'Install coordination', 'Snagging', 'Handover documentation'
      ],
      excludedServices: [
        'Structural changes', 'Electrical infrastructure beyond lighting',
        'HVAC modifications', 'Fire alarm modifications',
        'Conservation treatment of textiles (museum conservator handles)',
        'Insurance for objects on display'
      ],
      timelineAssumptions: 'Heritage listing clearance obtained by museum before construction.',
      budgetAssumptions: 'kr 1.8M total · 35% FF&E · 30% bespoke · 15% lighting · 15% acoustic · 5% contingency'
    }).returning();

    if (version) {
      await db.update(scopeBaselines)
        .set({ currentVersionId: version.id })
        .where(eq(scopeBaselines.id, baseline.id));
      await db.update(projects)
        .set({ currentScopeBaselineId: baseline.id })
        .where(eq(projects.id, project.id));

      // ── Sample Approval against the scope version ──────────────
      await db.insert(approvals).values({
        reference: 'APPR-0142-0001',
        projectId: project.id,
        scopeBaselineVersionId: version.id,
        subject: 'Approve scope baseline v1 for Sami textile gallery refit',
        description: 'Initial scope including FF&E, bespoke vitrines, lighting redesign, acoustic treatment, and install coordination. Excludes structural and HVAC.',
        version: 'Scope v1',
        approverName: 'Sigrid B.',
        approverEmail: 'sigrid.b@tromsomuseum.no',
        approvalChannel: 'email',
        approvalConsequence: 'Approval unlocks the Procurement & Production stage gate (Rule R2). Items can then be specified, quoted, and ordered against this scope.',
        status: 'sent_for_approval',
        sentAt: new Date(),
        validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        requestedBy: user?.id ?? '00000000-0000-0000-0000-000000000001'
      });
    }
  }

  // ── Default billing triggers (global — project_id NULL) ─────────────
  await db.insert(billingTriggers).values([
    {
      name: 'Retainer at kick-off',
      triggerEvent: 'retainer_due',
      amountCalculation: 'percent_of_budget',
      amountPercent: '15',
      amountBasis: 'project_budget',
      descriptionTemplate: 'Initial retainer — 15% of project budget',
      active: true
    },
    {
      name: 'Procurement deposit on PO issue',
      triggerEvent: 'supplier_deposit_required',
      amountCalculation: 'percent_of_pos',
      amountPercent: '50',
      amountBasis: 'po_total',
      descriptionTemplate: '50% deposit on issued PO',
      active: true
    },
    {
      name: 'PO issuance bill-back',
      triggerEvent: 'po_issued',
      amountCalculation: 'percent_of_pos',
      amountPercent: '100',
      amountBasis: 'po_total',
      descriptionTemplate: 'Recover PO value at issuance (Procurement and Resale role)',
      active: true
    },
    {
      name: 'Goods shipped',
      triggerEvent: 'goods_shipped',
      amountCalculation: 'fixed',
      amountValue: '0',
      descriptionTemplate: 'Trigger for shipped goods (manual amount on review)',
      active: true
    }
  ]);

  // ── Sample invoices on the Tromsø project ───────────────────────────
  // Paid retainer
  const [inv1] = await db.insert(invoices).values({
    reference: 'INV-0142-01',
    projectId: project.id,
    clientId: client.id,
    status: 'paid',
    currency: 'NOK',
    issueDate: '2026-03-15',
    dueDate: '2026-04-14',
    sentAt: new Date('2026-03-15T14:00:00Z'),
    paidAt: new Date('2026-03-28T09:30:00Z'),
    vatRate: '25.00',
    subtotalNet: '238400',
    vatAmount: '59600',
    totalGross: '298000',
    amountPaid: '298000',
    balanceDue: '0',
    triggeredByEvent: 'retainer_due',
    notes: 'Retainer + initial discovery phase',
    terms: 'Net 30 days. Bank: 1234.56.78901',
    createdBy: user?.id ?? '00000000-0000-0000-0000-000000000001'
  }).returning();

  if (inv1) {
    await db.insert(invoiceLines).values([
      {
        invoiceId: inv1.id,
        description: 'Project retainer (15% of approved budget)',
        quantity: '1', unitPrice: '180000', lineTotal: '180000',
        milestoneType: 'retainer', displayOrder: 0
      },
      {
        invoiceId: inv1.id,
        description: 'Discovery & concept design phase',
        quantity: '1', unitPrice: '58400', lineTotal: '58400',
        milestoneType: 'design_phase', displayOrder: 1
      }
    ]);
    await db.insert(payments).values({
      reference: 'PAY-0142-01-01',
      invoiceId: inv1.id,
      amount: '298000', currency: 'NOK',
      receivedDate: '2026-03-28', clearedDate: '2026-03-29',
      method: 'bank_transfer', status: 'cleared',
      bankReference: 'DNB-2026-03-28-145',
      recordedBy: user?.id ?? '00000000-0000-0000-0000-000000000001'
    });
  }

  // Partially paid spec milestone
  const [inv2] = await db.insert(invoices).values({
    reference: 'INV-0142-02',
    projectId: project.id,
    clientId: client.id,
    status: 'partially_paid',
    currency: 'NOK',
    issueDate: '2026-05-18',
    dueDate: '2026-06-17',
    sentAt: new Date('2026-05-18T10:00:00Z'),
    vatRate: '25.00',
    subtotalNet: '432000',
    vatAmount: '108000',
    totalGross: '540000',
    amountPaid: '380000',
    balanceDue: '160000',
    triggeredByEvent: 'scope_signed',
    notes: 'Specification phase complete — FF&E schedule + bespoke specs locked',
    createdBy: user?.id ?? '00000000-0000-0000-0000-000000000001'
  }).returning();

  if (inv2) {
    await db.insert(invoiceLines).values({
      invoiceId: inv2.id,
      description: 'Specification milestone — FF&E + bespoke specs',
      quantity: '1', unitPrice: '432000', lineTotal: '432000',
      milestoneType: 'specification', displayOrder: 0
    });
    await db.insert(payments).values({
      reference: 'PAY-0142-02-01',
      invoiceId: inv2.id,
      amount: '380000', currency: 'NOK',
      receivedDate: '2026-05-28',
      method: 'bank_transfer', status: 'received',
      bankReference: 'DNB-2026-05-28-202',
      recordedBy: user?.id ?? '00000000-0000-0000-0000-000000000001'
    });
  }

  // Issued (unpaid) — recent procurement bill-back
  await db.insert(invoices).values({
    reference: 'INV-0142-03',
    projectId: project.id,
    clientId: client.id,
    status: 'issued',
    currency: 'NOK',
    issueDate: '2026-05-30',
    dueDate: '2026-06-29',
    vatRate: '25.00',
    subtotalNet: '142020',
    vatAmount: '35505',
    totalGross: '177525',
    amountPaid: '0',
    balanceDue: '177525',
    triggeredByEvent: 'po_issued',
    notes: 'Procurement deposit — Akustikkmiljø PO',
    createdBy: user?.id ?? '00000000-0000-0000-0000-000000000001'
  }).returning();

  console.log('✅ Seed complete.');
  console.log('   Created 1 client, 4 leads, 2 projects, 1 package, 1 item,');
  console.log('   1 scope baseline (with v1 draft), 1 sample approval (sent),');
  console.log('   4 billing triggers, 3 invoices (1 paid, 1 partial, 1 issued), 2 payments.');
  console.log('   Visit /projects to see them rendered.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
