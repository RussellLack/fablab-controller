/**
 * Client-safe staff role definitions and the shared action-result shape.
 *
 * Kept free of any server-only imports (no db, no supabase) so both Client
 * Components (the Team screen) and server code can import it without pulling
 * server code into the browser bundle.
 */
export const STAFF_ROLES = [
  'project_lead',
  'designer',
  'procurement',
  'site_coordinator',
  'approver',
  'admin'
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
