'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

const TABS = [
  { slug: '', key: 'tab.brief' },
  { slug: 'scope', key: 'tab.scope' },
  { slug: 'approvals', key: 'tab.approvals' },
  { slug: 'packages', key: 'tab.packages' },
  { slug: 'rfqs', key: 'tab.rfqs' },
  { slug: 'pos', key: 'tab.pos' },
  { slug: 'finance', key: 'tab.finance' }
  // Drawings / Snags / Lessons land in later waves
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <div className="flex gap-1 border-b border-line mb-4 flex-wrap">
      {TABS.map(tab => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const isActive = tab.slug
          ? pathname.startsWith(href)
          : pathname === base;
        return (
          <Link
            key={tab.slug}
            href={href}
            className={cx(
              'px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px',
              isActive ? 'text-ink border-accent' : 'text-ink-2 border-transparent hover:text-ink'
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
