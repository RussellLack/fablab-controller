'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { LangToggle } from '@/components/lang-toggle';

export default function LoginPage() {
  const t = useTranslations();
  const [mode, setMode] = useState<'idle' | 'email-form'>('idle');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // openid+email+profile are the defaults Supabase already requests.
        // `gmail.send` is added so the team member's account can be used to
        // send RFQ / PO emails on their behalf from within the app.
        scopes:
          'openid email profile https://www.googleapis.com/auth/gmail.send',
        queryParams: {
          hd: 'fablab.no',
          // Required so Google returns a refresh_token we can persist for
          // server-side Gmail API calls outside the browser session.
          access_type: 'offline',
          // Force the consent screen each time so the refresh_token is
          // always returned (Google only returns it the first time a user
          // grants a scope, unless prompt=consent is set).
          prompt: 'consent'
        }
      }
    });
  }

  async function sendMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          // The auth callback dispatches staff → /dashboard, customer → /portal
          // based on email domain, so a plain /auth/callback is sufficient here.
          // Customer-side invites from the staff app use ?next= to land on a
          // specific project.
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (otpError) throw otpError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.email_error'));
    } finally {
      setSending(false);
    }
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

        <div className="flex items-center gap-3 my-4 text-[11px] text-ink-3 uppercase tracking-wider">
          <div className="flex-1 h-px bg-line" />
          <span>{t('login.or')}</span>
          <div className="flex-1 h-px bg-line" />
        </div>

        {mode === 'idle' && !sent && (
          <button
            onClick={() => setMode('email-form')}
            className="w-full p-3 border border-line rounded-lg bg-surface hover:bg-bg cursor-pointer text-[14px] font-medium"
          >
            {t('login.email_btn')}
          </button>
        )}

        {mode === 'email-form' && !sent && (
          <form onSubmit={sendMagicLink} className="text-left space-y-3">
            <p className="text-[12px] text-ink-2 leading-snug">
              {t('login.email_sub')}
            </p>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {error && (
              <div className="text-[12px] text-warn bg-warn-soft border border-warn/20 rounded px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('idle');
                  setError(null);
                  setEmail('');
                }}
                className="btn btn-ghost text-[12px]"
              >
                {t('action.cancel')}
              </button>
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="btn btn-primary text-[12px]"
              >
                {sending ? t('login.email_sending') : t('login.email_submit')}
              </button>
            </div>
          </form>
        )}

        {sent && (
          <div className="text-left space-y-2">
            <div className="text-[13px] font-medium text-ok">
              {t('login.email_sent_title')}
            </div>
            <p className="text-[12px] text-ink-2 leading-snug">
              {t('login.email_sent_body', { email })}
            </p>
            <button
              onClick={() => {
                setSent(false);
                setMode('idle');
                setEmail('');
              }}
              className="btn btn-ghost text-[12px] mt-1"
            >
              {t('login.email_sent_reset')}
            </button>
          </div>
        )}

        <div className="mt-6 text-[12px] text-ink-3">{t('login.footer')}</div>
      </div>
    </main>
  );
}
