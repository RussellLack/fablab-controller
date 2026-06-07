'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Layer C — horizontal sibling-navigation pill bar listing every
 * module on a project.
 *
 * Reads pathname client-side so the active pill highlights wherever
 * the user is. Overflows to horizontal scroll on narrow viewports
 * via `overflow-x-auto` — the desktop / workshop screen this app
 * primarily targets fits everything inline.
 *
 * The Coach pill carries a small count badge when there are open
 * recommendations. This is the only pill that ever earns a numeric
 * decoration — by design. The other modules show counts on their
 * own pages; the bar stays scannable.
 *
 * Ordering follows the lifecycle spine from `00-` §18:
 * Brief → Scope → Items → Approvals → RFQs → POs → Delivery →
 * Handover, then the transverse modules (Risk, Change control,
 * Coach, Reporting).
 */

const MODULES = [
  { slug: '', labelKey: 'crumbs.brief' },             // project root = Brief
  { slug: 'scope', labelKey: 'crumbs.scope' },
  { slug: 'packages', labelKey: 'crumbs.packages' },
  { slug: 'approvals', labelKey: 'crumbs.approvals' },
  { slug: 'rfqs', labelKey: 'crumbs.rfqs' },
  { slug: 'pos', labelKey: 'crumbs.pos' },
  { slug: 'finance', labelKey: 'crumbs.finance' },
  { slug: 'delivery', labelKey: 'crumbs.delivery' },
  { slug: 'handover', labelKey: 'crumbs.handover' },
  { slug: 'risk', labelKey: 'crumbs.risk' },
  { slug: 'change-control', labelKey: 'crumbs.change_control' },
  { slug: 'coach', labelKey: 'crumbs.coach' },
  { slug: 'element-list', labelKey: 'crumbs.reporting' }
] as const;

export function ProjectModuleBar({
  projectId,
  openCoachCount
}: {
  projectId: string;
  /** Open + acknowledged recs from project_coach_recommendations. 0 = hide badge. */
  openCoachCount: number;
}) {
  const t = useTranslations();
  const pathname = usePathname() ?? '';
  const projectRoot = `/projects/${projectId}`;
  const subPath = pathname.startsWith(projectRoot)
    ? pathname.slice(projectRoot.length).replace(/^\/+/, '')
    : '';
  // Active module = first sub-path segment; '' = project root (Brief).
  const activeSlug = subPath.split('/')[0] ?? '';

  return (
    <nav
      aria-label="Project modules"
      className="overflow-x-auto -mx-1 mb-3 border-b border-line"
    >
      <ul className="flex gap-0.5 px-1 min-w-max">
        {MODULES.map((m) => {
          const href = m.slug ? `${projectRoot}/${m.slug}` : projectRoot;
          const isActive = activeSlug === m.slug;
          const isCoach = m.slug === 'coach';
          return (
            <li key={m.slug || 'brief'}>
              <Link
                href={href}
                className={`inline-flex items-baseline gap-1 px-3 py-1.5 text-[12px] whitespace-nowrap border-b-2 transition-colors duration-75 select-none ${
                  isActive
                    ? 'border-brand text-ink font-semibold'
                    : 'border-transparent text-ink-2 hover:text-ink hover:bg-bg/40 active:bg-line/60'
                }`}
              >
                {isCoach && <span className="text-brand">◐</span>}
                <span>{t(m.labelKey)}</span>
                {isCoach && openCoachCount > 0 && (
                  <span className="ml-0.5 text-[10px] px-1 rounded bg-brand-soft text-brand">
                    {openCoachCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
