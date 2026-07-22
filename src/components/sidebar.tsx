'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

/**
 * Two-mode sidebar.
 *
 * GLOBAL MODE — everywhere except inside a project. Four groups grounded in
 * `00-industry-best-practices.md` §18: Today / Pipeline / Cross-project /
 * Reference. Reference is collapsed by default.
 *
 * PROJECT MODE — when the route matches `/projects/[id]/*`. Sidebar swaps to
 * show the Project Control File strip plus the project's linear (numbered)
 * and transverse modules. A "Back to global nav" footer link returns to
 * global mode.
 *
 * Module taxonomy follows the 12 modules in `00-` §18. Unbuilt modules
 * (Change Control, Delivery, Risk, Reporting at project level) appear as
 * non-navigable stubs labelled "soon" so the destination map is visible
 * before implementation. Phase 2 will add progressive done/in-progress/locked
 * state and the gate-detection logic.
 */

type Item = {
  href: string;
  key: string;
  icon?: string;
  badge?: string;
  soon?: boolean;
};

type Group = {
  titleKey: string;
  items: Item[];
  collapsible?: boolean;
};

// ─── Global mode ────────────────────────────────────────────────────────────

const GLOBAL_GROUPS: Group[] = [
  {
    titleKey: 'sidebar.group_today',
    items: [
      // Phase 1 keeps the route at /dashboard; Phase 3 replaces it with a real
      // Today view. We only relabel the nav item here.
      { href: '/dashboard', key: 'nav.today', icon: '▦' }
    ]
  },
  {
    titleKey: 'sidebar.group_pipeline',
    items: [
      { href: '/leads', key: 'nav.leads', icon: '▷', badge: '8' },
      { href: '/projects', key: 'nav.projects', icon: '▤', badge: '14' }
    ]
  },
  {
    titleKey: 'sidebar.group_cross_project',
    items: [
      { href: '/vendors', key: 'nav.vendors', icon: '▩' },
      { href: '/finance', key: 'nav.finance', icon: '◈' },
      { href: '/risk', key: 'nav.risk', icon: '⚠' },
      { href: '/reporting', key: 'nav.reporting', icon: '▦' }
    ]
  },
  {
    titleKey: 'sidebar.group_reference',
    collapsible: true,
    items: [
      { href: '/clients', key: 'nav.clients' },
      { href: '/templates', key: 'nav.templates' },
      { href: '/translations', key: 'nav.translation' },
      { href: '/time', key: 'nav.time' },
      { href: '/workshop', key: 'nav.workshop' }
    ]
  }
];

// ─── Project mode ───────────────────────────────────────────────────────────

/** Build per-project nav items from a project id. */
function projectGroups(id: string): Group[] {
  const base = `/projects/${id}`;
  return [
    {
      titleKey: 'sidebar.linear',
      items: [
        { href: `${base}`, key: 'tab.brief', icon: '①' },
        { href: `${base}/scope`, key: 'tab.scope', icon: '②' },
        { href: `${base}/packages`, key: 'tab.items', icon: '③' },
        // Procurement umbrella for now points at RFQs; Phase 2 will introduce a
        // proper /procurement landing that branches to RFQs + POs.
        { href: `${base}/rfqs`, key: 'tab.rfqs', icon: '④' },
        { href: `${base}/pos`, key: 'tab.pos', icon: '⑤' },
        { href: `${base}/delivery`, key: 'tab.delivery', icon: '⑥' },
        { href: `${base}/handover`, key: 'tab.handover', icon: '⑦' }
      ]
    },
    {
      titleKey: 'sidebar.transverse',
      items: [
        { href: `${base}/approvals`, key: 'tab.approvals', icon: '⌽' },
        { href: `${base}/change-control`, key: 'tab.change_control', icon: '⇄' },
        { href: `${base}/risk`, key: 'tab.risk', icon: '⚠' },
        { href: `${base}/finance`, key: 'tab.finance', icon: '◈' },
        // Element list is the existing route; doc treats it as the Reporting
        // module's first surface. Renamed in nav, route unchanged.
        { href: `${base}/element-list`, key: 'tab.reporting', icon: '▦' }
      ]
    }
  ];
}

// ─── Components ─────────────────────────────────────────────────────────────

function NavLink({ item, pathname }: { item: Item; pathname: string }) {
  const t = useTranslations();
  const active = !item.soon && pathname === item.href;
  const className = cx(
    'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors duration-75 select-none',
    active && 'bg-ink text-surface',
    !active && !item.soon && 'text-ink-2 hover:bg-bg hover:text-ink active:bg-line',
    item.soon && 'text-ink-3 cursor-default'
  );
  const inner = (
    <>
      {item.icon && (
        <span className="w-4 inline-block opacity-80 text-center">{item.icon}</span>
      )}
      <span>{t(item.key)}</span>
      {item.badge && !item.soon && (
        <span className="ml-auto bg-accent-soft text-accent text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      )}
      {item.soon && (
        <span className="ml-auto text-[10px] text-ink-3">{t('sidebar.soon')}</span>
      )}
    </>
  );
  return item.soon ? (
    <div className={className}>{inner}</div>
  ) : (
    <Link href={item.href} className={className}>
      {inner}
    </Link>
  );
}

function NavGroupBlock({
  group,
  pathname
}: {
  group: Group;
  pathname: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(!group.collapsible);

  // Persist collapsed state for the Reference group across navigations
  useEffect(() => {
    if (!group.collapsible) return;
    try {
      const stored = localStorage.getItem(`sidebar.group.${group.titleKey}`);
      if (stored === '1') setOpen(true);
      else if (stored === '0') setOpen(false);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!group.collapsible) return;
    try {
      localStorage.setItem(
        `sidebar.group.${group.titleKey}`,
        open ? '1' : '0'
      );
    } catch {
      // ignore
    }
  }, [open, group.collapsible, group.titleKey]);

  return (
    <div className="mb-1">
      {group.collapsible ? (
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-3 px-3 pt-3 pb-1.5 hover:text-ink active:text-ink/70 cursor-pointer select-none transition-colors duration-75"
          aria-expanded={open}
        >
          <span>{t(group.titleKey)}</span>
          <span className="text-ink-3 text-[10px]">{open ? '▾' : '▸'}</span>
        </button>
      ) : (
        <div className="text-[11px] uppercase tracking-wider text-ink-3 px-3 pt-3 pb-1.5">
          {t(group.titleKey)}
        </div>
      )}
      {open &&
        group.items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
    </div>
  );
}

function ProjectControlFileStrip({ projectId }: { projectId: string }) {
  const t = useTranslations();
  // We can't fetch the project ref here without going server-side; show a
  // short id slice as anchor text. Full ref + title live in the page header.
  const shortId = projectId.slice(0, 8);
  return (
    <div className="border-b border-line pb-3 mb-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-3 px-3 pt-3">
        {t('sidebar.pcf_title')}
      </div>
      <div className="px-3 pt-1 pb-2">
        <div className="text-[13px] font-semibold font-mono text-ink">
          {shortId}…
        </div>
      </div>
      <Link
        href="/projects"
        className="block px-3 py-1.5 text-[12px] text-ink-2 hover:text-ink hover:bg-bg rounded-md mx-1"
      >
        {t('sidebar.switch_projects')} →
      </Link>
    </div>
  );
}

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId =
    projectMatch && projectMatch[1] !== 'new' ? projectMatch[1] : null;
  const t = useTranslations();

  if (projectId) {
    const groups = projectGroups(projectId);
    return (
      <aside className="bg-surface border-r border-line p-3 overflow-y-auto flex flex-col">
        <ProjectControlFileStrip projectId={projectId} />
        <div className="flex-1">
          {groups.map((g) => (
            <NavGroupBlock key={g.titleKey} group={g} pathname={pathname} />
          ))}
        </div>
        <Link
          href="/dashboard"
          className="mt-4 pt-3 border-t border-line text-[12px] text-ink-3 hover:text-ink px-3 py-1.5 block"
        >
          ← {t('sidebar.back_to_global')}
        </Link>
      </aside>
    );
  }

  return (
    <aside className="bg-surface border-r border-line p-3 overflow-y-auto">
      {GLOBAL_GROUPS.map((g) => (
        <NavGroupBlock key={g.titleKey} group={g} pathname={pathname} />
      ))}
      {isAdmin && (
        <NavGroupBlock
          group={{
            titleKey: 'sidebar.group_admin',
            items: [{ href: '/team', key: 'nav.team', icon: '◐' }]
          }}
          pathname={pathname}
        />
      )}
    </aside>
  );
}
