'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Saved-views infrastructure for an entity explorer.
 *
 * State persists in localStorage under a per-page key so /clients,
 * /vendors, /projects can each have their own catalogue without
 * collision. The hook returns the views array + mutation helpers;
 * the <SavedViewTabs/> component renders the tab strip.
 *
 * Each view captures the full explorer snapshot (search + filter +
 * sort + view mode), so clicking a tab restores everything at once.
 * The shape of the captured snapshot is owned by the explorer; we
 * keep it as a generic JSON blob here so this file stays reusable.
 */

export type SavedView<S> = {
  id: string;
  name: string;
  state: S;
};

const STORAGE_PREFIX = 'fablab.savedViews.';

function makeStorageKey(page: string) {
  return STORAGE_PREFIX + page;
}

function readStored<S>(page: string): SavedView<S>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(makeStorageKey(page));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored<S>(page: string, views: SavedView<S>[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(makeStorageKey(page), JSON.stringify(views));
  } catch {
    // localStorage may be full / blocked — silently ignore. UI just
    // won't persist; user can still use the views in this session.
  }
}

/** Hook that owns the views array for one explorer page. */
export function useSavedViews<S>(page: string) {
  const [views, setViews] = useState<SavedView<S>[]>([]);

  // Hydrate from localStorage after mount to avoid SSR/CSR mismatch
  useEffect(() => {
    setViews(readStored<S>(page));
  }, [page]);

  function add(name: string, state: S) {
    const next: SavedView<S> = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || '(unnamed)',
      state
    };
    setViews((prev) => {
      const updated = [...prev, next];
      writeStored(page, updated);
      return updated;
    });
    return next.id;
  }

  function remove(id: string) {
    setViews((prev) => {
      const updated = prev.filter((v) => v.id !== id);
      writeStored(page, updated);
      return updated;
    });
  }

  function rename(id: string, name: string) {
    setViews((prev) => {
      const updated = prev.map((v) => (v.id === id ? { ...v, name } : v));
      writeStored(page, updated);
      return updated;
    });
  }

  return { views, add, remove, rename };
}

/**
 * Tab strip — renders "All" + each saved view + a "Save current"
 * action that prompts the user for a name and captures the current
 * state via `getCurrentState()`.
 *
 * `activeId` is null when "All" is selected.
 */
export function SavedViewTabs<S>({
  views,
  activeId,
  onSelectAll,
  onSelectView,
  onSave,
  onRemove
}: {
  views: SavedView<S>[];
  activeId: string | null;
  onSelectAll: () => void;
  onSelectView: (v: SavedView<S>) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations();

  function handleRemove(e: React.MouseEvent, id: string, name: string) {
    e.stopPropagation();
    if (confirm(t('explorer.confirm_delete_view', { name }))) onRemove(id);
  }

  return (
    <div className="flex items-center gap-1 mb-3 flex-wrap border-b border-line pb-2">
      <TabButton active={activeId === null} onClick={onSelectAll}>
        {t('explorer.tab_all')}
      </TabButton>
      {views.map((v) => (
        <TabButton key={v.id} active={activeId === v.id} onClick={() => onSelectView(v)}>
          <span>{v.name}</span>
          <button
            type="button"
            onClick={(e) => handleRemove(e, v.id, v.name)}
            className="ml-1 text-ink-3 hover:text-danger text-[10px]"
            title={t('explorer.delete_view')}
            aria-label={t('explorer.delete_view')}
          >
            ✕
          </button>
        </TabButton>
      ))}
      <button
        onClick={onSave}
        className="ml-2 text-[11px] text-ink-3 hover:text-ink underline-offset-2 hover:underline"
      >
        + {t('explorer.save_current_view')}
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-2.5 py-1 text-[12px] rounded-md transition-colors duration-75 ${
        active
          ? 'bg-ink text-surface font-medium'
          : 'bg-transparent text-ink-2 hover:text-ink hover:bg-bg active:bg-line'
      }`}
    >
      {children}
    </button>
  );
}
