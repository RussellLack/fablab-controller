'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Global Cmd-K command palette.
 *
 * Mounted once in the (app) layout. Cmd-K (or Ctrl-K on Windows) toggles
 * the modal. Search input filters across clients + vendors + projects
 * fuzzy-style; arrow keys move the selection, Enter navigates, Escape
 * closes.
 *
 * The entity index is fetched lazily on first open from
 * /api/search/entities (~45KB at current scale) so the layout doesn't
 * pay the cost on every page load. Once loaded it's reused across
 * subsequent opens within the same tab session.
 */

type Entry = {
  type: 'client' | 'vendor' | 'project';
  id: string;
  name: string;
  ref?: string;
  secondary?: string;
};

const TYPE_TO_PILL: Record<Entry['type'], string> = {
  client: 'pill-customer',
  vendor: 'pill-supplier',
  project: 'pill-project'
};

const TYPE_TO_HREF = (e: Entry) => {
  switch (e.type) {
    case 'client':
      return `/clients/${e.id}`;
    case 'vendor':
      return `/vendors/${e.id}`;
    case 'project':
      return `/projects/${e.id}`;
  }
};

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  // Token-AND search: every space-separated needle token must appear
  // in the haystack (case-insensitive substring). Doesn't pretend to
  // be a real fuzzy matcher but handles "kinn invoice" or "PWO 42"
  // type queries gracefully.
  const tokens = needle.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function scoreEntry(entry: Entry, q: string): number {
  if (!q) return 0;
  const needle = q.toLowerCase();
  let score = 0;
  const name = entry.name.toLowerCase();
  if (name === needle) score += 100;
  else if (name.startsWith(needle)) score += 50;
  else if (name.includes(needle)) score += 25;
  if (entry.ref?.toLowerCase().startsWith(needle)) score += 40;
  if (entry.secondary?.toLowerCase().includes(needle)) score += 5;
  return score;
}

export function CommandPalette() {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cmd-K / Ctrl-K to open + a custom 'open-command-palette' event so
  // anywhere in the app can trigger the palette without importing it
  // (e.g. a discoverable Search button in the header).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onCustomOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onCustomOpen);
    };
  }, []);

  // Lazy-load the index on first open
  useEffect(() => {
    if (!open || entries !== null || loading) return;
    setLoading(true);
    fetch('/api/search/entities', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data: { entries: Entry[] }) => setEntries(data.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, entries, loading]);

  // Focus input on open + reset state on close
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(id);
    }
    setQuery('');
    setActiveIdx(0);
  }, [open]);

  const results = useMemo(() => {
    if (!entries) return [];
    if (!query) return entries.slice(0, 40);
    const filtered = entries.filter((e) => {
      const hay = `${e.name} ${e.ref ?? ''} ${e.secondary ?? ''}`;
      return fuzzyMatch(hay, query);
    });
    filtered.sort((a, b) => scoreEntry(b, query) - scoreEntry(a, query));
    return filtered.slice(0, 50);
  }, [entries, query]);

  // Group results by type for display, preserving the global ordering
  // within each group so the keyboard cursor matches what the user sees.
  const grouped = useMemo(() => {
    const out: { type: Entry['type']; items: Entry[] }[] = [];
    for (const r of results) {
      let group = out.find((g) => g.type === r.type);
      if (!group) {
        group = { type: r.type, items: [] };
        out.push(group);
      }
      group.items.push(r);
    }
    return out;
  }, [results]);

  // Flatten back to a linear list for arrow-key navigation that matches
  // the visual order (clients first, then vendors, then projects, per
  // the group order produced above).
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [query, entries]);

  const close = useCallback(() => setOpen(false), []);

  const navigateTo = useCallback(
    (entry: Entry) => {
      router.push(TYPE_TO_HREF(entry));
      close();
    },
    [router, close]
  );

  // Keyboard navigation within the open palette
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = flat[activeIdx];
        if (picked) navigateTo(picked);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, activeIdx, close, navigateTo]);

  // Scroll active item into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onClick={close}
    >
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-[600px] bg-surface border border-line-strong rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.aria_label')}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
          <span className="text-ink-3 text-[13px]">⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-ink-3"
          />
          <kbd className="text-[10px] text-ink-3 border border-line rounded px-1 py-0.5">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {loading && entries === null ? (
            <div className="px-3 py-6 text-ink-3 text-[13px] text-center">
              {t('palette.loading')}
            </div>
          ) : grouped.length === 0 ? (
            <div className="px-3 py-6 text-ink-3 text-[13px] text-center">
              {query ? t('palette.no_results') : t('palette.start_typing')}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.type} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-3 font-semibold">
                  {t(`palette.group.${group.type}`)} · {group.items.length}
                </div>
                {group.items.map((entry) => {
                  const idx = flat.indexOf(entry);
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={`${entry.type}-${entry.id}`}
                      data-idx={idx}
                      onClick={() => navigateTo(entry)}
                      onMouseMove={() => setActiveIdx(idx)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors duration-75 ${
                        active ? 'bg-bg' : 'hover:bg-bg/60'
                      }`}
                    >
                      <span className={`pill pill-type ${TYPE_TO_PILL[entry.type]}`}>
                        {t(`entity_type.${entry.type === 'client' ? 'customer' : entry.type}`)}
                      </span>
                      {entry.ref && (
                        <span className="font-mono text-[11px] text-ink-3">{entry.ref}</span>
                      )}
                      <span className="text-[13px] font-medium flex-1 truncate">{entry.name}</span>
                      {entry.secondary && (
                        <span className="text-[11px] text-ink-3 truncate max-w-[180px]">
                          {entry.secondary}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-line bg-bg text-[10px] text-ink-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <kbd className="border border-line rounded px-1">↑↓</kbd> {t('palette.hint_navigate')}
            <kbd className="border border-line rounded px-1 ml-2">↵</kbd> {t('palette.hint_select')}
          </div>
          <div>
            <kbd className="border border-line rounded px-1">⌘K</kbd> {t('palette.hint_open')}
          </div>
        </div>
      </div>
    </div>
  );
}
