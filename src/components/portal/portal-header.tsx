'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LangToggle } from '@/components/lang-toggle';

/**
 * Minimal customer-portal header.
 *
 * No sidebar, no journey overlay — the portal is a focused single-
 * project surface. The header just shows the brand, the signed-in
 * email, and a sign-out link.
 */
export function PortalHeader({ email }: { email: string }) {
  const t = useTranslations();
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="border-b border-line bg-surface">
      <div className="max-w-3xl mx-auto px-8 py-3 flex items-center justify-between">
        <Link href="/portal" className="flex items-center gap-2 text-[14px] font-semibold">
          <span className="text-brand">●</span>
          {t('brand')}
        </Link>
        <div className="flex items-center gap-3 text-[12px] text-ink-3">
          <LangToggle />
          <span>{email}</span>
          <button onClick={signOut} className="hover:text-ink underline">
            {t('portal.sign_out')}
          </button>
        </div>
      </div>
    </header>
  );
}
