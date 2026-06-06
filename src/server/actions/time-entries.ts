'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, timeEntries } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

/**
 * Time-entry server actions — foundational data layer for the Project
 * Coaching layer (see `28-project-coaching-layer.md` MVP-A).
 *
 * Doctrine: every entry carries the Coaching uplift — `commercialReason`
 * (internal "why we did this work") + `customerVisibleSummary` (the
 * cleaned external phrasing) — alongside the existing raw `note` and
 * the new `chargeabilityStatus` classification.
 *
 * The legacy `chargeable` boolean is derived from `chargeabilityStatus`
 * to keep both in sync: included / chargeable / change-territory mean
 * `chargeable = true`; goodwill / internal / rework-* mean
 * `chargeable = false`.
 */

type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const WORK_CATEGORIES = [
  'design_work',
  'client_meetings',
  'procurement',
  'supplier_coordination',
  'freight_customs',
  'site_visits',
  'install_coordination',
  'admin',
  'rework',
  'change_requests',
  'non_billable_goodwill'
] as const;
type WorkCategory = (typeof WORK_CATEGORIES)[number];

const PROJECT_STAGES = [
  'brief',
  'concept',
  'design_development',
  'specification',
  'procurement_production',
  'installation',
  'handover',
  'on_hold',
  'cancelled',
  'archived',
  'in_dispute'
] as const;
type ProjectStage = (typeof PROJECT_STAGES)[number];

const CHARGEABILITY = [
  'included',
  'chargeable',
  'change',
  'out_of_scope_approval_needed',
  'goodwill',
  'internal_admin',
  'rework_fablab',
  'rework_customer',
  'rework_supplier'
] as const;
type Chargeability = (typeof CHARGEABILITY)[number];

/** Derive the legacy boolean `chargeable` from the richer classification. */
function isChargeable(status: Chargeability | null): boolean {
  if (!status) return true; // unset → conservative default (existing column NOT NULL default true)
  return status === 'included' || status === 'chargeable' || status === 'change';
}

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function refreshSurfaces(projectId: string) {
  revalidatePath('/time');
  revalidatePath(`/time?project=${projectId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/dashboard`); // Today STATS may shift
}

/**
 * Create a new time entry. Field shape mirrors the form:
 *   projectId, workDate (YYYY-MM-DD), hours, stage, category,
 *   note (raw description), commercialReason, customerVisibleSummary,
 *   chargeabilityStatus, nonChargeableReason, linkedObjectType,
 *   linkedObjectId, reportable.
 */
export async function createTimeEntry(
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const projectId = (formData.get('projectId')?.toString() ?? '').trim();
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return {
      ok: false,
      error: 'Project is required',
      fieldErrors: { projectId: ['Pick a project'] }
    };
  }

  const workDate = (formData.get('workDate')?.toString() ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { ok: false, error: 'Date must be YYYY-MM-DD' };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (workDate > today) {
    return { ok: false, error: 'Date cannot be in the future' };
  }

  const hoursRaw = (formData.get('hours')?.toString() ?? '').trim();
  const hours = Number(hoursRaw);
  if (!hoursRaw || Number.isNaN(hours) || hours <= 0 || hours > 24) {
    return {
      ok: false,
      error: 'Hours must be a positive number, at most 24',
      fieldErrors: { hours: ['0 < hours ≤ 24'] }
    };
  }

  const stageRaw = (formData.get('stage')?.toString() ?? '').trim();
  if (!PROJECT_STAGES.includes(stageRaw as ProjectStage)) {
    return { ok: false, error: 'Project stage is invalid' };
  }
  const stage = stageRaw as ProjectStage;

  const categoryRaw = (formData.get('category')?.toString() ?? '').trim();
  if (!WORK_CATEGORIES.includes(categoryRaw as WorkCategory)) {
    return { ok: false, error: 'Work category is invalid' };
  }
  const category = categoryRaw as WorkCategory;

  const note = formData.get('note')?.toString().trim() || null;
  const commercialReason = formData.get('commercialReason')?.toString().trim() || null;
  const customerVisibleSummary =
    formData.get('customerVisibleSummary')?.toString().trim() || null;

  const chargeabilityRaw = (formData.get('chargeabilityStatus')?.toString() ?? '').trim();
  const chargeabilityStatus: Chargeability | null = CHARGEABILITY.includes(
    chargeabilityRaw as Chargeability
  )
    ? (chargeabilityRaw as Chargeability)
    : null;

  const nonChargeableReason =
    formData.get('nonChargeableReason')?.toString().trim() || null;

  // Polymorphic link (optional)
  const linkedObjectTypeRaw =
    formData.get('linkedObjectType')?.toString().trim() || null;
  const linkedObjectIdRaw =
    formData.get('linkedObjectId')?.toString().trim() || null;
  const linkedObjectType = linkedObjectTypeRaw || null;
  const linkedObjectId =
    linkedObjectIdRaw && /^[0-9a-f-]{36}$/i.test(linkedObjectIdRaw)
      ? linkedObjectIdRaw
      : null;

  const reportable = formData.get('reportable') !== 'off';
  const chargeable = isChargeable(chargeabilityStatus);

  try {
    const [row] = await db
      .insert(timeEntries)
      .values({
        projectId,
        userId,
        stage,
        category,
        workDate,
        hours: hours.toString(),
        note,
        chargeable,
        nonChargeableReason,
        chargeableToChangeOrderId: null,

        // Coaching uplift
        commercialReason,
        customerVisibleSummary,
        chargeabilityStatus,
        linkedObjectType,
        linkedObjectId,
        reportable
      })
      .returning({ id: timeEntries.id });

    refreshSurfaces(projectId);
    return { ok: true, id: row?.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unknown error creating time entry'
    };
  }
}

/**
 * Update an existing entry. Author-only: a user can only edit time
 * entries they themselves logged. Reportable entries that have already
 * been included in a sent Work Evidence Summary should be uneditable;
 * that check lands in MVP-E once `included_in_report_at` is wired —
 * for v1 we accept the edit and log it.
 */
export async function updateTimeEntry(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({
      userId: timeEntries.userId,
      projectId: timeEntries.projectId
    })
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: 'Time entry not found' };
  if (existing.userId !== userId) {
    return { ok: false, error: 'You can only edit your own time entries' };
  }

  // We reuse the create validation. For brevity the duplication is
  // tolerable — if it grows we'll extract a parseTimeEntryForm helper.
  const workDate = (formData.get('workDate')?.toString() ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { ok: false, error: 'Date must be YYYY-MM-DD' };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (workDate > today) {
    return { ok: false, error: 'Date cannot be in the future' };
  }
  const hoursRaw = (formData.get('hours')?.toString() ?? '').trim();
  const hours = Number(hoursRaw);
  if (!hoursRaw || Number.isNaN(hours) || hours <= 0 || hours > 24) {
    return { ok: false, error: 'Hours must be a positive number, at most 24' };
  }
  const stageRaw = (formData.get('stage')?.toString() ?? '').trim();
  if (!PROJECT_STAGES.includes(stageRaw as ProjectStage)) {
    return { ok: false, error: 'Project stage is invalid' };
  }
  const categoryRaw = (formData.get('category')?.toString() ?? '').trim();
  if (!WORK_CATEGORIES.includes(categoryRaw as WorkCategory)) {
    return { ok: false, error: 'Work category is invalid' };
  }

  const note = formData.get('note')?.toString().trim() || null;
  const commercialReason = formData.get('commercialReason')?.toString().trim() || null;
  const customerVisibleSummary =
    formData.get('customerVisibleSummary')?.toString().trim() || null;
  const chargeabilityRaw = (formData.get('chargeabilityStatus')?.toString() ?? '').trim();
  const chargeabilityStatus: Chargeability | null = CHARGEABILITY.includes(
    chargeabilityRaw as Chargeability
  )
    ? (chargeabilityRaw as Chargeability)
    : null;
  const nonChargeableReason =
    formData.get('nonChargeableReason')?.toString().trim() || null;
  const linkedObjectTypeRaw =
    formData.get('linkedObjectType')?.toString().trim() || null;
  const linkedObjectIdRaw =
    formData.get('linkedObjectId')?.toString().trim() || null;
  const reportable = formData.get('reportable') !== 'off';
  const chargeable = isChargeable(chargeabilityStatus);

  await db
    .update(timeEntries)
    .set({
      stage: stageRaw as ProjectStage,
      category: categoryRaw as WorkCategory,
      workDate,
      hours: hours.toString(),
      note,
      chargeable,
      nonChargeableReason,
      commercialReason,
      customerVisibleSummary,
      chargeabilityStatus,
      linkedObjectType: linkedObjectTypeRaw,
      linkedObjectId:
        linkedObjectIdRaw && /^[0-9a-f-]{36}$/i.test(linkedObjectIdRaw)
          ? linkedObjectIdRaw
          : null,
      reportable,
      updatedAt: new Date()
    })
    .where(eq(timeEntries.id, id));

  refreshSurfaces(existing.projectId);
  return { ok: true, id };
}

/** Author-only delete. */
export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({
      userId: timeEntries.userId,
      projectId: timeEntries.projectId
    })
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: 'Time entry not found' };
  if (existing.userId !== userId) {
    return { ok: false, error: 'You can only delete your own time entries' };
  }

  await db.delete(timeEntries).where(eq(timeEntries.id, id));
  refreshSurfaces(existing.projectId);
  return { ok: true };
}
