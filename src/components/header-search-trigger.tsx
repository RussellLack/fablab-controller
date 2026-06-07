'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Discoverable Search trigger that lives in the header. Fires a
 * window event the global <CommandPalette/> listens for, so this
 * component stays decoupled and can ship in a server-rendered
 * <Header/> without lifting state.
 *
 * Shows the platform-correct shortcut hint (⌘K on Mac, Ctrl+K on
 * other platforms) once we've detected the user's platform on the
 * client. SSR renders no hint to avoid a flicker.
 */
export function HeaderSearchTrigger() {
  const t = useTranslations();
  const [mod, setMod] = useState<'⌘' | 'Ctrl' | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      setMod(isMac ? '⌘' : 'Ctrl');
    }
  }, []);

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
      className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 text-[12px] text-ink-3 border border-line rounded-md hover:bg-bg hover:text-ink active:bg-line transition-colors duration-75 min-w-[220px]"
      title={t('palette.placeholder')}
    >
      <span>⌕</span>
      <span className="flex-1 text-left">{t('palette.trigger_label')}</span>
      {mod && (
        <span className="text-[10px] text-ink-3 border border-line rounded px-1 py-0.5">
          {mod}K
        </span>
      )}
    </button>
  );
}
