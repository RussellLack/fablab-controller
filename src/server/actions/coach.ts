'use server';

import { revalidatePath } from 'next/cache';
import { db, projectEvidenceNotes, timeEntries } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

/**
 * Project Coach drawer wizard — server actions for MVP-B
 * (see `28-project-coaching-layer.md` §4 and §7.3).
 *
 * The wizard's Step 5 commits one or both of:
 *   - a `project_evidence_notes` row carrying the structured note
 *     for the next Work Evidence Summary;
 *   - a `time_entries` row pre-filled with the wizard's customer-
 *     visible summary and commercial reason.
 *
 * Both writes happen inside `createCoachEvidence` so the user
 * commits the wizard once and walks away — there is no "save the
 * note, now also create a time entry" two-step.
 */

type ActionResult =
  | { ok: true; evidenceId?: string; timeEntryId?: string }
  | { ok: false; error: string };

const EVIDENCE_CATEGORIES = [
  'design_progress',
  'project_coordination',
  'decisions_and_approvals',
  'budget_and_scope_control',
  'risks_and_issues',
  'customer_actions_needed',
  'handover'
] as const;
type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

const SOURCE_TYPES = [
  'coach_wizard',
  'time_entry',
  'approval',
  'change_order',
  'customer_comment',
  'scope_update',
  'procurement_event',
  'delivery_event',
  'handover_event',
  'manual'
] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

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

function isChargeable(status: Chargeability | null): boolean {
  if (!status) return true;
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
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/coach`);
  revalidatePath('/time');
  revalidatePath('/dashboard');
}

/**
 * Compute the ISO week containing a given date as [Monday, Sunday]
 * YYYY-MM-DD strings. Decision #2 sets weekly as the default
 * reporting period.
 */
function isoWeekRange(yyyymmdd: string): { start: string; end: string } {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10)
  };
}

/**
 * Atomic Step-5 commit: writes an evidence note and (optionally) a
 * pre-filled time entry derived from the same wizard state.
 *
 * Form fields:
 *   projectId, occurredOn (workDate of the linked work, YYYY-MM-DD)
 *   evidenceCategory, sourceType, sourceId (optional)
 *   internalNote (required), customerSummary (optional)
 *   includeInReport (checkbox)
 *
 *   alsoCreateTimeEntry (checkbox)
 *   timeEntryHours, timeEntryStage, timeEntryCategory,
 *   timeEntryChargeability
 *
 * If the time-entry side-effect is requested the action validates
 * its fields too and writes both rows. Failure on either rolls back
 * conceptually (we write the time entry first; if the evidence note
 * insert fails we delete the time entry). For v1 we accept the rare
 * race and surface a clear error to the user.
 */
export async function createCoachEvidence(
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const projectId = (formData.get('projectId')?.toString() ?? '').trim();
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return { ok: false, error: 'Project is required' };
  }

  const occurredOnRaw = (formData.get('occurredOn')?.toString() ?? '').trim();
  const occurredOn = /^\d{4}-\d{2}-\d{2}$/.test(occurredOnRaw)
    ? occurredOnRaw
    : new Date().toISOString().slice(0, 10);
  const period = isoWeekRange(occurredOn);

  const categoryRaw = (formData.get('evidenceCategory')?.toString() ?? '').trim();
  if (!EVIDENCE_CATEGORIES.includes(categoryRaw as EvidenceCategory)) {
    return { ok: false, error: 'Pick an evidence category' };
  }
  const evidenceCategory = categoryRaw as EvidenceCategory;

  const sourceTypeRaw = (formData.get('sourceType')?.toString() ?? 'coach_wizard').trim();
  const sourceType: SourceType = SOURCE_TYPES.includes(sourceTypeRaw as SourceType)
    ? (sourceTypeRaw as SourceType)
    : 'coach_wizard';
  const sourceIdRaw = formData.get('sourceId')?.toString().trim() || null;
  const sourceId =
    sourceIdRaw && /^[0-9a-f-]{36}$/i.test(sourceIdRaw) ? sourceIdRaw : null;

  const internalNote = (formData.get('internalNote')?.toString() ?? '').trim();
  if (!internalNote) {
    return { ok: false, error: 'Internal note is required.' };
  }
  const customerSummary =
    formData.get('customerSummary')?.toString().trim() || null;
  const includeInReport = formData.get('includeInReport') !== 'off';

  const alsoCreateTimeEntry = formData.get('alsoCreateTimeEntry') === 'on';

  let createdTimeEntryId: string | undefined;

  try {
    if (alsoCreateTimeEntry) {
      const hoursRaw = (formData.get('timeEntryHours')?.toString() ?? '').trim();
      const hours = Number(hoursRaw);
      if (!hoursRaw || Number.isNaN(hours) || hours <= 0 || hours > 24) {
        return { ok: false, error: 'Hours must be a positive number, at most 24.' };
      }
      const stageRaw = (formData.get('timeEntryStage')?.toString() ?? '').trim();
      if (!PROJECT_STAGES.includes(stageRaw as ProjectStage)) {
        return { ok: false, error: 'Time entry stage is invalid' };
      }
      const teCategoryRaw = (formData.get('timeEntryCategory')?.toString() ?? '').trim();
      if (!WORK_CATEGORIES.includes(teCategoryRaw as WorkCategory)) {
        return { ok: false, error: 'Time entry category is invalid' };
      }
      const chargeRaw = (formData.get('timeEntryChargeability')?.toString() ?? '').trim();
      const chargeability: Chargeability | null = CHARGEABILITY.includes(
        chargeRaw as Chargeability
      )
        ? (chargeRaw as Chargeability)
        : null;

      const [teRow] = await db
        .insert(timeEntries)
        .values({
          projectId,
          userId,
          stage: stageRaw as ProjectStage,
          category: teCategoryRaw as WorkCategory,
          workDate: occurredOn,
          hours: hours.toString(),
          note: null,
          chargeable: isChargeable(chargeability),
          chargeableToChangeOrderId: null,

          // Coach pre-fill — the wizard's structured outputs land directly
          // in the time entry so the staff don't re-type.
          commercialReason: internalNote,
          customerVisibleSummary: customerSummary,
          chargeabilityStatus: chargeability,
          linkedObjectType: sourceType,
          linkedObjectId: sourceId,
          reportable: includeInReport
        })
        .returning({ id: timeEntries.id });
      createdTimeEntryId = teRow?.id;
    }

    const [noteRow] = await db
      .insert(projectEvidenceNotes)
      .values({
        projectId,
        sourceType: createdTimeEntryId ? 'time_entry' : sourceType,
        sourceId: createdTimeEntryId ?? sourceId,
        evidenceCategory,
        internalNote,
        customerSummary,
        reportingPeriodStart: period.start,
        reportingPeriodEnd: period.end,
        includeInReport,
        createdBy: userId
      })
      .returning({ id: projectEvidenceNotes.id });

    refreshSurfaces(projectId);
    return {
      ok: true,
      evidenceId: noteRow?.id,
      timeEntryId: createdTimeEntryId
    };
  } catch (err) {
    // If the note insert failed after we wrote a time entry, try to
    // undo it. Race-resistant enough for v1; cleaner transactional
    // handling lands in MVP-D if it becomes a real concern.
    if (createdTimeEntryId) {
      try {
        await db.delete(timeEntries).where(
          // dynamic import to avoid an additional top-level eq() import
          // — just-in-time eq() avoids the dead-code warning if we don't
          // hit this branch.
          (await import('drizzle-orm')).eq(timeEntries.id, createdTimeEntryId)
        );
      } catch {
        // Best-effort. The orphan time entry surfaces in /time and can
        // be deleted manually.
      }
    }
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unknown error creating evidence note'
    };
  }
}
