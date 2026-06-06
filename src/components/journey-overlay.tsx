'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type Route = {
  href: string;          // Template path (e.g. '/projects/[id]/approvals')
  label: string;
  comingSoon?: boolean;
};

type Section = {
  title: string;
  description?: string;
  routes: Route[];
};

/**
 * The canonical app journey. Edit this when routes change; everything else
 * derives from it. Project-scoped routes use `[id]` placeholders that get
 * substituted with the active project id when the user is inside a project.
 */
const SECTIONS: Section[] = [
  {
    title: 'Discovery',
    routes: [
      { href: '/leads', label: 'Leads (list)' },
      { href: '/leads/new', label: 'New lead' }
    ]
  },
  {
    title: 'Projects',
    routes: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/projects', label: 'All projects' }
    ]
  },
  {
    title: 'Per-project modules',
    description: 'Available when working inside a project',
    routes: [
      { href: '/projects/[id]', label: 'Brief' },
      { href: '/projects/[id]/approvals', label: 'Approvals' },
      { href: '/projects/[id]/approvals/new', label: 'Request approval' },
      { href: '/projects/[id]/packages', label: 'Packages' },
      { href: '/projects/[id]/items/new', label: 'New item' },
      { href: '/projects/[id]/rfqs', label: 'RFQs' },
      { href: '/projects/[id]/rfqs/new', label: 'New RFQ' },
      { href: '/projects/[id]/pos', label: 'Purchase orders' },
      { href: '/projects/[id]/pos/new', label: 'New PO' },
      { href: '/projects/[id]/finance', label: 'Project finance' },
      { href: '/projects/[id]/finance/new', label: 'Log Poweroffice invoice' },
      { href: '/projects/[id]/element-list/internal', label: 'Element list — internal' },
      { href: '/projects/[id]/element-list/customer', label: 'Element list — customer' }
    ]
  },
  {
    title: 'Cross-project & reference',
    routes: [
      { href: '/vendors', label: 'Vendors' },
      { href: '/vendors/new', label: 'New vendor' },
      { href: '/finance', label: 'Finance (cross-project)' },
      { href: '/clients', label: 'Clients', comingSoon: true },
      { href: '/procurement', label: 'Procurement', comingSoon: true },
      { href: '/time', label: 'Time entry', comingSoon: true },
      { href: '/workshop', label: 'Workshop', comingSoon: true },
      { href: '/templates', label: 'Templates', comingSoon: true },
      { href: '/translations', label: 'Translations', comingSoon: true }
    ]
  }
];

/** 7-stage project lifecycle (mirrors stage.* in messages files). */
const STAGES = [
  { num: '①', label: 'Brief' },
  { num: '②', label: 'Concept' },
  { num: '③', label: 'Design Development' },
  { num: '④', label: 'Specification' },
  { num: '⑤', label: 'Procurement & Production' },
  { num: '⑥', label: 'Installation' },
  { num: '⑦', label: 'Handover' }
];

const STORAGE_KEY = 'fablab.journey.open';

export function JourneyOverlay() {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore open state from localStorage on mount
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // localStorage can throw in some privacy modes; ignore
    }
    setHydrated(true);
  }, []);

  // Persist open state
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      // ignore
    }
  }, [open, hydrated]);

  // Close drawer on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Extract active project id from pathname, if any
  const projectIdMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId =
    projectIdMatch && projectIdMatch[1] !== 'new' ? projectIdMatch[1] : null;

  const resolveHref = (href: string) =>
    href.includes('[id]') && projectId ? href.replace('[id]', projectId) : href;

  const isActive = (href: string) => pathname === resolveHref(href);

  const currentRoute = SECTIONS.flatMap((s) => s.routes).find((r) =>
    isActive(r.href)
  );

  return (
    <>
      {/* Collapsed pill — always rendered so the button is reachable.
          Hidden visually when the drawer is open. */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-full shadow text-[12px] text-ink-2 hover:bg-bg cursor-pointer ${
          open ? 'invisible' : ''
        }`}
        aria-label="Open journey overlay"
        aria-expanded={open}
      >
        <span className="text-brand">●</span>
        Journey
        {currentRoute && (
          <span className="text-ink-3">· {currentRoute.label}</span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed top-0 right-0 z-50 h-screen w-[420px] max-w-full bg-surface border-l border-line overflow-y-auto"
            aria-label="Journey overlay"
            role="dialog"
          >
            <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-[14px]">Journey</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-ink-3 hover:text-ink cursor-pointer text-xl leading-none w-6 h-6 flex items-center justify-center"
                aria-label="Close journey overlay"
              >
                ×
              </button>
            </div>

            <div className="p-4 space-y-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-1">
                  You are here
                </div>
                <div className="text-[12px] font-mono text-ink-2 break-all">
                  {pathname}
                </div>
                {currentRoute && (
                  <div className="text-[13px] mt-1 text-ink">
                    ↳ {currentRoute.label}
                  </div>
                )}
              </div>

              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-1">
                    {section.title}
                  </div>
                  {section.description && (
                    <div className="text-[11px] text-ink-3 mb-2 italic">
                      {section.description}
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {section.routes.map((route) => {
                      const active = isActive(route.href);
                      const hasContext =
                        !route.href.includes('[id]') || !!projectId;
                      const linkable = hasContext && !route.comingSoon;
                      const className = `flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px] ${
                        active
                          ? 'bg-bg text-ink font-medium'
                          : linkable
                            ? 'text-ink-2'
                            : 'text-ink-3'
                      } ${
                        linkable ? 'hover:bg-bg cursor-pointer' : 'cursor-default'
                      }`;
                      const tag = route.comingSoon
                        ? 'soon'
                        : !hasContext
                          ? 'in a project'
                          : null;
                      const content = (
                        <>
                          <span>{route.label}</span>
                          {tag && (
                            <span className="text-[10px] text-ink-3">
                              {tag}
                            </span>
                          )}
                        </>
                      );
                      return (
                        <li key={route.href}>
                          {linkable ? (
                            <Link
                              href={resolveHref(route.href)}
                              onClick={() => setOpen(false)}
                              className={className}
                            >
                              {content}
                            </Link>
                          ) : (
                            <div className={className}>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-2">
                  Project lifecycle
                </div>
                <ol className="space-y-1">
                  {STAGES.map((s) => (
                    <li
                      key={s.label}
                      className="flex items-center gap-2 text-[13px] text-ink-2"
                    >
                      <span className="text-ink-3 tabular-nums w-4 text-center">
                        {s.num}
                      </span>
                      <span>{s.label}</span>
                    </li>
                  ))}
                </ol>
                <div className="text-[11px] text-ink-3 mt-2 italic">
                  Each project advances through these stages.
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
