'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db, riskItems } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

/**
 * Risk register server actions (module #11 in `00-` §18).
 *
 * Doctrine: risks are first-class. Naming a risk and assigning it an
 * owner and a band is half the mitigation. The register stays open
 * across the project lifecycle — it's a transverse module, not a gate.
 *
 * Lifecycle (per `riskStatusEnum`):
 *
 *   identified → assessed → mitigation_planned → mitigation_in_progress
 *                                              → mitigated → closed
 *                                              ↘ accepted → closed
 *                                              ↘ realised → linked Issue
 *
 * Score is computed at write time as `likelihood * impact` and bucketed
 * into low/medium/high/critical via the `bandFromScore` helper. Both
 * dimensions are 1–5 integer scales (per common project-risk practice
 * — 1 = remote / negligible, 5 = highly likely / catastrophic).
 */

type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const CATEGORIES = [
  'scope_risk',
  'budget_risk',
  'supplier_risk',
  'freight_risk',
  'customs_risk',
  'site_readiness_risk',
  'client_approval_risk',
  'payment_risk',
  'installation_risk',
  'quality_risk',
  'legal_contract_risk',
  'margin_risk',
  'reputation_risk'
] as const;
type Category = (typeof CATEGORIES)[number];

type Band = 'low' | 'medium' | 'high' | 'critical';

function bandFromScore(score: number): Band {
  // 1–5 × 1–5 = 1..25. The thresholds match common heat-map practice.
  if (score >= 16) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

function clampLI(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(5, Math.trunc(n)));
}

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function refreshSurfaces(projectId: string, riskId?: string) {
  revalidatePath(`/projects/${projectId}/risk`);
  if (riskId) revalidatePath(`/projects/${projectId}/risk/${riskId}`);
  revalidatePath(`/dashboard`);
}

/** Next risk reference, RISK-YYYY-NNN. Year-scoped sequence. */
async function nextRiskReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM risk_items WHERE reference LIKE ${'RISK-' + year + '-%'}`
  );
  return `RISK-${year}-${String(row?.next ?? 1).padStart(3, '0')}`;
}

/* ─────────────────────────── CREATE ─────────────────────────── */

export async function createRisk(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const title = (formData.get('title')?.toString() ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required' };
  if (title.length > 300) return { ok: false, error: 'Title too long' };

  const categoryRaw = (formData.get('category')?.toString() ?? '').trim();
  if (!CATEGORIES.includes(categoryRaw as Category)) {
    return { ok: false, error: 'Invalid category' };
  }
  const category = categoryRaw as Category;

  const description = formData.get('description')?.toString().trim() || null;

  const likelihood = clampLI(Number(formData.get('likelihood')?.toString() ?? '1'));
  const impact = clampLI(Number(formData.get('impact')?.toString() ?? '1'));
  const score = likelihood * impact;
  const scoreBand = bandFromScore(score);

  const ownerIdRaw = formData.get('ownerId')?.toString().trim() || null;
  // Lightweight UUID sniff — if it's a UUID we accept it; if not, null.
  const ownerId =
    ownerIdRaw && /^[0-9a-f-]{36}$/i.test(ownerIdRaw) ? ownerIdRaw : null;

  const mitigationAction = formData.get('mitigationAction')?.toString().trim() || null;
  const mitigationDueRaw = (formData.get('mitigationDueDate')?.toString() ?? '').trim();
  const mitigationDueDate =
    mitigationDueRaw && /^\d{4}-\d{2}-\d{2}$/.test(mitigationDueRaw)
      ? mitigationDueRaw
      : null;

  // A risk with a mitigation action and a due date starts at
  // mitigation_planned. A risk with no plan starts at identified.
  const startStatus = mitigationAction ? 'mitigation_planned' : 'identified';

  try {
    const reference = await nextRiskReference();
    const [row] = await db
      .insert(riskItems)
      .values({
        reference,
        projectId,
        category,
        title,
        description,
        likelihood,
        impact,
        score,
        scoreBand,
        ownerId,
        mitigationAction,
        mitigationDueDate,
        status: startStatus,
        identifiedByUserId: userId
      })
      .returning({ id: riskItems.id });

    refreshSurfaces(projectId, row?.id);
    return { ok: true, id: row?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error creating risk'
    };
  }
}

/* ─────────────────────────── ASSESSMENT / RE-ASSESS ─────────────────────────── */

/**
 * Update the L/I assessment (recomputes score + band). Used during
 * the `assessed` step or any time the risk's outlook changes.
 */
export async function updateRiskAssessment(
  riskId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const likelihood = clampLI(Number(formData.get('likelihood')?.toString() ?? '1'));
  const impact = clampLI(Number(formData.get('impact')?.toString() ?? '1'));
  const score = likelihood * impact;
  const scoreBand = bandFromScore(score);

  const [existing] = await db
    .select({ status: riskItems.status })
    .from(riskItems)
    .where(eq(riskItems.id, riskId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Risk not found' };
  if (['closed', 'mitigated', 'accepted'].includes(existing.status)) {
    return {
      ok: false,
      error: `Cannot re-assess a ${existing.status} risk. Reopen it first.`
    };
  }

  await db
    .update(riskItems)
    .set({
      likelihood,
      impact,
      score,
      scoreBand,
      status: existing.status === 'identified' ? 'assessed' : existing.status,
      updatedAt: new Date()
    })
    .where(eq(riskItems.id, riskId));

  refreshSurfaces(projectId, riskId);
  return { ok: true };
}

/* ─────────────────────────── MITIGATION PLAN ─────────────────────────── */

export async function planMitigation(
  riskId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const mitigationAction = (formData.get('mitigationAction')?.toString() ?? '').trim();
  if (!mitigationAction) {
    return { ok: false, error: 'Mitigation action is required.' };
  }
  const mitigationDueRaw = (formData.get('mitigationDueDate')?.toString() ?? '').trim();
  const mitigationDueDate =
    mitigationDueRaw && /^\d{4}-\d{2}-\d{2}$/.test(mitigationDueRaw)
      ? mitigationDueRaw
      : null;

  const ownerIdRaw = formData.get('ownerId')?.toString().trim() || null;
  const ownerId =
    ownerIdRaw && /^[0-9a-f-]{36}$/i.test(ownerIdRaw) ? ownerIdRaw : null;

  await db
    .update(riskItems)
    .set({
      mitigationAction,
      mitigationDueDate,
      ownerId,
      status: 'mitigation_planned',
      updatedAt: new Date()
    })
    .where(eq(riskItems.id, riskId));

  refreshSurfaces(projectId, riskId);
  return { ok: true };
}

export async function startMitigation(
  riskId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({ status: riskItems.status })
    .from(riskItems)
    .where(eq(riskItems.id, riskId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Risk not found' };
  if (existing.status !== 'mitigation_planned') {
    return {
      ok: false,
      error: `Only mitigation_planned risks can be moved to in-progress. This one is ${existing.status}.`
    };
  }

  await db
    .update(riskItems)
    .set({ status: 'mitigation_in_progress', updatedAt: new Date() })
    .where(eq(riskItems.id, riskId));
  refreshSurfaces(projectId, riskId);
  return { ok: true };
}

/**
 * Mark a risk as mitigated. Captures the residual L/I (post-mitigation)
 * so we know how much risk actually remains.
 */
export async function markRiskMitigated(
  riskId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const residualL = clampLI(Number(formData.get('residualLikelihood')?.toString() ?? '1'));
  const residualI = clampLI(Number(formData.get('residualImpact')?.toString() ?? '1'));
  const residualScore = residualL * residualI;

  await db
    .update(riskItems)
    .set({
      residualLikelihood: residualL,
      residualImpact: residualI,
      residualScore,
      status: 'mitigated',
      updatedAt: new Date()
    })
    .where(eq(riskItems.id, riskId));
  refreshSurfaces(projectId, riskId);
  return { ok: true };
}

/**
 * Accept a risk — we chose to not mitigate. Records the decision
 * note so the audit trail captures why.
 */
export async function acceptRisk(
  riskId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const note = formData.get('note')?.toString().trim() || null;
  if (!note) {
    return { ok: false, error: 'Reason for accepting the risk is required.' };
  }

  // Stash the acceptance note in description (appended) — the
  // schema's `acceptedByDecisionId` would link a Decision row, but
  // for v1 we keep it on the description.
  const [existing] = await db
    .select({ description: riskItems.description })
    .from(riskItems)
    .where(eq(riskItems.id, riskId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Risk not found' };

  const stamp = new Date().toISOString().slice(0, 10);
  const noteLine = `\n\n[${stamp}] Accepted: ${note}`;
  const combinedDescription =
    (existing.description ?? '') + noteLine;

  await db
    .update(riskItems)
    .set({
      description: combinedDescription,
      status: 'accepted',
      updatedAt: new Date()
    })
    .where(eq(riskItems.id, riskId));
  refreshSurfaces(projectId, riskId);
  return { ok: true };
}

/** mitigated | accepted → closed. Audit-friendly final state. */
export async function closeRisk(
  riskId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({ status: riskItems.status })
    .from(riskItems)
    .where(eq(riskItems.id, riskId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Risk not found' };
  if (!['mitigated', 'accepted'].includes(existing.status)) {
    return {
      ok: false,
      error: `Only mitigated or accepted risks can be closed. This one is ${existing.status}.`
    };
  }

  await db
    .update(riskItems)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(riskItems.id, riskId));
  refreshSurfaces(projectId, riskId);
  return { ok: true };
}

/** closed → identified. Re-open a previously-resolved risk if it resurfaces. */
export async function reopenRisk(
  riskId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  await db
    .update(riskItems)
    .set({ status: 'identified', updatedAt: new Date() })
    .where(eq(riskItems.id, riskId));
  refreshSurfaces(projectId, riskId);
  return { ok: true };
}
