import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  db,
  leads,
  projects,
  clients,
  approvals,
  purchaseOrders,
  vendors,
  changeOrders,
  rfqs
} from '@/db';

/**
 * "Today" view queries — the action queues that drive `/dashboard`.
 *
 * Doctrine per `21-ux-design.md` Phase 3: open the app, see what needs
 * you. Each section caps at 5 rows + a total count, so the page stays
 * scannable even at scale.
 *
 * The `mineOnly` flag implements the `Show: mine / all` toggle. When
 * true we filter by ownership (`projects.currentOwnerId === userId`).
 * Owner-less projects are excluded from "mine" but included in "all".
 *
 * All queries are read-only and parallel-safe; the page composes them
 * with Promise.all.
 */

const SECTION_LIMIT = 5;

/** Stages where a project is "active work" — excludes paused/terminal states. */
const ACTIVE_STAGES = [
  'brief',
  'concept',
  'design_development',
  'specification',
  'procurement_production',
  'installation'
] as const;

const TERMINAL_OR_PAUSED_STAGES = [
  'handover',
  'on_hold',
  'cancelled',
  'archived',
  'in_dispute'
] as const;

const RISK_STAGES = ['on_hold', 'in_dispute'] as const;

const INTAKE_OPEN_STATUSES = ['new', 'qualifying', 'qualified'] as const;

const CHANGE_ORDER_OPEN_STATUSES = [
  'requested',
  'under_review',
  'priced',
  'sent_for_approval'
] as const;

/* ─── Intake — leads ready or stalled ─── */

export type TodayIntakeRow = {
  id: string;
  reference: string;
  prospectiveClientName: string | null;
  status: string;
  fieldsFilled: number;
  receivedAt: Date;
};

const INTAKE_FIELDS = [
  leads.prospectiveClientName,
  leads.clientKind,
  leads.primaryContactName,
  leads.primaryContactEmail,
  leads.primaryContactPhone,
  leads.propertyAddress,
  leads.projectType,
  leads.roomsOrZones,
  leads.desiredOutcome,
  leads.budgetExpectation,
  leads.timelineExpectation,
  leads.decisionMakers,
  leads.approvalProcess,
  leads.knownConstraints,
  leads.designStylePreferences,
  leads.fablabExpectedRole
];
export const INTAKE_FIELD_COUNT = INTAKE_FIELDS.length;

export async function getTodayIntake(
  userId: string,
  mineOnly: boolean
): Promise<{ rows: TodayIntakeRow[]; total: number }> {
  if (!process.env.DATABASE_URL) return { rows: [], total: 0 };

  // SQL fragment that counts how many of the intake fields are non-null.
  // Cheap and indexable; mirrors the live lead-detail page count.
  const filledExpr = sql<number>`(
    ${sql.join(
      INTAKE_FIELDS.map((f) => sql`CASE WHEN ${f} IS NOT NULL THEN 1 ELSE 0 END`),
      sql` + `
    )}
  )`;

  const whereMine = mineOnly ? and(eq(leads.ownerId, userId)) : undefined;
  const baseWhere = and(
    inArray(leads.status, [...INTAKE_OPEN_STATUSES]),
    whereMine
  );

  const [countRow] = await db
    .select({ value: count() })
    .from(leads)
    .where(baseWhere);

  const rows = await db
    .select({
      id: leads.id,
      reference: leads.reference,
      prospectiveClientName: leads.prospectiveClientName,
      status: leads.status,
      fieldsFilled: filledExpr,
      receivedAt: leads.receivedAt
    })
    .from(leads)
    .where(baseWhere)
    .orderBy(desc(leads.receivedAt))
    .limit(SECTION_LIMIT);

  return {
    rows: rows.map((r) => ({ ...r, fieldsFilled: Number(r.fieldsFilled) })),
    total: countRow?.value ?? 0
  };
}

/* ─── Active projects ─── */

export type TodayActiveProjectRow = {
  id: string;
  reference: string;
  title: string;
  currentStage: string;
  fablabRole: string;
  clientName: string | null;
  ownerId: string | null;
};

export async function getTodayActiveProjects(
  userId: string,
  mineOnly: boolean
): Promise<{ rows: TodayActiveProjectRow[]; total: number }> {
  if (!process.env.DATABASE_URL) return { rows: [], total: 0 };

  const baseWhere = and(
    inArray(projects.currentStage, [...ACTIVE_STAGES]),
    mineOnly ? eq(projects.currentOwnerId, userId) : undefined
  );

  const [countRow] = await db
    .select({ value: count() })
    .from(projects)
    .where(baseWhere);

  const rows = await db
    .select({
      id: projects.id,
      reference: projects.reference,
      title: projects.title,
      currentStage: projects.currentStage,
      fablabRole: projects.fablabRole,
      clientName: clients.name,
      ownerId: projects.currentOwnerId
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(baseWhere)
    .orderBy(desc(projects.updatedAt))
    .limit(SECTION_LIMIT);

  return { rows, total: countRow?.value ?? 0 };
}

/* ─── Approval discipline — awaiting client sign-off ─── */

export type TodayApprovalRow = {
  id: string;
  reference: string;
  subject: string;
  projectId: string;
  projectReference: string;
  projectTitle: string;
  sentAt: Date | null;
};

export async function getTodayApprovalsWaiting(
  userId: string,
  mineOnly: boolean
): Promise<{ rows: TodayApprovalRow[]; total: number }> {
  if (!process.env.DATABASE_URL) return { rows: [], total: 0 };

  const baseWhere = and(
    eq(approvals.status, 'sent_for_approval'),
    mineOnly ? eq(projects.currentOwnerId, userId) : undefined
  );

  const [countRow] = await db
    .select({ value: count() })
    .from(approvals)
    .innerJoin(projects, eq(approvals.projectId, projects.id))
    .where(baseWhere);

  const rows = await db
    .select({
      id: approvals.id,
      reference: approvals.reference,
      subject: approvals.subject,
      projectId: projects.id,
      projectReference: projects.reference,
      projectTitle: projects.title,
      sentAt: approvals.sentAt
    })
    .from(approvals)
    .innerJoin(projects, eq(approvals.projectId, projects.id))
    .where(baseWhere)
    .orderBy(desc(approvals.sentAt))
    .limit(SECTION_LIMIT);

  return { rows, total: countRow?.value ?? 0 };
}

/* ─── Commercial protection — POs ready to issue ─── */

export type TodayPoReadyRow = {
  id: string;
  reference: string;
  projectId: string;
  projectReference: string;
  projectTitle: string;
  vendorName: string | null;
  totalGross: string;
  currency: string;
};

export async function getTodayPosReadyToIssue(
  userId: string,
  mineOnly: boolean
): Promise<{ rows: TodayPoReadyRow[]; total: number }> {
  if (!process.env.DATABASE_URL) return { rows: [], total: 0 };

  const baseWhere = and(
    inArray(purchaseOrders.status, ['draft', 'ready_for_review']),
    mineOnly ? eq(projects.currentOwnerId, userId) : undefined
  );

  const [countRow] = await db
    .select({ value: count() })
    .from(purchaseOrders)
    .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
    .where(baseWhere);

  const rows = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      projectId: projects.id,
      projectReference: projects.reference,
      projectTitle: projects.title,
      vendorName: vendors.name,
      totalGross: purchaseOrders.totalGross,
      currency: purchaseOrders.currency
    })
    .from(purchaseOrders)
    .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(baseWhere)
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(SECTION_LIMIT);

  return { rows, total: countRow?.value ?? 0 };
}

/* ─── Awaiting vendor confirmation — issued POs not yet confirmed ─── */

export type TodayAwaitingConfirmationRow = {
  id: string;
  reference: string;
  projectId: string;
  projectReference: string;
  projectTitle: string;
  vendorName: string | null;
  issuedAt: string | null;       // YYYY-MM-DD
  daysSinceIssue: number | null;
};

export async function getTodayAwaitingConfirmation(
  userId: string,
  mineOnly: boolean
): Promise<{ rows: TodayAwaitingConfirmationRow[]; total: number }> {
  if (!process.env.DATABASE_URL) return { rows: [], total: 0 };

  // Issued = BINDING but the vendor hasn't acknowledged in writing yet.
  // The §2 PO template asks for confirmation within 5 business days;
  // surfacing the wait time visualises which orders are overdue.
  const baseWhere = and(
    eq(purchaseOrders.status, 'issued'),
    isNull(purchaseOrders.confirmedAt),
    mineOnly ? eq(projects.currentOwnerId, userId) : undefined
  );

  const [countRow] = await db
    .select({ value: count() })
    .from(purchaseOrders)
    .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
    .where(baseWhere);

  const rows = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      projectId: projects.id,
      projectReference: projects.reference,
      projectTitle: projects.title,
      vendorName: vendors.name,
      issuedAt: purchaseOrders.issuedAt
    })
    .from(purchaseOrders)
    .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(baseWhere)
    // Oldest issue date first — what's most overdue surfaces top.
    .orderBy(asc(purchaseOrders.issuedAt))
    .limit(SECTION_LIMIT);

  const now = Date.now();
  const enriched: TodayAwaitingConfirmationRow[] = rows.map((r) => ({
    ...r,
    daysSinceIssue: r.issuedAt
      ? Math.max(
          0,
          Math.floor(
            (now - new Date(r.issuedAt).getTime()) / (24 * 60 * 60 * 1000)
          )
        )
      : null
  }));

  return { rows: enriched, total: countRow?.value ?? 0 };
}

/* ─── Change control — open change orders ─── */

export type TodayChangeOrderRow = {
  id: string;
  reference: string;
  title: string;
  projectId: string;
  projectReference: string;
  projectTitle: string;
  status: string;
};

export async function getTodayOpenChangeOrders(
  userId: string,
  mineOnly: boolean
): Promise<{ rows: TodayChangeOrderRow[]; total: number }> {
  if (!process.env.DATABASE_URL) return { rows: [], total: 0 };

  const baseWhere = and(
    inArray(changeOrders.status, [...CHANGE_ORDER_OPEN_STATUSES]),
    mineOnly ? eq(projects.currentOwnerId, userId) : undefined
  );

  const [countRow] = await db
    .select({ value: count() })
    .from(changeOrders)
    .innerJoin(projects, eq(changeOrders.projectId, projects.id))
    .where(baseWhere);

  const rows = await db
    .select({
      id: changeOrders.id,
      reference: changeOrders.reference,
      title: changeOrders.title,
      projectId: projects.id,
      projectReference: projects.reference,
      projectTitle: projects.title,
      status: changeOrders.status
    })
    .from(changeOrders)
    .innerJoin(projects, eq(changeOrders.projectId, projects.id))
    .where(baseWhere)
    .orderBy(desc(changeOrders.updatedAt))
    .limit(SECTION_LIMIT);

  return { rows, total: countRow?.value ?? 0 };
}

/* ─── Risk — projects on hold or in dispute ─── */

export type TodayRiskProjectRow = {
  id: string;
  reference: string;
  title: string;
  currentStage: string;
  clientName: string | null;
};

export async function getTodayRiskProjects(
  userId: string,
  mineOnly: boolean
): Promise<{ rows: TodayRiskProjectRow[]; total: number }> {
  if (!process.env.DATABASE_URL) return { rows: [], total: 0 };

  const baseWhere = and(
    inArray(projects.currentStage, [...RISK_STAGES]),
    mineOnly ? eq(projects.currentOwnerId, userId) : undefined
  );

  const [countRow] = await db
    .select({ value: count() })
    .from(projects)
    .where(baseWhere);

  const rows = await db
    .select({
      id: projects.id,
      reference: projects.reference,
      title: projects.title,
      currentStage: projects.currentStage,
      clientName: clients.name
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(baseWhere)
    .orderBy(desc(projects.updatedAt))
    .limit(SECTION_LIMIT);

  return { rows, total: countRow?.value ?? 0 };
}

/* ─── Recent activity — last 7 days ─── */

export type TodayActivityRow = {
  kind: 'approval' | 'po' | 'rfq';
  when: Date;
  description: string;
  href: string;
};

export async function getTodayRecentActivity(
  userId: string,
  mineOnly: boolean
): Promise<TodayActivityRow[]> {
  if (!process.env.DATABASE_URL) return [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Approvals: responded in the last 7 days (approved / rejected / conditions).
  const approvalRows = await db
    .select({
      id: approvals.id,
      reference: approvals.reference,
      status: approvals.status,
      subject: approvals.subject,
      respondedAt: approvals.respondedAt,
      projectId: projects.id,
      projectReference: projects.reference
    })
    .from(approvals)
    .innerJoin(projects, eq(approvals.projectId, projects.id))
    .where(
      and(
        isNotNull(approvals.respondedAt),
        gte(approvals.respondedAt, sevenDaysAgo),
        mineOnly ? eq(projects.currentOwnerId, userId) : undefined
      )
    )
    .orderBy(desc(approvals.respondedAt))
    .limit(SECTION_LIMIT * 2);

  // POs issued in the last 7 days (the BINDING moment).
  const poRows = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      issuedAt: purchaseOrders.issuedAt,
      vendorName: vendors.name,
      projectId: projects.id,
      projectReference: projects.reference
    })
    .from(purchaseOrders)
    .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(
      and(
        eq(purchaseOrders.status, 'issued'),
        isNotNull(purchaseOrders.issuedAt),
        gte(purchaseOrders.updatedAt, sevenDaysAgo),
        mineOnly ? eq(projects.currentOwnerId, userId) : undefined
      )
    )
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(SECTION_LIMIT * 2);

  // RFQs sent in the last 7 days.
  const rfqRows = await db
    .select({
      id: rfqs.id,
      reference: rfqs.reference,
      title: rfqs.title,
      sentAt: rfqs.sentAt,
      projectId: projects.id,
      projectReference: projects.reference
    })
    .from(rfqs)
    .innerJoin(projects, eq(rfqs.projectId, projects.id))
    .where(
      and(
        isNotNull(rfqs.sentAt),
        gte(rfqs.sentAt, sevenDaysAgo),
        mineOnly ? eq(projects.currentOwnerId, userId) : undefined
      )
    )
    .orderBy(desc(rfqs.sentAt))
    .limit(SECTION_LIMIT * 2);

  const combined: TodayActivityRow[] = [
    ...approvalRows
      .filter((r) => r.respondedAt)
      .map((r) => ({
        kind: 'approval' as const,
        when: r.respondedAt!,
        description: `${r.projectReference} — Approval ${r.reference} ${r.status.replace(/_/g, ' ')} (${r.subject})`,
        href: `/projects/${r.projectId}/approvals`
      })),
    ...poRows
      .filter((r) => r.issuedAt)
      .map((r) => ({
        kind: 'po' as const,
        // PO.issuedAt is a date column → string at runtime; coerce.
        when: new Date(r.issuedAt as unknown as string),
        description: `${r.projectReference} — PO ${r.reference} issued to ${r.vendorName ?? '—'}`,
        href: `/projects/${r.projectId}/pos/${r.id}`
      })),
    ...rfqRows
      .filter((r) => r.sentAt)
      .map((r) => ({
        kind: 'rfq' as const,
        when: r.sentAt!,
        description: `${r.projectReference} — RFQ ${r.reference} sent (${r.title})`,
        href: `/projects/${r.projectId}/rfqs/${r.id}`
      }))
  ];

  combined.sort((a, b) => b.when.getTime() - a.when.getTime());
  return combined.slice(0, SECTION_LIMIT * 2);
}

/* ─── STATS footer (demoted Dashboard tiles) ─── */

export type TodayStats = {
  liveProjects: number | string;
  itemsInFlight: number | string;
  drawingsForReview: number | string;
  budgetCommitted: number | string;
};

export async function getTodayStats(): Promise<TodayStats> {
  if (!process.env.DATABASE_URL) {
    return {
      liveProjects: '—',
      itemsInFlight: '—',
      drawingsForReview: '—',
      budgetCommitted: '—'
    };
  }
  try {
    // Three aggregates over three tables, fetched in ONE round-trip.
    //
    // Postgres lets a top-level SELECT reference scalar sub-selects as
    // expressions, so we can union the three independent aggregates
    // into a single one-row result. That replaces the previous fan-out
    // (3 parallel queries) with a single network hop — meaningful when
    // the surrounding Promise.all is already stacking ~11 queries on
    // the dashboard.
    //
    // - live_projects:    projects in an active stage (excludes
    //                     archived / cancelled / handover / on_hold /
    //                     in_dispute).
    // - items_in_flight:  items between ordered and installed inclusive
    //                     — the procurement → delivery → install window.
    // - budget_committed: sum of total_gross across POs in a binding
    //                     state. The aggregate flattens currencies to
    //                     a raw number — fine for a tile glance, not
    //                     for a real finance report.
    // - drawings_for_review: deliberately kept as '—'. The drawings
    //                     table exists but the review-workflow UI
    //                     isn't shipped; a misleading number is worse
    //                     than the em-dash.
    //
    // Counts return as bigint from Postgres → string in postgres-js;
    // we coerce per-field.
    type StatsRow = {
      live_projects: string | number;
      items_in_flight: string | number;
      budget_committed: string | number;
    };
    const rows = (await db.execute<StatsRow>(sql`
      SELECT
        (
          SELECT COUNT(*)
          FROM projects
          WHERE current_stage NOT IN (
            'archived', 'cancelled', 'handover', 'on_hold', 'in_dispute'
          )
        ) AS live_projects,
        (
          SELECT COUNT(*)
          FROM items
          WHERE status IN (
            'ordered', 'in_production', 'ready', 'shipped', 'received', 'installed'
          )
        ) AS items_in_flight,
        (
          SELECT COALESCE(SUM(total_gross), 0)
          FROM purchase_orders
          WHERE status IN (
            'issued', 'confirmed', 'partially_fulfilled', 'fulfilled'
          )
        ) AS budget_committed
    `)) as unknown as StatsRow[];
    const row = rows[0];
    if (!row) {
      return {
        liveProjects: 0,
        itemsInFlight: 0,
        drawingsForReview: '—',
        budgetCommitted: '—'
      };
    }

    const budgetNumeric = Number(row.budget_committed ?? 0);
    return {
      liveProjects: Number(row.live_projects ?? 0),
      itemsInFlight: Number(row.items_in_flight ?? 0),
      drawingsForReview: '—',
      budgetCommitted: Number.isFinite(budgetNumeric)
        ? formatBudget(budgetNumeric)
        : '—'
    };
  } catch {
    return {
      liveProjects: '—',
      itemsInFlight: '—',
      drawingsForReview: '—',
      budgetCommitted: '—'
    };
  }
}

/**
 * Format the budget total for the tile — compact, no currency
 * (Fablab works in NOK by default; multi-currency totals are
 * inherently lossy as one number).
 */
function formatBudget(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

/* ─── Aside helpers ─── */

// Re-exported for the UI's section grouping.
export { ACTIVE_STAGES, TERMINAL_OR_PAUSED_STAGES, RISK_STAGES };
