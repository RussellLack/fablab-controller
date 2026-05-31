'use client';

import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { LangToggle } from '@/components/lang-toggle';

export default function LoginPage() {
  const t = useTranslations();

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: ``${window.location.origin}/auth/callback``,
        queryParams: {
          hd: 'fablab.no'
        }
      }
    });
  }

  return (
    <main className="min-h-screen grid place-items-center bg-bg relative">
      <div className="absolute top-6 right-6"><LangToggle /></div>
      <div className="bg-surface border border-line rounded-xl p-10 w-[380px] text-center">
        <div className="font-semibold text-[18px] mb-2">
          <span className="text-accent">●</span> {t('brand')}
        </div>
        <div className="text-ink-2 text-[13px] mb-7">{t('login.sub')}</div>
        <button
          onClick={signInWithGoogle}
          className="flex items-center justify-center gap-2.5 w-full p-3 border border-line rounded-lg bg-surface hover:bg-bg cursor-pointer text-[14px] font-medium"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {t('login.btn')}
        </button>
        <div className="mt-6 text-[12px] text-ink-3">{t('login.footer')}</div>
      </div>
    </main>
  );
}
