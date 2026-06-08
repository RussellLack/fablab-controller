'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Staff user menu — avatar pill that opens a small dropdown with the
 * signed-in user's name + a Sign-out action.
 *
 * Sign-out path: client-side `supabase.auth.signOut()` clears the
 * browser-side session and the HttpOnly auth cookies (the supabase-ssr
 * client writes them via the response). Then we navigate to /login.
 * Middleware will treat the now-unauthenticated request as expected
 * and serve /login fresh.
 *
 * Matches the customer-portal pattern in `portal-header.tsx` so both
 * sides of the app share one mental model for "how do I sign out".
 *
 * Click-outside dismissal: a ref + global mousedown listener; cheaper
 * than pulling in a focus-trap library for a 60-pixel menu.
 */
export function UserMenu({
  userName,
  userInitials
}: {
  userName: string;
  userInitials: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Even if the client-side signOut throws (network blip, etc.),
      // we still want to land the user at /login. Middleware will
      // redirect them right back here if the session is somehow still
      // valid, so the worst case is they need to click again.
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[13px] text-ink-2 hover:text-ink hover:bg-bg active:bg-line transition-colors px-1.5 py-1 rounded"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="w-7 h-7 rounded-full bg-accent text-white grid place-items-center text-xs font-semibold">
          {userInitials}
        </div>
        <span>{userName}</span>
        {/* Chevron — bumped from 10/ink-3 (basically invisible) to
            13/ink so it actually reads as a clickable affordance. */}
        <span
          className={`text-[13px] text-ink ml-1 inline-block transition-transform leading-none ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-44 bg-surface border border-line rounded-md shadow-lg z-50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-line">
            <div className="text-[12px] font-semibold text-ink truncate">
              {userName}
            </div>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="w-full text-left px-3 py-2 text-[13px] text-ink-2 hover:bg-bg hover:text-ink disabled:text-ink-3 disabled:cursor-wait"
            role="menuitem"
          >
            {signingOut ? t('user_menu.signing_out') : t('user_menu.sign_out')}
          </button>
        </div>
      )}
    </div>
  );
}
