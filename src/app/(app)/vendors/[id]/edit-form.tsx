'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updateVendor } from '@/server/actions/vendors';
import { MarkdownEditor } from '@/components/markdown-editor';

export type EditableVendor = {
  id: string;
  name: string;
  kind: 'supplier' | 'fabricator' | 'contractor' | 'internal_workshop';
  country: string | null;
  defaultCurrency: 'NOK' | 'EUR' | 'USD' | 'GBP' | 'SEK' | 'DKK' | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  typicalLeadTimeDays: number | null;
  paymentTerms: string | null;
  rating: number | null;
  active: boolean;
  categories: string[];
  notes: string | null;
};

const KINDS = ['supplier', 'fabricator', 'contractor', 'internal_workshop'] as const;
const CURRENCIES = ['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'] as const;

const inputCls =
  'w-full px-2.5 py-1.5 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors';

export function VendorEditForm({ vendor }: { vendor: EditableVendor }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(
    updateVendor.bind(null, vendor.id),
    null as Parameters<typeof updateVendor>[1]
  );

  function err(name: string): string | undefined {
    if (state && !state.ok && state.fieldErrors) return state.fieldErrors[name]?.[0];
    return undefined;
  }

  return (
    <form action={formAction}>
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/vendors/${vendor.id}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
        >
          ← {t('entity_edit.cancel')}
        </Link>
        <div className="flex items-center gap-2">
          {state && !state.ok && <span className="text-[12px] text-danger">{state.error}</span>}
          <button type="submit" disabled={pending} className="btn btn-primary text-[13px]">
            {pending ? t('entity_edit.saving') : t('entity_edit.save')}
          </button>
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="pill pill-type pill-supplier">{t('entity_type.supplier')}</span>
        </div>
        <Field label={t('entity_edit.name')} error={err('name')} required>
          <input
            type="text"
            name="name"
            required
            defaultValue={vendor.name}
            maxLength={200}
            className="w-full px-3 py-2 text-[18px] font-semibold tracking-tighter border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2"
          />
        </Field>
        <div className="flex flex-wrap gap-3 mt-3 items-end">
          <Field label={t('entity_edit.kind')} error={err('kind')}>
            <select name="kind" defaultValue={vendor.kind} className={inputCls + ' w-auto'}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{t(`vendor.kind.${k}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('entity_edit.country')} error={err('country')}>
            <input
              type="text"
              name="country"
              defaultValue={vendor.country ?? ''}
              maxLength={2}
              className={inputCls + ' w-20 uppercase'}
              placeholder="NO"
            />
          </Field>
          <Field label={t('entity_edit.default_currency')} error={err('defaultCurrency')}>
            <select
              name="defaultCurrency"
              defaultValue={vendor.defaultCurrency ?? ''}
              className={inputCls + ' w-auto'}
            >
              <option value="">—</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={t('entity_edit.rating')} error={err('rating')}>
            <input
              type="number"
              name="rating"
              defaultValue={vendor.rating ?? ''}
              min={1}
              max={5}
              className={inputCls + ' w-20'}
            />
          </Field>
          <Field label={t('entity_edit.active')}>
            <label className="inline-flex items-center gap-1.5 text-[13px]">
              <input
                type="checkbox"
                name="active"
                defaultChecked={vendor.active}
              />
              <span>{vendor.active ? t('entity_edit.active') : t('entity_detail.inactive')}</span>
            </label>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="card-title">{t('entity_detail.contact_section')}</div>
          <div className="mt-2 space-y-2">
            <Field label={t('entity_detail.contact_name')} error={err('contactName')}>
              <input type="text" name="contactName" defaultValue={vendor.contactName ?? ''} maxLength={200} className={inputCls} />
            </Field>
            <Field label={t('entity_detail.contact_email')} error={err('contactEmail')}>
              <input type="email" name="contactEmail" defaultValue={vendor.contactEmail ?? ''} maxLength={320} className={inputCls + ' font-mono'} />
            </Field>
            <Field label={t('entity_detail.contact_phone')} error={err('contactPhone')}>
              <input type="tel" name="contactPhone" defaultValue={vendor.contactPhone ?? ''} maxLength={40} className={inputCls + ' font-mono'} />
            </Field>
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t('entity_detail.commercial_section')}</div>
          <div className="mt-2 space-y-2">
            <Field label={t('entity_edit.lead_time_days')} error={err('typicalLeadTimeDays')}>
              <input
                type="number"
                name="typicalLeadTimeDays"
                defaultValue={vendor.typicalLeadTimeDays ?? ''}
                min={0}
                className={inputCls}
              />
            </Field>
            <Field label={t('entity_detail.payment_terms_supplier')} error={err('paymentTerms')}>
              <input
                type="text"
                name="paymentTerms"
                defaultValue={vendor.paymentTerms ?? ''}
                maxLength={120}
                className={inputCls}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">{t('entity_detail.address_section')}</div>
        <Field label="" error={err('address')}>
          <textarea name="address" defaultValue={vendor.address ?? ''} rows={3} className={inputCls} />
        </Field>
      </div>

      <div className="card mb-4">
        <div className="card-title">{t('entity_edit.categories')}</div>
        <Field label="" error={err('categoriesRaw')}>
          <input
            type="text"
            name="categoriesRaw"
            defaultValue={vendor.categories.join(', ')}
            className={inputCls}
            placeholder="upholstery, lighting, custom millwork"
          />
        </Field>
        <p className="text-[11px] text-ink-3 mt-1">{t('entity_edit.categories_help')}</p>
      </div>

      <div className="card">
        <div className="card-title">{t('entity_detail.notes_section')}</div>
        <Field label="" error={err('notes')}>
          <MarkdownEditor name="notes" defaultValue={vendor.notes ?? ''} rows={6} />
        </Field>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  children
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label className="block text-[11px] uppercase tracking-wider text-ink-3 mb-1">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </div>
  );
}
