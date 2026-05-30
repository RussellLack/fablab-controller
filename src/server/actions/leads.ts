'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import {
  db, leads, clients, projects, scopeBaselines, scopeBaselineVersions
} from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import { leadDraftSchema, leadCompleteSchema, missingIntakeFields } from '@/lib/validations/lead';

type ActionResult = { ok: true; id?: string; url?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Helper — current authed user's id (for ownerId / audit). */
async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Helper — generate the next lead reference like LEAD-2026-0042. */
async function nextLeadReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM leads WHERE reference LIKE ${'LEAD-' + year + '-%'}`
  );
  return `LEAD-${year}-${String(row?.next ?? 1).padStart(4, '0')}`;
}

/** Helper — next project reference like FD-2026-0142. */
async function nextProjectReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM projects WHERE reference LIKE ${'FD-' + year + '-%'}`
  );
  return `FD-${year}-${String(row?.next ?? 1).padStart(4, '0')}`;
}

/** Create a new lead. Form-action shape (FormData → Result). */
export async function createLead(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  // Coerce the form values into the loose schema (every field optional)
  const raw = Object.fromEntries(formData.entries());
  const parsed = leadDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const reference = await nextLeadReference();
  const [row] = await db.insert(leads).values({
    reference,
    source: parsed.data.source ?? 'direct_inquiry',
    status: 'new',
    ownerId: userId,
    prospectiveClientName: parsed.data.prospectiveClientName ?? null,
    clientKind: parsed.data.clientKind ?? null,
    primaryContactName: parsed.data.primaryContactName ?? null,
    primaryContactEmail: parsed.data.primaryContactEmail || null,
    primaryContactPhone: parsed.data.primaryContactPhone ?? null,
    propertyAddress: parsed.data.propertyAddress ?? null,
    projectType: parsed.data.projectType ?? null,
    roomsOrZones: parsed.data.roomsOrZones ?? null,
    desiredOutcome: parsed.data.desiredOutcome ?? null,
    budgetExpectation: parsed.data.budgetExpectation?.toString() ?? null,
    budgetCurrency: parsed.data.budgetCurrency ?? 'NOK',
    timelineExpectation: parsed.data.timelineExpectation ?? null,
    decisionMakers: parsed.data.decisionMakers ?? null,
    approvalProcess: parsed.data.approvalProcess ?? null,
    existingSuppliers: parsed.data.existingSuppliers ?? null,
    knownConstraints: parsed.data.knownConstraints ?? null,
    designStylePreferences: parsed.data.designStylePreferences ?? null,
    procurementExpectations: parsed.data.procurementExpectations ?? null,
    deliveryInstallExpectations: parsed.data.deliveryInstallExpectations ?? null,
    fablabExpectedRole: parsed.data.fablabExpectedRole ?? null,
    notes: parsed.data.notes ?? null
  }).returning({ id: leads.id });

  revalidatePath('/leads');
  if (!row) return { ok: false, error: 'Insert failed' };
  redirect(`/leads/${row.id}`);
}

/** Update an existing lead (autosave or explicit save). */
export async function updateLead(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = leadDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  await db.update(leads).set({
    prospectiveClientName: parsed.data.prospectiveClientName ?? null,
    clientKind: parsed.data.clientKind ?? null,
    primaryContactName: parsed.data.primaryContactName ?? null,
    primaryContactEmail: parsed.data.primaryContactEmail || null,
    primaryContactPhone: parsed.data.primaryContactPhone ?? null,
    propertyAddress: parsed.data.propertyAddress ?? null,
    projectType: parsed.data.projectType ?? null,
    roomsOrZones: parsed.data.roomsOrZones ?? null,
    desiredOutcome: parsed.data.desiredOutcome ?? null,
    budgetExpectation: parsed.data.budgetExpectation?.toString() ?? null,
    budgetCurrency: parsed.data.budgetCurrency ?? 'NOK',
    timelineExpectation: parsed.data.timelineExpectation ?? null,
    decisionMakers: parsed.data.decisionMakers ?? null,
    approvalProcess: parsed.data.approvalProcess ?? null,
    existingSuppliers: parsed.data.existingSuppliers ?? null,
    knownConstraints: parsed.data.knownConstraints ?? null,
    designStylePreferences: parsed.data.designStylePreferences ?? null,
    procurementExpectations: parsed.data.procurementExpectations ?? null,
    deliveryInstallExpectations: parsed.data.deliveryInstallExpectations ?? null,
    fablabExpectedRole: parsed.data.fablabExpectedRole ?? null,
    notes: parsed.data.notes ?? null,
    updatedAt: new Date()
  }).where(eq(leads.id, id));

  revalidatePath(`/leads/${id}`);
  revalidatePath('/leads');
  return { ok: true, id };
}

/**
 * THE GATE. Converts a Lead to a Project.
 *
 * Enforces Rule R1 from `00-industry-best-practices.md`:
 *   "No active project work without structured intake"
 *
 * Refuses if any of the 16 required intake fields is empty. On success:
 *   1. Creates or matches a Client
 *   2. Creates a Project (with lead_id back-reference)
 *   3. Creates a ScopeBaseline + initial draft Version seeded from lead notes
 *   4. Updates the Lead to status = converted with FK to the new Project
 */
export async function convertLeadToProject(leadId: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { ok: false, error: 'Lead not found' };
  if (lead.status === 'converted') return { ok: false, error: 'Lead already converted' };

  // The gate — server-side enforcement, independent of any UI check
  const missing = missingIntakeFields(lead as unknown as Record<string, unknown>);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Intake incomplete — ${missing.length} required field(s) missing`,
      fieldErrors: { _form: missing }
    };
  }

  // Belt + braces: full schema validation
  const complete = leadCompleteSchema.safeParse(lead);
  if (!complete.success) {
    return { ok: false, error: 'Lead fails complete-schema validation', fieldErrors: complete.error.flatten().fieldErrors };
  }

  // ── 1. Find or create the client ─────────────────────────────────
  let clientId: string;
  const [existing] = await db.select({ id: clients.id })
    .from(clients)
    .where(eq(clients.name, lead.prospectiveClientName!))
    .limit(1);

  if (existing) {
    clientId = existing.id;
  } else {
    const [newClient] = await db.insert(clients).values({
      name: lead.prospectiveClientName!,
      kind: lead.clientKind!,
      primaryContactName: lead.primaryContactName,
      primaryContactEmail: lead.primaryContactEmail,
      primaryContactPhone: lead.primaryContactPhone,
      billingAddress: lead.propertyAddress
    }).returning({ id: clients.id });
    if (!newClient) return { ok: false, error: 'Failed to create client' };
    clientId = newClient.id;
  }

  // ── 2. Create the project ────────────────────────────────────────
  const reference = await nextProjectReference();
  const [project] = await db.insert(projects).values({
    reference,
    title: `${lead.prospectiveClientName} — ${(lead.desiredOutcome ?? '').slice(0, 80)}`,
    description: lead.desiredOutcome,
    clientId,
    leadId: lead.id,
    projectType: lead.projectType!,
    fablabRole: lead.fablabExpectedRole!,
    currentStage: 'brief',
    currentOwnerId: userId,
    siteAddress: lead.propertyAddress,
    priority: 'normal',
    budget: lead.budgetExpectation,
    budgetCurrency: lead.budgetCurrency ?? 'NOK',
    vatRate: '25.00'
  }).returning({ id: projects.id });

  if (!project) return { ok: false, error: 'Failed to create project' };

  // ── 3. Create the initial ScopeBaseline + draft v1 ───────────────
  const [baseline] = await db.insert(scopeBaselines).values({
    projectId: project.id
  }).returning({ id: scopeBaselines.id });

  if (baseline) {
    const [version] = await db.insert(scopeBaselineVersions).values({
      scopeBaselineId: baseline.id,
      versionNumber: 1,
      status: 'draft',
      createdBy: userId,
      // Seed from lead notes — designer fleshes out later
      projectAreas: lead.roomsOrZones,
      timelineAssumptions: lead.timelineExpectation,
      budgetAssumptions: `Intake budget ${lead.budgetExpectation} ${lead.budgetCurrency ?? 'NOK'}`,
      procurementResponsibilities: lead.procurementExpectations
    }).returning({ id: scopeBaselineVersions.id });

    if (version) {
      await db.update(scopeBaselines)
        .set({ currentVersionId: version.id })
        .where(eq(scopeBaselines.id, baseline.id));
      await db.update(projects)
        .set({ currentScopeBaselineId: baseline.id })
        .where(eq(projects.id, project.id));
    }
  }

  // ── 4. Mark the lead converted ───────────────────────────────────
  await db.update(leads).set({
    status: 'converted',
    convertedProjectId: project.id,
    updatedAt: new Date()
  }).where(eq(leads.id, lead.id));

  revalidatePath('/leads');
  revalidatePath('/projects');
  return { ok: true, id: project.id, url: `/projects/${project.id}` };
}

/** Mark a lead as lost with a reason. */
export async function markLeadAsLost(leadId: string, reason: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  await db.update(leads).set({
    status: 'lost',
    lostReason: reason as 'no_response' | 'budget_mismatch' | 'timing' | 'competitor_won' | 'out_of_scope' | 'other',
    lostAt: new Date(),
    updatedAt: new Date()
  }).where(eq(leads.id, leadId));

  revalidatePath('/leads');
  return { ok: true, id: leadId };
}
