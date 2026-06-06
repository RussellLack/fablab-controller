import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  db,
  projects,
  approvals,
  changeOrders,
  riskItems,
  timeEntries,
  projectBriefSignoffs
} from '@/db';
// `items`, `packages`, `project_customer_comments` are referenced only
// inside raw SQL fragments via table-name literals — no drizzle table
// import required.

/**
 * Project Coach rules engine — MVP-C (see `28-project-coaching-layer.md`
 * §6 + §9).
 *
 * 12 evidence-health rules; each returns zero or more `Recommendation`s
 * the surface UI can render. The rules are split into per-module
 * helpers so each module page only runs the rules it cares about — the
 * page never pays the cost of rules it doesn't surface.
 *
 * Doctrine:
 *   - Cards stay quiet when there's nothing to nudge. Empty rule
 *     output = empty card (the parent surface hides it).
 *   - Recommendations name the entity ("Sofa from Wong & Co"), never
 *     just "this item". The observation text comes from real counts.
 *   - One-click out — every recommendation deep-links into the action
 *     it suggests. The Coach never makes the staff hunt.
 *
 * v1 stays in-memory — no `project_coach_recommendations` persistence
 * yet (defer to MVP-D when we add the Coach dashboard + ack/dismiss
 * lifecycle). Rules are fast enough to run inline on every page render.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Recommendation = {
  /** Stable identity across runs — used for React keys + future persistence. */
  id: string;
  /** Translation key root (e.g. `coach_rule.brief_no_signoff`). */
  ruleKey: string;
  module: CoachModule;
  severity: Severity;
  /** The dynamic line — counts, names, dates. Already localised at render time
   *  by the caller passing rendered fragments in `observationParams`. */
  observationKey: string;
  observationParams?: Record<string, string | number>;
  /** Deep link target. */
  actionHref: string;
  /** Translation key for the action label. */
  actionLabelKey: string;
};

export type CoachModule =
  | 'brief'
  | 'scope'
  | 'approvals'
  | 'items'
  | 'procurement'
  | 'delivery'
  | 'handover'
  | 'reporting'
  | 'time';

/* ─────────────────────── 1. BRIEF ─────────────────────── */

/**
 * Brief health — rules 1 + 3 from §6.
 *   - Brief signed off? (project_brief_signoffs latest snapshot matches current brief)
 *   - Open customer comments un-replied by staff in last 7d
 */
export async function getBriefHealth(projectId: string): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];
  const out: Recommendation[] = [];

  const [proj] = await db
    .select({
      description: projects.description,
      fablabRole: projects.fablabRole
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) return [];

  // Rule 1: Brief signed off?
  const [latestSignoff] = await db
    .select({
      signedOffAt: projectBriefSignoffs.signedOffAt,
      briefSnapshot: projectBriefSignoffs.briefSnapshot
    })
    .from(projectBriefSignoffs)
    .where(eq(projectBriefSignoffs.projectId, projectId))
    .orderBy(desc(projectBriefSignoffs.signedOffAt))
    .limit(1);

  if (!latestSignoff) {
    out.push({
      id: `brief.no_signoff.${projectId}`,
      ruleKey: 'coach_rule.brief_no_signoff',
      module: 'brief',
      severity: 'high',
      observationKey: 'coach_rule.brief_no_signoff.observation',
      actionHref: `/projects/${projectId}`,
      actionLabelKey: 'coach_rule.brief_no_signoff.action'
    });
  } else if (
    !snapshotMatchesBrief(
      latestSignoff.briefSnapshot,
      proj.description,
      proj.fablabRole
    )
  ) {
    out.push({
      id: `brief.signoff_drifted.${projectId}`,
      ruleKey: 'coach_rule.brief_signoff_drifted',
      module: 'brief',
      severity: 'high',
      observationKey: 'coach_rule.brief_signoff_drifted.observation',
      actionHref: `/projects/${projectId}`,
      actionLabelKey: 'coach_rule.brief_signoff_drifted.action'
    });
  }

  // Rule 3: open customer comments — count of comments not replied to by
  // staff in the last 7 days. A "reply" is any staff comment after the
  // customer comment in the same thread (or top-level).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  type CountRow = { n: string | number };
  const [unrepliedRow] = (await db.execute<CountRow>(sql`
    SELECT COUNT(*)::int AS n
    FROM project_customer_comments c
    WHERE c.project_id = ${projectId}::uuid
      AND c.author_is_staff = false
      AND c.created_at >= ${sevenDaysAgo}::timestamptz
      AND NOT EXISTS (
        SELECT 1
        FROM project_customer_comments reply
        WHERE reply.project_id = c.project_id
          AND reply.reply_to_id = c.id
          AND reply.author_is_staff = true
      )
  `)) as unknown as CountRow[];
  const unreplied = Number(unrepliedRow?.n ?? 0);
  if (unreplied > 0) {
    out.push({
      id: `brief.unreplied_comments.${projectId}`,
      ruleKey: 'coach_rule.brief_unreplied_comments',
      module: 'brief',
      severity: 'medium',
      observationKey: 'coach_rule.brief_unreplied_comments.observation',
      observationParams: { count: unreplied },
      actionHref: `/projects/${projectId}`,
      actionLabelKey: 'coach_rule.brief_unreplied_comments.action'
    });
  }

  return out;
}

/* ─────────────────────── 2. SCOPE ─────────────────────── */

/**
 * Scope health — rule 2 from §6.
 *   - Scope approved? (at least one Approval row targeting a scope baseline version is approved)
 */
export async function getScopeHealth(projectId: string): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  const [row] = await db
    .select({ value: count() })
    .from(approvals)
    .where(
      and(
        eq(approvals.projectId, projectId),
        isNotNull(approvals.scopeBaselineVersionId),
        eq(approvals.status, 'approved')
      )
    );
  if ((row?.value ?? 0) === 0) {
    return [
      {
        id: `scope.no_approval.${projectId}`,
        ruleKey: 'coach_rule.scope_no_approval',
        module: 'scope',
        severity: 'high',
        observationKey: 'coach_rule.scope_no_approval.observation',
        actionHref: `/projects/${projectId}/scope`,
        actionLabelKey: 'coach_rule.scope_no_approval.action'
      }
    ];
  }
  return [];
}

/* ─────────────────────── 3. APPROVALS ─────────────────────── */

/**
 * Approvals health — rule 4 from §6.
 *   - Approvals in `sent_for_approval` for more than 7 days
 */
export async function getApprovalsHealth(projectId: string): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(approvals)
    .where(
      and(
        eq(approvals.projectId, projectId),
        eq(approvals.status, 'sent_for_approval'),
        sql`${approvals.sentAt} <= ${sevenDaysAgo}`
      )
    );
  const stalled = row?.value ?? 0;
  if (stalled === 0) return [];
  return [
    {
      id: `approvals.stalled.${projectId}`,
      ruleKey: 'coach_rule.approvals_stalled',
      module: 'approvals',
      severity: stalled >= 3 ? 'high' : 'medium',
      observationKey: 'coach_rule.approvals_stalled.observation',
      observationParams: { count: stalled },
      actionHref: `/projects/${projectId}/approvals`,
      actionLabelKey: 'coach_rule.approvals_stalled.action'
    }
  ];
}

/* ─────────────────────── 4. ITEMS / PROCUREMENT ─────────────────────── */

/**
 * Items + procurement health — rule 6 from §6.
 *   - Items past `ordered` whose approving Approval is missing or unapproved (R3 violation).
 *
 * Items are scoped via `packages.project_id` since `items` doesn't carry projectId.
 */
export async function getItemsHealth(projectId: string): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  const POST_ORDER_STATES = [
    'ordered',
    'in_production',
    'ready',
    'shipped',
    'received',
    'installed'
  ] as const;

  type CountRow = { n: string | number };
  const [missingRow] = (await db.execute<CountRow>(sql`
    SELECT COUNT(*)::int AS n
    FROM items i
    INNER JOIN packages pkg ON i.package_id = pkg.id
    WHERE pkg.project_id = ${projectId}::uuid
      AND i.status::text = ANY(ARRAY[${sql.join(
        POST_ORDER_STATES.map((s) => sql`${s}`),
        sql`, `
      )}])
      AND NOT EXISTS (
        SELECT 1 FROM approvals a
        WHERE a.item_id = i.id
          AND a.status::text IN ('approved', 'approved_with_conditions')
      )
  `)) as unknown as CountRow[];
  const missing = Number(missingRow?.n ?? 0);
  if (missing === 0) return [];
  return [
    {
      id: `items.r3_violation.${projectId}`,
      ruleKey: 'coach_rule.items_r3_violation',
      module: 'items',
      severity: 'critical',
      observationKey: 'coach_rule.items_r3_violation.observation',
      observationParams: { count: missing },
      actionHref: `/projects/${projectId}/packages`,
      actionLabelKey: 'coach_rule.items_r3_violation.action'
    }
  ];
}

/* ─────────────────────── 5. CHANGE CONTROL ─────────────────────── */

export async function getChangeControlHealth(
  projectId: string
): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  const OPEN_STATES = [
    'requested',
    'under_review',
    'priced',
    'sent_for_approval'
  ] as const;

  const [row] = await db
    .select({ value: count() })
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.projectId, projectId),
        inArray(changeOrders.status, [...OPEN_STATES])
      )
    );
  const open = row?.value ?? 0;
  if (open === 0) return [];
  return [
    {
      id: `change.open.${projectId}`,
      ruleKey: 'coach_rule.change_open',
      module: 'approvals',
      severity: open >= 3 ? 'high' : 'medium',
      observationKey: 'coach_rule.change_open.observation',
      observationParams: { count: open },
      actionHref: `/projects/${projectId}/change-control`,
      actionLabelKey: 'coach_rule.change_open.action'
    }
  ];
}

/* ─────────────────────── 6. DELIVERY ─────────────────────── */

/**
 * Delivery health — rule 11 from §6.
 *   - Items in exception states (backorder / damaged / on_hold)
 */
export async function getDeliveryHealth(projectId: string): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  const EXCEPTION_STATES = ['backorder', 'damaged', 'on_hold'] as const;
  type CountRow = { n: string | number };
  const [stuckRow] = (await db.execute<CountRow>(sql`
    SELECT COUNT(*)::int AS n
    FROM items i
    INNER JOIN packages pkg ON i.package_id = pkg.id
    WHERE pkg.project_id = ${projectId}::uuid
      AND i.status::text = ANY(ARRAY[${sql.join(
        EXCEPTION_STATES.map((s) => sql`${s}`),
        sql`, `
      )}])
  `)) as unknown as CountRow[];
  const stuck = Number(stuckRow?.n ?? 0);
  if (stuck === 0) return [];
  return [
    {
      id: `delivery.stuck.${projectId}`,
      ruleKey: 'coach_rule.delivery_stuck',
      module: 'delivery',
      severity: stuck >= 3 ? 'high' : 'medium',
      observationKey: 'coach_rule.delivery_stuck.observation',
      observationParams: { count: stuck },
      actionHref: `/projects/${projectId}/delivery`,
      actionLabelKey: 'coach_rule.delivery_stuck.action'
    }
  ];
}

/* ─────────────────────── 7. HANDOVER ─────────────────────── */

/**
 * Handover health — rule 12 from §6.
 *   - Awaiting sign-off count (installed but not signed off).
 *   - If everything signed off + nothing in exception → ready to advance.
 */
export async function getHandoverHealth(projectId: string): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  type CountRow = { n: string | number };
  const [awaitingRow] = (await db.execute<CountRow>(sql`
    SELECT COUNT(*)::int AS n
    FROM items i
    INNER JOIN packages pkg ON i.package_id = pkg.id
    WHERE pkg.project_id = ${projectId}::uuid
      AND i.status::text = 'installed'
  `)) as unknown as CountRow[];
  const awaiting = Number(awaitingRow?.n ?? 0);
  if (awaiting === 0) return [];
  return [
    {
      id: `handover.awaiting.${projectId}`,
      ruleKey: 'coach_rule.handover_awaiting',
      module: 'handover',
      severity: 'medium',
      observationKey: 'coach_rule.handover_awaiting.observation',
      observationParams: { count: awaiting },
      actionHref: `/projects/${projectId}/handover`,
      actionLabelKey: 'coach_rule.handover_awaiting.action'
    }
  ];
}

/* ─────────────────────── 8. RISK ─────────────────────── */

/**
 * Risk health — rule 10 from §6.
 *   - Open supplier risks
 */
export async function getRiskHealth(projectId: string): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];

  const [row] = await db
    .select({ value: count() })
    .from(riskItems)
    .where(
      and(
        eq(riskItems.projectId, projectId),
        eq(riskItems.category, 'supplier_risk'),
        sql`${riskItems.status}::text NOT IN ('closed', 'accepted')`
      )
    );
  const open = row?.value ?? 0;
  if (open === 0) return [];
  return [
    {
      id: `risk.supplier_open.${projectId}`,
      ruleKey: 'coach_rule.risk_supplier_open',
      module: 'reporting',
      severity: 'medium',
      observationKey: 'coach_rule.risk_supplier_open.observation',
      observationParams: { count: open },
      actionHref: `/projects/${projectId}/risk`,
      actionLabelKey: 'coach_rule.risk_supplier_open.action'
    }
  ];
}

/* ─────────────────────── 9. TIME & REPORTING ─────────────────────── */

/**
 * Time + reporting health — rules 7, 8, 9 from §6.
 *   - Time entries missing commercial reason
 *   - Chargeable work not yet reported (included_in_report_at IS NULL)
 *   - Goodwill time recorded this period (informational, never warn)
 */
export async function getTimeReportingHealth(
  projectId: string
): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];
  const out: Recommendation[] = [];

  // Rule 7
  const [noReasonRow] = await db
    .select({ value: count() })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.projectId, projectId),
        isNull(timeEntries.commercialReason),
        eq(timeEntries.reportable, true)
      )
    );
  const noReason = noReasonRow?.value ?? 0;
  if (noReason > 0) {
    out.push({
      id: `time.missing_reason.${projectId}`,
      ruleKey: 'coach_rule.time_missing_reason',
      module: 'time',
      severity: noReason >= 5 ? 'high' : 'medium',
      observationKey: 'coach_rule.time_missing_reason.observation',
      observationParams: { count: noReason },
      actionHref: `/time?project=${projectId}`,
      actionLabelKey: 'coach_rule.time_missing_reason.action'
    });
  }

  // Rule 8 — chargeable hours not yet included in a report
  const [chargeableRow] = (await db.execute<{
    hours: string | number;
    n: string | number;
  }>(sql`
    SELECT COALESCE(SUM(hours), 0) AS hours, COUNT(*)::int AS n
    FROM time_entries
    WHERE project_id = ${projectId}::uuid
      AND chargeability_status::text IN ('chargeable', 'change')
      AND included_in_report_at IS NULL
      AND reportable = true
  `)) as unknown as { hours: string | number; n: string | number }[];
  const chargeableHours = Number(chargeableRow?.hours ?? 0);
  const chargeableCount = Number(chargeableRow?.n ?? 0);
  if (chargeableCount > 0) {
    out.push({
      id: `time.chargeable_unreported.${projectId}`,
      ruleKey: 'coach_rule.time_chargeable_unreported',
      module: 'reporting',
      severity: chargeableHours >= 4 ? 'high' : 'medium',
      observationKey: 'coach_rule.time_chargeable_unreported.observation',
      observationParams: {
        hours: chargeableHours.toFixed(1),
        count: chargeableCount
      },
      actionHref: `/projects/${projectId}/reporting/work-evidence`,
      actionLabelKey: 'coach_rule.time_chargeable_unreported.action'
    });
  }

  // Rule 9 — goodwill time recorded this period (informational)
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [goodwillRow] = (await db.execute<{ hours: string | number }>(sql`
    SELECT COALESCE(SUM(hours), 0) AS hours
    FROM time_entries
    WHERE project_id = ${projectId}::uuid
      AND chargeability_status::text = 'goodwill'
      AND work_date >= ${since}::date
  `)) as unknown as { hours: string | number }[];
  const goodwillHours = Number(goodwillRow?.hours ?? 0);
  if (goodwillHours > 0) {
    out.push({
      id: `time.goodwill.${projectId}`,
      ruleKey: 'coach_rule.time_goodwill',
      module: 'reporting',
      severity: 'low',
      observationKey: 'coach_rule.time_goodwill.observation',
      observationParams: { hours: goodwillHours.toFixed(1) },
      actionHref: `/projects/${projectId}/reporting/work-evidence`,
      actionLabelKey: 'coach_rule.time_goodwill.action'
    });
  }

  return out;
}

/* ─────────────────────── AGGREGATE ─────────────────────── */

/**
 * Project-wide rollup. Used by the Project Coach dashboard (MVP-D) to
 * render every open finding in one list. Each per-module helper runs
 * independently so a slow rule doesn't block the others.
 */
export async function getProjectEvidenceHealth(
  projectId: string
): Promise<Recommendation[]> {
  if (!process.env.DATABASE_URL) return [];
  const [brief, scope, approvals, items, change, delivery, handover, risk, time] =
    await Promise.all([
      getBriefHealth(projectId),
      getScopeHealth(projectId),
      getApprovalsHealth(projectId),
      getItemsHealth(projectId),
      getChangeControlHealth(projectId),
      getDeliveryHealth(projectId),
      getHandoverHealth(projectId),
      getRiskHealth(projectId),
      getTimeReportingHealth(projectId)
    ]);
  return [
    ...brief,
    ...scope,
    ...approvals,
    ...items,
    ...change,
    ...delivery,
    ...handover,
    ...risk,
    ...time
  ];
}

/* ─────────────────────── helpers ─────────────────────── */

function snapshotMatchesBrief(
  snapshot: unknown,
  currentDescription: string | null,
  currentRole: string | null
): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const s = snapshot as { description?: unknown; fablabRole?: unknown };
  const snapDesc = typeof s.description === 'string' ? s.description : '';
  const snapRole = typeof s.fablabRole === 'string' ? s.fablabRole : '';
  return (
    snapDesc === (currentDescription ?? '') &&
    snapRole === (currentRole ?? '')
  );
}

