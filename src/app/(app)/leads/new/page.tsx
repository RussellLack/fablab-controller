'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LeadForm } from '@/components/lead-form';
import { createLead } from '@/server/actions/leads';

export default function NewLeadPage() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(createLead, null);

  return (
    <form action={action}>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href="/leads" className="hover:text-ink">{t('crumbs.leads')}</Link>{' / '}
        {t('lead.new_title')}
      </div>

      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('lead.new_title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">{t('lead.new_sub')}</p>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-60">
          {pending ? t('action.saving') : t('action.create_lead')}
        </button>
      </div>

      <p className="text-ink-3 text-xs mb-4">{t('lead.new_helper')}</p>

      {state && !state.ok && (
        <div className="card bg-danger-soft border-danger text-danger mb-4 text-[13px]">{state.error}</div>
      )}

      <LeadForm />
    </form>
  );
}
