import { count, eq, inArray, sql } from 'drizzle-orm';
import {
  db,
  projects,
  items,
  purchaseOrders,
  riskItems,
  changeOrders,
  approvals
} from '@/db';

/**
 * Cross-project Reporting queries — module #12 in `00-` §18.
 *
 * The per-project reporting surface is the Element List
 * (`/projects/[id]/element-list`). This file is for the **global**
 * `/reporting` view: portfolio-level counts and aggregations.
 *
 * Each function is one cheap aggregate; the page composes them with
 * Promise.all. None of them are project-scoped — they roll up across
 * the entire org.
 */

const PROJECT_LIVE_STAGES = [
  'brief',
  'concept',
  'design_development',
  'specification',
  'procurement_production',
  'installation'
] as const;

const ITEM_IN_FLIGHT_STATES = [
  'ordered',
  'in_production',
  'ready',
  'shipped',
  'received',
  'installed'
] as const;

const PO_BINDING_STATES = [
  'issued',
  'confirmed',
  'partially_fulfilled',
  'fulfilled'
] as const;

const CO_OPEN_STATES = [
  'requested',
  'under_review',
  'priced',
  'sent_for_approval',
  'approved'
] as const;

export type StageCount = { stage: string; n: number };

export async function getProjectsByStage(): Promise<StageCount[]> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await db
    .select({
      stage: projects.currentStage,
      n: count()
    })
    .from(projects)
    .groupBy(projects.currentStage);
  return rows.map((r) => ({ stage: r.stage as string, n: r.n }));
}

export type ItemStatusCount = { status: string; n: number };

export async function getItemsByStatus(): Promise<ItemStatusCount[]> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await db
    .select({
      status: items.status,
      n: count()
    })
    .from(items)
    .groupBy(items.status);
  return rows.map((r) => ({ status: r.status as string, n: r.n }));
}

export type RiskBandCount = { band: string; n: number };

export async function getOpenRisksByBand(): Promise<RiskBandCount[]> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await db
    .select({
      band: riskItems.scoreBand,
      n: count()
    })
    .from(riskItems)
    .where(sql`status NOT IN ('closed', 'accepted')`)
    .groupBy(riskItems.scoreBand);
  return rows.map((r) => ({ band: r.band as string, n: r.n }));
}

export type ChangeOrderStatusCount = { status: string; n: number };

export async function getChangeOrdersByStatus(): Promise<
  ChangeOrderStatusCount[]
> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await db
    .select({
      status: changeOrders.status,
      n: count()
    })
    .from(changeOrders)
    .where(inArray(changeOrders.status, [...CO_OPEN_STATES]))
    .groupBy(changeOrders.status);
  return rows.map((r) => ({ status: r.status as string, n: r.n }));
}

export type PortfolioTotals = {
  liveProjects: number;
  itemsInFlight: number;
  bindingPoTotal: number;       // sum of totalGross across binding-state POs
  openRisks: number;
  openChangeOrders: number;
  awaitingApprovalCount: number;
};

export async function getPortfolioTotals(): Promise<PortfolioTotals> {
  if (!process.env.DATABASE_URL) {
    return {
      liveProjects: 0,
      itemsInFlight: 0,
      bindingPoTotal: 0,
      openRisks: 0,
      openChangeOrders: 0,
      awaitingApprovalCount: 0
    };
  }
  // All six aggregates in one Promise.all — each is a single COUNT/SUM
  // and they're independent of each other.
  const [
    liveProjects,
    itemsInFlight,
    bindingPoSum,
    openRisks,
    openChangeOrders,
    awaitingApprovals
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(projects)
      .where(inArray(projects.currentStage, [...PROJECT_LIVE_STAGES])),
    db
      .select({ n: count() })
      .from(items)
      .where(inArray(items.status, [...ITEM_IN_FLIGHT_STATES])),
    db
      .select({
        sum: sql<string>`COALESCE(SUM(${purchaseOrders.totalGross}), 0)`
      })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.status, [...PO_BINDING_STATES])),
    db
      .select({ n: count() })
      .from(riskItems)
      .where(sql`status NOT IN ('closed', 'accepted')`),
    db
      .select({ n: count() })
      .from(changeOrders)
      .where(inArray(changeOrders.status, [...CO_OPEN_STATES])),
    db
      .select({ n: count() })
      .from(approvals)
      .where(eq(approvals.status, 'sent_for_approval'))
  ]);

  return {
    liveProjects: liveProjects[0]?.n ?? 0,
    itemsInFlight: itemsInFlight[0]?.n ?? 0,
    bindingPoTotal: Number(bindingPoSum[0]?.sum ?? 0),
    openRisks: openRisks[0]?.n ?? 0,
    openChangeOrders: openChangeOrders[0]?.n ?? 0,
    awaitingApprovalCount: awaitingApprovals[0]?.n ?? 0
  };
}
