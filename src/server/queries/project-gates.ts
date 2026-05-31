import { cache } from 'react';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  db,
  projects,
  packages,
  items,
  purchaseOrders,
  approvals,
  scopeBaselines,
  scopeBaselineVersions
} from '@/db';
import type { GateResult, ProjectGates } from '@/lib/project-gates';

// Re-export the client-safe pieces so existing server-side callers don't have
// to track that they moved. Client components must import these from
// '@/lib/project-gates' directly to avoid pulling in the postgres driver.
export {
  GATE_ORDER,
  GATE_NUMERAL,
  gateHref,
  type GateName,
  type GateState,
  type GateResult,
  type ProjectGates
} from '@/lib/project-gates';

/**
 * Phase 2 gate detection. One server query per project that returns the
 * progress state of the six linear lifecycle steps. The criteria are the
 * ones agreed in `21-ux-design.md` decision #2.
 *
 * `done`         — gate criteria fully satisfied
 * `in_progress`  — has some data but criteria not yet met
 * `locked`       — prerequisite gate not yet done
 *
 * Each gate also returns a `nextActionKey` — the i18n key for the
 * "What's next" banner on the corresponding tab page.
 */

/** Items considered "out of flow" — they don't count toward delivery/handover. */
const ITEM_EXCEPTIONS = ['on_hold', 'substituted', 'cancelled'] as const;

/** Item status order. Used to determine "status >= X". */
const ITEM_STATUS_ORDER: Record<string, number> = {
  specified: 0,
  quoted: 1,
  ordered: 2,
  in_production: 3,
  ready: 4,
  shipped: 5,
  received: 6,
  installed: 7,
  signed_off: 8,
  // Out-of-flow / damaged statuses don't participate in ordering
  on_hold: -1,
  substituted: -1,
  cancelled: -1,
  damaged: -1,
  backorder: -1
};

function itemStatusAtLeast(status: string, threshold: keyof typeof ITEM_STATUS_ORDER) {
  // Both sides default to -1 for unknown statuses. Required even on the right
  // (where `threshold` is keyof) because TypeScript's noUncheckedIndexedAccess
  // returns `number | undefined` for record-typed indexing regardless of key
  // narrowing.
  return (ITEM_STATUS_ORDER[status] ?? -1) >= (ITEM_STATUS_ORDER[threshold] ?? -1);
}

/** Brief: description filled + role set + approved scope approval exists. */
async function briefGate(
  projectId: string,
  project: { description: string | null; fablabRole: string | null }
): Promise<GateResult> {
  const hasDescription = !!project.description?.trim();
  const hasRole = !!project.fablabRole;

  // Approved scope approval = any approval row for this project with
  // scopeBaselineVersionId set and status in (approved, approved_with_conditions)
  const approvedScope = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(
        eq(approvals.projectId, projectId),
        sql`${approvals.scopeBaselineVersionId} IS NOT NULL`,
        inArray(approvals.status, ['approved', 'approved_with_conditions'])
      )
    )
    .limit(1);

  const hasApproval = approvedScope.length > 0;

  if (hasDescription && hasRole && hasApproval) {
    return { state: 'done' };
  }

  let nextActionKey: string;
  if (!hasDescription) nextActionKey = 'gate.brief.next_description';
  else if (!hasRole) nextActionKey = 'gate.brief.next_role';
  else nextActionKey = 'gate.brief.next_approval';

  return { state: 'in_progress', nextActionKey };
}

/** Scope: at least one scope baseline version has status='approved'. */
async function scopeGate(projectId: string, brief: GateResult): Promise<GateResult> {
  if (brief.state !== 'done') {
    return { state: 'locked', nextActionKey: 'gate.scope.next_brief' };
  }

  const approved = await db
    .select({ id: scopeBaselineVersions.id })
    .from(scopeBaselineVersions)
    .innerJoin(
      scopeBaselines,
      eq(scopeBaselineVersions.scopeBaselineId, scopeBaselines.id)
    )
    .where(
      and(
        eq(scopeBaselines.projectId, projectId),
        eq(scopeBaselineVersions.status, 'approved')
      )
    )
    .limit(1);

  if (approved.length > 0) return { state: 'done' };
  return { state: 'in_progress', nextActionKey: 'gate.scope.next_approve' };
}

/** Items: at least one item exists; all items have costState != 'estimated'. */
async function itemsGate(
  projectId: string,
  scope: GateResult
): Promise<GateResult> {
  if (scope.state !== 'done') {
    return { state: 'locked', nextActionKey: 'gate.items.next_scope' };
  }

  // Items in packages of this project, excluding out-of-flow statuses.
  const rows = await db
    .select({ costState: items.costState })
    .from(items)
    .innerJoin(packages, eq(items.packageId, packages.id))
    .where(
      and(
        eq(packages.projectId, projectId),
        sql`${items.status} NOT IN ('cancelled', 'substituted')`
      )
    );

  const total = rows.length;
  if (total === 0) {
    return {
      state: 'in_progress',
      count: 0,
      total: 0,
      nextActionKey: 'gate.items.next_create'
    };
  }
  const allQuoted = rows.every((r) => r.costState !== 'estimated');
  if (allQuoted) return { state: 'done', count: total, total };
  const quoted = rows.filter((r) => r.costState !== 'estimated').length;
  return {
    state: 'in_progress',
    count: quoted,
    total,
    nextActionKey: 'gate.items.next_quote'
  };
}

/** Procurement: at least one PO has status='issued' (or beyond). */
async function procurementGate(
  projectId: string,
  itemsResult: GateResult
): Promise<GateResult> {
  if (itemsResult.state !== 'done') {
    return { state: 'locked', nextActionKey: 'gate.procurement.next_items' };
  }

  const issued = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.projectId, projectId),
        inArray(purchaseOrders.status, [
          'issued',
          'confirmed',
          'partially_fulfilled',
          'fulfilled'
        ])
      )
    )
    .limit(1);

  if (issued.length > 0) return { state: 'done' };
  return { state: 'in_progress', nextActionKey: 'gate.procurement.next_issue' };
}

/** Delivery: all in-flow items have status >= 'received'. */
async function deliveryGate(
  projectId: string,
  procurement: GateResult
): Promise<GateResult> {
  if (procurement.state !== 'done') {
    return { state: 'locked', nextActionKey: 'gate.delivery.next_procurement' };
  }

  const rows = await db
    .select({ status: items.status })
    .from(items)
    .innerJoin(packages, eq(items.packageId, packages.id))
    .where(
      and(
        eq(packages.projectId, projectId),
        sql`${items.status} NOT IN ('cancelled', 'substituted', 'on_hold')`
      )
    );

  const total = rows.length;
  if (total === 0) {
    return { state: 'in_progress', count: 0, total: 0 };
  }
  const received = rows.filter((r) => itemStatusAtLeast(r.status, 'received'));
  if (received.length === total) {
    return { state: 'done', count: total, total };
  }
  return {
    state: 'in_progress',
    count: received.length,
    total,
    nextActionKey: 'gate.delivery.next_track'
  };
}

/** Handover: all in-flow items have status='signed_off'. */
async function handoverGate(
  projectId: string,
  delivery: GateResult
): Promise<GateResult> {
  if (delivery.state !== 'done') {
    return { state: 'locked', nextActionKey: 'gate.handover.next_delivery' };
  }

  const rows = await db
    .select({ status: items.status })
    .from(items)
    .innerJoin(packages, eq(items.packageId, packages.id))
    .where(
      and(
        eq(packages.projectId, projectId),
        sql`${items.status} NOT IN ('cancelled', 'substituted', 'on_hold')`
      )
    );

  const total = rows.length;
  if (total === 0) {
    return { state: 'in_progress', count: 0, total: 0 };
  }
  const signedOff = rows.filter((r) => r.status === 'signed_off').length;
  if (signedOff === total) {
    return { state: 'done', count: total, total };
  }
  return {
    state: 'in_progress',
    count: signedOff,
    total,
    nextActionKey: 'gate.handover.next_signoff'
  };
}

/**
 * Compute all six gates for a project. Cached per request so the stepper +
 * each page can call it without duplicate queries.
 *
 * Returns a default "all locked" map when DATABASE_URL is missing, so the
 * UI still renders during static-build-style envs (though we run dynamic).
 */
export const getProjectGates = cache(
  async (projectId: string): Promise<ProjectGates> => {
    if (!process.env.DATABASE_URL) {
      const empty: GateResult = { state: 'locked' };
      return {
        brief: empty,
        scope: empty,
        items: empty,
        procurement: empty,
        delivery: empty,
        handover: empty
      };
    }

    try {
      const [project] = await db
        .select({
          description: projects.description,
          fablabRole: projects.fablabRole
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        const empty: GateResult = { state: 'locked' };
        return {
          brief: empty,
          scope: empty,
          items: empty,
          procurement: empty,
          delivery: empty,
          handover: empty
        };
      }

      const brief = await briefGate(projectId, project);
      const scope = await scopeGate(projectId, brief);
      const itemsR = await itemsGate(projectId, scope);
      const procurement = await procurementGate(projectId, itemsR);
      const delivery = await deliveryGate(projectId, procurement);
      const handover = await handoverGate(projectId, delivery);

      return { brief, scope, items: itemsR, procurement, delivery, handover };
    } catch {
      const empty: GateResult = { state: 'locked' };
      return {
        brief: empty,
        scope: empty,
        items: empty,
        procurement: empty,
        delivery: empty,
        handover: empty
      };
    }
  }
);

// (Constants and pure helpers live in src/lib/project-gates.ts and are
// re-exported at the top of this file.)
