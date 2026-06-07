'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { canonicalModuleForStage } from '@/lib/stage-module-map';

/**
 * Layer C — horizontal module bar.
 *
 * Wires together the two project navigation axes (see `21-ux-design.md`
 * and `00-` §18):
 *
 *   • LINEAR modules (numbered ①–⑦) correspond 1:1 to the 7
 *     lifecycle stages. Brief → Omfang → Pakker → Pristilbud →
 *     Innkjøpsordrer → Levering → Overlevering. The numbers
 *     telegraph the stage relationship at a glance.
 *
 *   • TRANSVERSE modules sit after a divider and have no number.
 *     Available at every stage — Godkjenninger, Endringskontroll,
 *     Risiko, Økonomi, Coach, Rapportering.
 *
 *   • The linear module that matches the project's currentStage
 *     (via `canonicalModuleForStage`) gets a subtle "current
 *     focus" marker even when the user isn't viewing that tab,
 *     answering "where is the active work supposed to happen
 *     right now?"
 *
 * The Coach pill carries a count badge of open recommendations —
 * the only module that ever earns numeric decoration.
 */

type ModuleEntry =
  | { slug: string; labelKey: string; stageNumber: number; kind: 'linear' }
  | { slug: string; labelKey: string; kind: 'transverse'; icon?: string };

// Order matches the sidebar's Linear-then-Transverse grouping. The
// stageNumber on linear modules is the canonical step (①–⑦) shown
// inline in the tab label.
const MODULES: ModuleEntry[] = [
  { slug: '',           labelKey: 'crumbs.brief',     stageNumber: 1, kind: 'linear' },
  { slug: 'scope',      labelKey: 'crumbs.scope',     stageNumber: 2, kind: 'linear' },
  { slug: 'packages',   labelKey: 'crumbs.packages',  stageNumber: 3, kind: 'linear' },
  { slug: 'rfqs',       labelKey: 'crumbs.rfqs',      stageNumber: 4, kind: 'linear' },
  { slug: 'pos',        labelKey: 'crumbs.pos',       stageNumber: 5, kind: 'linear' },
  { slug: 'delivery',   labelKey: 'crumbs.delivery',  stageNumber: 6, kind: 'linear' },
  { slug: 'handover',   labelKey: 'crumbs.handover',  stageNumber: 7, kind: 'linear' },
  // ── divider ──
  { slug: 'approvals',      labelKey: 'crumbs.approvals',      kind: 'transverse' },
  { slug: 'change-control', labelKey: 'crumbs.change_control', kind: 'transverse' },
  { slug: 'risk',           labelKey: 'crumbs.risk',           kind: 'transverse' },
  { slug: 'finance',        labelKey: 'crumbs.finance',        kind: 'transverse' },
  { slug: 'coach',          labelKey: 'crumbs.coach',          kind: 'transverse', icon: '◐' },
  { slug: 'element-list',   labelKey: 'crumbs.reporting',      kind: 'transverse' }
];

// Stage-number glyphs (unicode circled digits). Kept as a lookup
// rather than computed so we don't accidentally render ⑧ or ⑨ if a
// new stage gets added without a matching design pass.
const STAGE_GLYPH: Record<number, string> = {
  1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', 6: '⑥', 7: '⑦'
};

export function ProjectModuleBar({
  projectId,
  currentStage,
  openCoachCount
}: {
  projectId: string;
  /** Lifecycle stage of the project — drives the active-stage cue. */
  currentStage: string;
  /** Open + acknowledged coach recs. 0 = hide badge. */
  openCoachCount: number;
}) {
  const t = useTranslations();
  const pathname = usePathname() ?? '';
  const projectRoot = `/projects/${projectId}`;
  const subPath = pathname.startsWith(projectRoot)
    ? pathname.slice(projectRoot.length).replace(/^\/+/, '')
    : '';
  const activeSlug = subPath.split('/')[0] ?? '';
  const focusSlug = canonicalModuleForStage(currentStage);

  return (
    <nav
      aria-label="Project modules"
      className="overflow-x-auto -mx-1 mb-3 border-b border-line"
    >
      <ul className="flex items-end gap-0.5 px-1 min-w-max">
        {MODULES.map((m, idx) => {
          const href = m.slug ? `${projectRoot}/${m.slug}` : projectRoot;
          const isActive = activeSlug === m.slug;
          const isCurrentFocus = !isActive && focusSlug !== null && focusSlug === m.slug;
          const isCoach = m.slug === 'coach';
          // Insert a vertical divider between the last linear module
          // and the first transverse module.
          const prev = MODULES[idx - 1];
          const showDivider =
            m.kind === 'transverse' && prev?.kind === 'linear';

          return (
            <li key={m.slug || 'brief'} className="flex items-end">
              {showDivider && (
                <span
                  aria-hidden
                  className="self-stretch w-px bg-line mx-1 my-1.5"
                />
              )}
              <Link
                href={href}
                className={`relative inline-flex items-baseline gap-1 px-3 py-1.5 text-[12px] whitespace-nowrap border-b-2 transition-colors duration-75 select-none ${
                  isActive
                    ? 'border-brand text-ink font-semibold'
                    : isCurrentFocus
                    ? 'border-transparent text-ink hover:bg-bg/40'
                    : 'border-transparent text-ink-2 hover:text-ink hover:bg-bg/40 active:bg-line/60'
                }`}
                title={
                  isCurrentFocus
                    ? t('module_bar.current_focus_hint')
                    : undefined
                }
              >
                {m.kind === 'linear' && (
                  <span
                    className={`text-[11px] mr-0.5 ${
                      isActive ? 'text-brand' : isCurrentFocus ? 'text-accent' : 'text-ink-3'
                    }`}
                  >
                    {STAGE_GLYPH[m.stageNumber] ?? ''}
                  </span>
                )}
                {m.kind === 'transverse' && m.icon && (
                  <span className="text-brand">{m.icon}</span>
                )}
                <span>{t(m.labelKey)}</span>
                {isCoach && openCoachCount > 0 && (
                  <span className="ml-0.5 text-[10px] px-1 rounded bg-brand-soft text-brand">
                    {openCoachCount}
                  </span>
                )}
                {/* Current-focus marker — small accent dot under the
                    tab label. Visible only on the non-active linear
                    module that corresponds to the project's stage. */}
                {isCurrentFocus && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 bottom-[-3px] w-1.5 h-1.5 rounded-full bg-accent"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
