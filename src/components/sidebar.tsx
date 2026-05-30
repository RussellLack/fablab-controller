'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

type Item = { href: string; key: string; icon: string; badge?: string };

const work: Item[] = [
  { href: '/dashboard', key: 'nav.dashboard', icon: '▦' },
  { href: '/leads', key: 'nav.leads', icon: '▷', badge: '8' },
  { href: '/projects', key: 'nav.projects', icon: '▤', badge: '14' },
  { href: '/clients', key: 'nav.clients', icon: '▥' },
  { href: '/procurement', key: 'nav.procurement', icon: '▣' },
  { href: '/finance', key: 'nav.finance', icon: '◈' },
  { href: '/time', key: 'nav.time', icon: '◐' }
];

const catalogue: Item[] = [
  { href: '/vendors', key: 'nav.vendors', icon: '▩' },
  { href: '/workshop', key: 'nav.workshop', icon: '▥' }
];

const admin: Item[] = [
  { href: '/templates', key: 'nav.templates', icon: '▦' },
  { href: '/translations', key: 'nav.translation', icon: '⌘' }
];

function NavGroup({ title, items, pathname }: { title: string; items: Item[]; pathname: string }) {
  const t = useTranslations();
  return (
    <>
      <div className="text-[11px] uppercase tracking-wider text-ink-3 px-3 pt-3 pb-1.5">
        {t(title)}
      </div>
      {items.map(item => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px]',
              active ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-bg hover:text-ink'
            )}
          >
            <span className="w-4 inline-block opacity-80">{item.icon}</span>
            <span>{t(item.key)}</span>
            {item.badge && (
              <span className="ml-auto bg-accent-soft text-accent text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="bg-surface border-r border-line p-3 overflow-y-auto">
      <NavGroup title="nav.work" items={work} pathname={pathname} />
      <NavGroup title="nav.catalogue" items={catalogue} pathname={pathname} />
      <NavGroup title="nav.admin" items={admin} pathname={pathname} />
    </aside>
  );
}
