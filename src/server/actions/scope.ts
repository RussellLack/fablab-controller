'use server';

import { revalidatePath } from 'next/cache';
import { eq, desc, max, and } from 'drizzle-orm';
import { db, scopeBaselines, scopeBaselineVersions } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

type ActionResult =
  | { ok: true; scopeBaselineVersionId?: string; versionNumber?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Atomic create of a new draft scope baseline version.
 *
 * Per `00-industry-best-practices.md` §4 and `21-ux-design.md` Phase 2
 * decision #2, the Scope gate is satisfied when at least one
 * scope_baseline_version has status='approved'. This action creates a
 * DRAFT — the version then needs to be approved via the existing
 * Approvals workflow (target = scope_baseline_version_id).
 *
 * If the project has no scope_baselines row yet, one is created first;
 * otherwise we append a new version with versionNumber = max(existing) + 1.
 */
export async function createScopeVersionAtomic(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  // Pull the 15 scope fields out of FormData. Arrays come through as
  // multiple values under the same key; the wizard appends one per
  // entry already trimmed and empty-filtered client-side.
  const projectAreas = formData.get('projectAreas')?.toString().trim() || null;
  const roomsOrZonesRaw = formData.getAll('roomsOrZones').map(String).filter(Boolean);
  const includedServices = formData.getAll('includedServices').map(String).filter(Boolean);
  const excludedServices = formData.getAll('excludedServices').map(String).filter(Boolean);
  const deliverables = formData.getAll('deliverables').map(String).filter(Boolean);
  const designOutputs = formData.getAll('designOutputs').map(String).filter(Boolean);
  const procurementResponsibilities =
    formData.get('procurementResponsibilities')?.toString().trim() || null;
  const supplierCoordinationResponsibilities =
    formData.get('supplierCoordinationResponsibilities')?.toString().trim() || null;
  const siteVisitExpectations =
    formData.get('siteVisitExpectations')?.toString().trim() || null;
  const meetingExpectations =
    formData.get('meetingExpectations')?.toString().trim() || null;
  const timelineAssumptions =
    formData.get('timelineAssumptions')?.toString().trim() || null;
  const budgetAssumptions = formData.get('budgetAssumptions')?.toString().trim() || null;
  const clientResponsibilities =
    formData.get('clientResponsibilities')?.toString().trim() || null;
  const approvalGates = formData.getAll('approvalGates').map(String).filter(Boolean);
  const knownDependencies = formData.get('knownDependencies')?.toString().trim() || null;

  try {
    // Ensure a scope_baselines row exists for this project
    let [baseline] = await db
      .select()
      .from(scopeBaselines)
      .where(eq(scopeBaselines.projectId, projectId))
      .limit(1);

    if (!baseline) {
      const [created] = await db
        .insert(scopeBaselines)
        .values({ projectId })
        .returning();
      baseline = created;
    }
    if (!baseline) return { ok: false, error: 'Could not create scope baseline' };

    // Next version number
    const [maxRow] = await db
      .select({ max: max(scopeBaselineVersions.versionNumber) })
      .from(scopeBaselineVersions)
      .where(eq(scopeBaselineVersions.scopeBaselineId, baseline.id));
    const nextVersionNumber = (maxRow?.max ?? 0) + 1;

    const [version] = await db
      .insert(scopeBaselineVersions)
      .values({
        scopeBaselineId: baseline.id,
        versionNumber: nextVersionNumber,
        status: 'draft',
        createdBy: userId,
        projectAreas,
        roomsOrZones: roomsOrZonesRaw, // jsonb — store as string array for v1
        includedServices: includedServices.length ? includedServices : null,
        excludedServices: excludedServices.length ? excludedServices : null,
        deliverables: deliverables.length ? deliverables : null,
        designOutputs: designOutputs.length ? designOutputs : null,
        procurementResponsibilities,
        supplierCoordinationResponsibilities,
        siteVisitExpectations,
        meetingExpectations,
        timelineAssumptions,
        budgetAssumptions,
        clientResponsibilities,
        approvalGates: approvalGates.length ? approvalGates : null,
        knownDependencies
      })
      .returning({ id: scopeBaselineVersions.id, versionNumber: scopeBaselineVersions.versionNumber });

    if (!version) return { ok: false, error: 'Insert failed' };

    revalidatePath(`/projects/${projectId}/scope`);
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: true,
      scopeBaselineVersionId: version.id,
      versionNumber: version.versionNumber
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error creating scope version'
    };
  }
}
