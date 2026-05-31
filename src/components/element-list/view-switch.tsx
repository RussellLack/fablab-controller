'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

type View = 'internal' | 'customer' | 'supplier';

export function ElementListViewSwitch({ projectId, current }: { projectId: string; current: View }) {
  const t = useTranslations();
  const base = `/projects/${projectId}/element-list`;
  const items: { v: View; href: string }[] = [
    { v: 'internal', href: `${base}/internal` },
    { v: 'customer', href: `${base}/customer` },
    { v: 'supplier', href: `${base}/supplier` }
  ];
  return (
    <div className="inline-flex bg-bg border border-line rounded-md p-0.5 gap-0.5">
      {items.map(({ v, href }) => (
        <Link
          key={v}
          href={href}
          className={cx(
            'px-3 py-1.5 text-[12px] font-semibold rounded',
            current === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
          )}
        >
          {t(`elementList.view.${v}`)}
        </Link>
      ))}
    </div>
  );
}
