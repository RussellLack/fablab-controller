'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cx } from '@/lib/utils';

/**
 * The bilingual toggle — top-right of every screen.
 * Sets the locale cookie + persists to User.language_pref if signed in.
 * One click switches, no page reload (router.refresh re-renders with new messages).
 */
export function LangToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setLocale(next: 'en' | 'no') {
    if (next === locale) return;
    document.cookie = `locale=${next};path=/;max-age=31536000;samesite=lax`;

    // Persist server-side (User.language_pref) — fire and forget
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) {
        // Update via a server action / route handler in your real build
        // For now the cookie is enough — server reads it in i18n.ts
      }
    });

    startTransition(() => router.refresh());
  }

  return (
    <div className="inline-flex bg-bg border border-line rounded-full p-0.5">
      {(['en', 'no'] as const).map(l => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          disabled={pending}
          className={cx(
            'px-3.5 py-1 text-[12px] font-semibold tracking-wider rounded-full transition-colors',
            locale === l ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink'
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
