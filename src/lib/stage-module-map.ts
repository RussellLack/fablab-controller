/**
 * Single source of truth for "which module does each stage live in?"
 *
 * Two project navigation axes (see `21-ux-design.md`):
 *
 *   STAGE   = where the project is in time (the 7-step lifecycle).
 *             Set by the Advance / Hold workflow with gate validation.
 *   MODULE  = which tool / surface the user is on. 13 modules; 7 are
 *             linear (correspond to stages), 6 are transverse (open
 *             at every stage).
 *
 * This map answers the canonical-module question: "for stage X, where
 * is the active work supposed to happen?" Used by:
 *
 *   • <ProjectModuleBar> — highlights the linear module that
 *     corresponds to the project's current stage so users know where
 *     to focus.
 *   • <StageFlow> — turns the stage circles into navigation. Click
 *     a stage circle → land on its canonical module.
 *
 * Notes on the mapping:
 *   • Two stages (concept, design_development) point at the same
 *     module (scope) — the scope module covers both. That's by design;
 *     it's the "design phase" surface.
 *   • The procurement_production stage points at rfqs (early phase of
 *     procurement). POs are still reachable from the module bar but
 *     RFQs is the canonical entry.
 *   • Non-lifecycle stages (on_hold, cancelled, archived, in_dispute)
 *     have no canonical module — they're terminal / transverse states
 *     and the function returns null.
 */

export const STAGE_TO_MODULE: Record<string, string> = {
  brief: '',                       // project root
  concept: 'scope',
  design_development: 'scope',
  specification: 'packages',
  procurement_production: 'rfqs',
  installation: 'delivery',
  handover: 'handover'
};

export function canonicalModuleForStage(stage: string): string | null {
  return stage in STAGE_TO_MODULE ? STAGE_TO_MODULE[stage]! : null;
}
