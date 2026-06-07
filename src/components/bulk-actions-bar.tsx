'use client';

import { useTranslations } from 'next-intl';

/**
 * Floating action bar shown when there's at least one row selected
 * in an entity explorer's table view. Sticks to the bottom of the
 * viewport on top of the page content; ignores layout.
 *
 * Page-specific actions are passed via `children` so this component
 * stays entity-agnostic. The Clear button + selection count are the
 * only universals.
 */
export function BulkActionsBar({
  count,
  onClear,
  children
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  if (count === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-ink text-surface rounded-lg shadow-2xl px-3 py-2 flex items-center gap-3 text-[13px]">
      <span className="font-semibold">
        {t('bulk.n_selected', { n: count })}
      </span>
      <div className="w-px h-5 bg-surface/30" />
      {children}
      <div className="w-px h-5 bg-surface/30" />
      <button
        onClick={onClear}
        className="text-surface/70 hover:text-surface text-[12px]"
      >
        {t('bulk.clear')}
      </button>
    </div>
  );
}
