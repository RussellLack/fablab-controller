'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, projectCoachRecommendations } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

/**
 * Lifecycle server actions for `project_coach_recommendations` rows
 * (Project Coaching MVP-D).
 *
 *   open          → acknowledge | dismiss
 *   acknowledged  → resolve     | dismiss
 *   dismissed     → reopen      (un-silences a rec the user previously hid)
 *   resolved      → reopen      (manual re-open if auto-resolution was wrong)
 *
 * Auto-resolution from the rules engine is in `coach-sync.ts`. These
 * actions are for explicit staff lifecycle moves.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function refreshSurfaces(projectId: string) {
  revalidatePath(`/projects/${projectId}/coach`);
  // Other module pages render inline Coach cards; they'll re-fetch on
  // next visit. We deliberately don't revalidate them all here — the
  // dashboard is the lifecycle surface.
}

export async function acknowledgeRecommendation(
  recId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  await db
    .update(projectCoachRecommendations)
    .set({
      status: 'acknowledged',
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(projectCoachRecommendations.id, recId),
        eq(projectCoachRecommendations.projectId, projectId),
        eq(projectCoachRecommendations.status, 'open')
      )
    );
  refreshSurfaces(projectId);
  return { ok: true };
}

export async function resolveRecommendation(
  recId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  await db
    .update(projectCoachRecommendations)
    .set({
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: userId,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(projectCoachRecommendations.id, recId),
        eq(projectCoachRecommendations.projectId, projectId)
      )
    );
  refreshSurfaces(projectId);
  return { ok: true };
}

export async function dismissRecommendation(
  recId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  await db
    .update(projectCoachRecommendations)
    .set({
      status: 'dismissed',
      dismissedAt: new Date(),
      dismissedBy: userId,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(projectCoachRecommendations.id, recId),
        eq(projectCoachRecommendations.projectId, projectId)
      )
    );
  refreshSurfaces(projectId);
  return { ok: true };
}

/**
 * Un-silence a previously dismissed rec, or re-open a resolved rec
 * that was auto-resolved by mistake. Returns to `open` so the rules-
 * engine re-fire (or the user's next acknowledge) drives it from there.
 */
export async function reopenRecommendation(
  recId: string,
  projectId: string
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };

  await db
    .update(projectCoachRecommendations)
    .set({
      status: 'open',
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      dismissedAt: null,
      dismissedBy: null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(projectCoachRecommendations.id, recId),
        eq(projectCoachRecommendations.projectId, projectId)
      )
    );
  refreshSurfaces(projectId);
  return { ok: true };
}
