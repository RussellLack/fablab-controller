'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updateClient } from '@/server/actions/clients';

/**
 * Edit form for /clients/[id]?edit=1.
 *
 * One server action, one bound clientId, every editable field
 * rendered as a controlled input. Errors come back as
 * fieldErrors via useActionState. On success the action redirects
 * back to view mode so this component doesn't need to manage that.
 */

export type EditableClient = {
  id: string;
  name: string;
  kind: 'individual' | 'business' | 'public_sector' | 'cultural_institution' | 'hospitality_group';
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  billingAddress: string | null;
  orgNumber: string | null;
  paymentTermsDays: number;
  bankAccountRef: string | null;
  notes: string | null;
};

const KINDS = [
  'individual',
  'business',
  'public_sector',
  'cultural_institution',
  'hospitality_group'
] as const;

export function ClientEditForm({ client }: { client: EditableClient }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(
    updateClient.bind(null, client.id),
    null as Parameters<typeof updateClient>[1]
  );

  function fieldError(name: string): string | undefined {
    if (state && !state.ok && state.fieldErrors) {
      return state.fieldErrors[name]?.[0];
    }
    return undefined;
  }

  return (
    <form action={formAction}>
      {/* Top bar — Save / Cancel */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/clients/${client.id}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
        >
          ← {t('entity_edit.cancel')}
        </Link>
        <div className="flex items-center gap-2">
          {state && !state.ok && (
            <span className="text-[12px] text-danger">{state.error}</span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary text-[13px]"
          >
            {pending ? t('entity_edit.saving') : t('entity_edit.save')}
          </button>
        </div>
      </div>

      {/* Header — name + kind pill (editable) */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="pill pill-type pill-customer">{t('entity_type.customer')}</span>
        </div>
        <Field name="name" required label={t('entity_edit.name')} error={fieldError('name')}>
          <input
            type="text"
            name="name"
            defaultValue={client.name}
            required
            maxLength={200}
            className="w-full px-3 py-2 text-[18px] font-semibold tracking-tighter border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2"
          />
        </Field>
        <div className="mt-2">
          <Field name="kind" label={t('entity_edit.kind')} error={fieldError('kind')}>
            <select
              name="kind"
              defaultValue={client.kind}
              className="px-2 py-1 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`client_kind.${k}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="card-title">{t('entity_detail.contact_section')}</div>
          <div className="mt-2 space-y-2">
            <Field name="primaryContactName" label={t('entity_detail.contact_name')} error={fieldError('primaryContactName')}>
              <input
                type="text"
                name="primaryContactName"
                defaultValue={client.primaryContactName ?? ''}
                maxLength={200}
                className={inputCls}
              />
            </Field>
            <Field name="primaryContactEmail" label={t('entity_detail.contact_email')} error={fieldError('primaryContactEmail')}>
              <input
                type="email"
                name="primaryContactEmail"
                defaultValue={client.primaryContactEmail ?? ''}
                maxLength={320}
                className={inputCls + ' font-mono'}
              />
            </Field>
            <Field name="primaryContactPhone" label={t('entity_detail.contact_phone')} error={fieldError('primaryContactPhone')}>
              <input
                type="tel"
                name="primaryContactPhone"
                defaultValue={client.primaryContactPhone ?? ''}
                maxLength={40}
                className={inputCls + ' font-mono'}
              />
            </Field>
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t('entity_detail.commercial_section')}</div>
          <div className="mt-2 space-y-2">
            <Field name="orgNumber" label={t('entity_detail.org_number')} error={fieldError('orgNumber')}>
              <input
                type="text"
                name="orgNumber"
                defaultValue={client.orgNumber ?? ''}
                maxLength={40}
                className={inputCls + ' font-mono'}
              />
            </Field>
            <Field name="paymentTermsDays" label={t('entity_detail.payment_terms') + ' (' + t('entity_detail.days') + ')'} error={fieldError('paymentTermsDays')}>
              <input
                type="number"
                name="paymentTermsDays"
                defaultValue={client.paymentTermsDays}
                min={0}
                max={365}
                className={inputCls}
              />
            </Field>
            <Field name="bankAccountRef" label={t('entity_detail.bank_account')} error={fieldError('bankAccountRef')}>
              <input
                type="text"
                name="bankAccountRef"
                defaultValue={client.bankAccountRef ?? ''}
                maxLength={60}
                className={inputCls + ' font-mono'}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">{t('entity_detail.address_section')}</div>
        <Field name="billingAddress" label="" error={fieldError('billingAddress')}>
          <textarea
            name="billingAddress"
            defaultValue={client.billingAddress ?? ''}
            rows={3}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="card">
        <div className="card-title">{t('entity_detail.notes_section')}</div>
        <Field name="notes" label="" error={fieldError('notes')}>
          <textarea name="notes" defaultValue={client.notes ?? ''} rows={4} className={inputCls} />
        </Field>
      </div>
    </form>
  );
}

const inputCls =
  'w-full px-2.5 py-1.5 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors';

function Field({
  name: _name,
  label,
  error,
  required,
  children
}: {
  name: string;
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
