'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { createVendor } from '@/server/actions/procurement';

export default function NewVendorPage() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(createVendor, null);

  return (
    <form action={action} className="max-w-2xl">
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href="/vendors" className="hover:text-ink">{t('vendors.title')}</Link> / {t('vendor.new_title')}
      </div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t('vendor.new_title')}</h1>
          <p className="text-ink-2 text-[13px] mt-1">{t('vendor.new_sub')}</p>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-60">
          {pending ? t('action.saving') : t('action.create_vendor')}
        </button>
      </div>

      {state && !state.ok && <div className="card bg-danger-soft border-danger text-danger mb-4 text-[13px]">{state.error}</div>}

      <div className="space-y-3 card">
        <Row label={t('vendor.name')} required>
          <input name="name" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.kind_label')} required>
          <select name="kind" required defaultValue="supplier" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]">
            <option value="supplier">{t('vendor.kind.supplier')}</option>
            <option value="fabricator">{t('vendor.kind.fabricator')}</option>
            <option value="contractor">{t('vendor.kind.contractor')}</option>
            <option value="internal_workshop">{t('vendor.kind.internal_workshop')}</option>
          </select>
        </Row>
        <Row label={t('vendor.categories')}>
          <input name="categories" placeholder="lighting, furniture, fabric…" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
          <div className="text-xs text-ink-3 mt-1">{t('vendor.categories_helper')}</div>
        </Row>
        <Row label={t('vendor.country')}>
          <input name="country" maxLength={2} placeholder="NO" className="w-24 px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.contact_name')} required>
          <input name="contactName" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.contact_email')} required>
          <input name="contactEmail" type="email" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.contact_phone')}>
          <input name="contactPhone" type="tel" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.address')}>
          <input name="address" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.lead_time')}>
          <input name="typicalLeadTimeDays" type="number" min="0" className="w-32 px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.payment_terms')}>
          <input name="paymentTerms" placeholder="30 days net" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('vendor.default_currency')}>
          <select name="defaultCurrency" defaultValue="NOK" className="w-32 px-2.5 py-2 border border-line rounded-md text-[13px]">
            {['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'].map(c => <option key={c}>{c}</option>)}
          </select>
        </Row>
        <Row label={t('vendor.internal')}>
          <label className="text-[13px]">
            <input type="checkbox" name="isInternal" value="true" className="mr-2" />
            {t('vendor.internal_helper')}
          </label>
        </Row>
        <Row label={t('vendor.notes')}>
          <textarea name="notes" rows={3} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
      </div>
    </form>
  );
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
      <label className="text-[13px] text-ink-2 pt-2">{label}{required && '*'}</label>
      <div>{children}</div>
    </div>
  );
}
