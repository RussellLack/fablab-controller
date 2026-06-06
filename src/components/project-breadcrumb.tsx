'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Layer B — full breadcrumb path with explicit "↩ Dashboard" home
 * link at the start.
 *
 * Reads the current pathname client-side to figure out which project
 * sub-page is active. The pathname pattern under (app) is:
 *
 *   /projects/[id]                        → project root (Brief)
 *   /projects/[id]/scope                  → Scope
 *   /projects/[id]/items/[itemId]         → Item detail
 *   /projects/[id]/pos/[poId]             → PO detail
 *   ...etc
 *
 * The segment table below maps the first sub-path segment to a
 * translation key + label. The optional second-level (item ID, PO ID,
 * etc.) becomes a generic "Detail" segment with no link.
 *
 * Design rule: every segment except the LAST is a clickable link.
 * The last segment is the current page and stays plain text.
 */

type ProjectBreadcrumbProps = {
  projectId: string;
  projectRef: string;
  projectTitle: string;
};

// First-level sub-routes under /projects/[id]/...
const SUB_ROUTE_LABELS: Record<string, string> = {
  scope: 'crumbs.scope',
  items: 'crumbs.items',
  packages: 'crumbs.packages',
  approvals: 'crumbs.approvals',
  rfqs: 'crumbs.rfqs',
  pos: 'crumbs.pos',
  finance: 'crumbs.finance',
  delivery: 'crumbs.delivery',
  handover: 'crumbs.handover',
  risk: 'crumbs.risk',
  reporting: 'crumbs.reporting',
  'change-control': 'crumbs.change_control',
  coach: 'crumbs.coach',
  'element-list': 'crumbs.element_list'
};

export function ProjectBreadcrumb({
  projectId,
  projectRef,
  projectTitle
}: ProjectBreadcrumbProps) {
  const t = useTranslations();
  const pathname = usePathname() ?? '';

  // Strip the /projects/[id] prefix so we have just the sub-path.
  const projectRoot = `/projects/${projectId}`;
  const subPath = pathname.startsWith(projectRoot)
    ? pathname.slice(projectRoot.length).replace(/^\/+|\/+$/g, '')
    : '';
  const segments = subPath ? subPath.split('/') : [];
  // segments[0] is the module slug (scope/items/...), segments[1]
  // is the entity id if there's a detail page. Module slug may also
  // not exist (project root → segments = []).

  const moduleSlug = segments[0];
  const hasDetail = segments.length >= 2;

  return (
    <nav
      aria-label="Breadcrumb"
      className="text-[12px] text-ink-3 mb-2 flex items-center flex-wrap gap-x-1.5 gap-y-1"
    >
      <Link href="/dashboard" className="hover:text-ink whitespace-nowrap">
        ↩ {t('crumbs.dashboard')}
      </Link>
      <span aria-hidden>·</span>
      <Link href="/projects" className="hover:text-ink">
        {t('crumbs.projects')}
      </Link>
      <span aria-hidden>·</span>

      {/* Project segment — linked if we're not on the project root */}
      {moduleSlug ? (
        <Link
          href={projectRoot}
          className="hover:text-ink"
          title={projectTitle}
        >
          <span className="font-mono">{projectRef}</span>
        </Link>
      ) : (
        <span className="text-ink font-semibold" title={projectTitle}>
          <span className="font-mono">{projectRef}</span>
          <span className="text-ink-2 font-normal ml-1.5">{projectTitle}</span>
        </span>
      )}

      {moduleSlug && SUB_ROUTE_LABELS[moduleSlug] && (
        <>
          <span aria-hidden>·</span>
          {hasDetail ? (
            <Link
              href={`${projectRoot}/${moduleSlug}`}
              className="hover:text-ink"
            >
              {t(SUB_ROUTE_LABELS[moduleSlug])}
            </Link>
          ) : (
            <span className="text-ink font-semibold">
              {t(SUB_ROUTE_LABELS[moduleSlug])}
            </span>
          )}
        </>
      )}

      {hasDetail && (
        <>
          <span aria-hidden>·</span>
          <span className="text-ink font-semibold">
            {t('crumbs.detail')}
          </span>
        </>
      )}
    </nav>
  );
}
