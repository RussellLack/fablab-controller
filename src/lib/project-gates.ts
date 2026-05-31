/**
 * Client-safe types, constants, and pure helpers for project gates.
 *
 * Lives in `src/lib/` (no db imports) so client components like
 * <ProjectStepper> can import the shape and helpers without pulling in
 * the postgres driver via @/db. The actual gate-computing query
 * `getProjectGates` stays in src/server/queries/project-gates.ts and is
 * only callable from server components / route handlers / server actions.
 */

export type GateName =
  | 'brief'
  | 'scope'
  | 'items'
  | 'procurement'
  | 'delivery'
  | 'handover';

export type GateState = 'done' | 'in_progress' | 'locked';

export type GateResult = {
  state: GateState;
  nextActionKey?: string;
  /** Optional count for display (e.g. items: total). */
  count?: number;
  /** Optional total for ratio display (e.g. items received / total). */
  total?: number;
};

export type ProjectGates = Record<GateName, GateResult>;

/** Order matters — the stepper renders in this sequence. */
export const GATE_ORDER: GateName[] = [
  'brief',
  'scope',
  'items',
  'procurement',
  'delivery',
  'handover'
];

/** Map a gate name to the route slug it lands on, given a project id. */
export function gateHref(gate: GateName, projectId: string): string {
  const base = `/projects/${projectId}`;
  switch (gate) {
    case 'brief':       return base;
    case 'scope':       return `${base}/scope`;
    case 'items':       return `${base}/packages`;       // Phase 2 keeps existing route
    case 'procurement': return `${base}/rfqs`;           // landing on RFQs
    case 'delivery':    return `${base}/delivery`;
    case 'handover':    return `${base}/handover`;
  }
}

/** Step numerals — Unicode circled digits for the stepper UI. */
export const GATE_NUMERAL: Record<GateName, string> = {
  brief: '①',
  scope: '②',
  items: '③',
  procurement: '④',
  delivery: '⑤',
  handover: '⑥'
};
