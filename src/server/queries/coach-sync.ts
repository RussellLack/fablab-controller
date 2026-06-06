import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db, projectCoachRecommendations } from '@/db';
import {
  getProjectEvidenceHealth,
  type Recommendation,
  type Severity
} from './coach-health';

/**
 * Persistence sync for the Project Coach dashboard (MVP-D).
 *
 * Called from the dashboard page on every render. Reconciles the
 * `project_coach_recommendations` table with the current rules-engine
 * output:
 *
 *   - New key                          → INSERT (status='open')
 *   - Existing key in any status       → no-op (preserve user state)
 *   - Existing key in `open` or
 *     `acknowledged` that's no longer
 *     produced by the rules engine     → marked `resolved` (auto)
 *   - `dismissed` and `resolved` rows  → left alone; the user (or
 *                                        previous run) put them
 *                                        there. A re-fire of the
 *                                        same key on a dismissed row
 *                                        also leaves it dismissed —
 *                                        the user explicitly silenced
 *                                        it; we don't auto-resurrect.
 *
 * The `lastSeenAt` timestamp bumps every time the rule fires so the
 * dashboard can show "first detected" vs "still firing".
 *
 * Returns the freshly-synced live recommendations (status open or
 * acknowledged) so the caller can render without a second query.
 */
export type StoredRecommendation = {
  id: string;
  recommendationKey: string;
  ruleKey: string;
  module: string;
  severity: Severity;
  observationKey: string;
  observationParams: Record<string, string | number> | null;
  actionLabelKey: string;
  actionHref: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export async function syncProjectCoachRecommendations(
  projectId: string
): Promise<StoredRecommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  // 1. Pull current findings from the in-memory rules engine.
  const current: Recommendation[] = await getProjectEvidenceHealth(projectId);
  const currentKeys = new Set(current.map((r) => r.id));

  // 2. Upsert each. ON CONFLICT preserves user state — we only update
  //    last_seen_at and the dynamic params (counts shift between runs)
  //    and severity (a rule can escalate).
  if (current.length > 0) {
    const now = new Date();
    await db
      .insert(projectCoachRecommendations)
      .values(
        current.map((r) => ({
          projectId,
          recommendationKey: r.id,
          ruleKey: r.ruleKey,
          module: r.module,
          severity: r.severity,
          observationKey: r.observationKey,
          observationParams: r.observationParams ?? null,
          actionLabelKey: r.actionLabelKey,
          actionHref: r.actionHref,
          status: 'open' as const,
          firstSeenAt: now,
          lastSeenAt: now
        }))
      )
      .onConflictDoUpdate({
        target: [
          projectCoachRecommendations.projectId,
          projectCoachRecommendations.recommendationKey
        ],
        set: {
          // Refresh the dynamic bits — counts move, severity escalates.
          severity: sql`EXCLUDED.severity`,
          observationParams: sql`EXCLUDED.observation_params`,
          // observation_key + rule_key stay stable per key, but if the
          // rules engine ever renames a key we want the latest copy.
          observationKey: sql`EXCLUDED.observation_key`,
          actionHref: sql`EXCLUDED.action_href`,
          actionLabelKey: sql`EXCLUDED.action_label_key`,
          lastSeenAt: now,
          updatedAt: now
        }
      });
  }

  // 3. Mark resolved any open/acknowledged rec whose key isn't in the
  //    current findings. Skip if the engine produced nothing (we don't
  //    want a transient outage that returns [] to wipe state).
  if (current.length > 0) {
    await db
      .update(projectCoachRecommendations)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(projectCoachRecommendations.projectId, projectId),
          inArray(projectCoachRecommendations.status, ['open', 'acknowledged']),
          notInArray(projectCoachRecommendations.recommendationKey, [
            ...currentKeys
          ])
        )
      );
  }

  // 4. Read back the open + acknowledged rows for the dashboard to
  //    render. Sorted by severity, then by firstSeenAt asc (oldest
  //    open findings bubble up).
  const rows = await db
    .select({
      id: projectCoachRecommendations.id,
      recommendationKey: projectCoachRecommendations.recommendationKey,
      ruleKey: projectCoachRecommendations.ruleKey,
      module: projectCoachRecommendations.module,
      severity: projectCoachRecommendations.severity,
      observationKey: projectCoachRecommendations.observationKey,
      observationParams: projectCoachRecommendations.observationParams,
      actionLabelKey: projectCoachRecommendations.actionLabelKey,
      actionHref: projectCoachRecommendations.actionHref,
      status: projectCoachRecommendations.status,
      acknowledgedAt: projectCoachRecommendations.acknowledgedAt,
      firstSeenAt: projectCoachRecommendations.firstSeenAt,
      lastSeenAt: projectCoachRecommendations.lastSeenAt
    })
    .from(projectCoachRecommendations)
    .where(
      and(
        eq(projectCoachRecommendations.projectId, projectId),
        inArray(projectCoachRecommendations.status, ['open', 'acknowledged'])
      )
    )
    .orderBy(
      sql`CASE severity
            WHEN 'critical' THEN 0
            WHEN 'high'     THEN 1
            WHEN 'medium'   THEN 2
            WHEN 'low'      THEN 3
          END`,
      projectCoachRecommendations.firstSeenAt
    );

  return rows.map((r) => ({
    ...r,
    severity: r.severity as Severity,
    status: r.status as StoredRecommendation['status'],
    observationParams:
      (r.observationParams as Record<string, string | number> | null) ?? null
  }));
}
