'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updateProjectMetadata } from '@/server/actions/project-edit';
import { MarkdownEditor } from '@/components/markdown-editor';

export type EditableProject = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  projectType: 'residential' | 'commercial' | 'hospitality' | 'retail' | 'workplace' | 'cultural' | 'mixed';
  fablabRole:
    | 'design_advisory_only'
    | 'design_and_specification'
    | 'procurement_support'
    | 'procurement_and_resale'
    | 'supplier_coordination'
    | 'delivery_coordination'
    | 'installation_coordination'
    | 'full_project_control';
  priority: 'low' | 'normal' | 'high';
  siteAddress: string | null;
  budget: string | null;
  budgetCurrency: 'NOK' | 'EUR' | 'USD' | 'GBP' | 'SEK' | 'DKK';
  targetHandoverDate: string | null;
};

const TYPES = ['residential', 'commercial', 'hospitality', 'retail', 'workplace', 'cultural', 'mixed'] as const;
const ROLES = [
  'design_advisory_only',
  'design_and_specification',
  'procurement_support',
  'procurement_and_resale',
  'supplier_coordination',
  'delivery_coordination',
  'installation_coordination',
  'full_project_control'
] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;
const CURRENCIES = ['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'] as const;

const inputCls =
  'w-full px-2.5 py-1.5 text-[13px] border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2 transition-colors';

export function ProjectEditForm({ project }: { project: EditableProject }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(
    updateProjectMetadata.bind(null, project.id),
    null as Parameters<typeof updateProjectMetadata>[1]
  );

  function err(name: string): string | undefined {
    if (state && !state.ok && state.fieldErrors) return state.fieldErrors[name]?.[0];
    return undefined;
  }

  return (
    <form action={formAction} className="mt-4">
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/projects/${project.id}`}
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

      <p className="text-[11px] text-ink-3 mb-4">
        {t('entity_edit.stage_note')}
      </p>

      <div className="card mb-4">
        <Field label={t('entity_edit.title')} error={err('title')} required>
          <input
            type="text"
            name="title"
            required
            defaultValue={project.title}
            maxLength={300}
            className="w-full px-3 py-2 text-[18px] font-semibold tracking-tighter border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2"
          />
        </Field>
        <div className="mt-3">
          <Field label={t('entity_edit.description')} error={err('description')}>
            <MarkdownEditor name="description" defaultValue={project.description ?? ''} rows={6} />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="card-title">{t('projects_detail.type')}</div>
          <div className="mt-2 space-y-2">
            <Field label={t('entity_edit.project_type')} error={err('projectType')}>
              <select name="projectType" defaultValue={project.projectType} className={inputCls}>
                {TYPES.map((k) => (
                  <option key={k} value={k}>{t(`type.${k}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('entity_edit.fablab_role')} error={err('fablabRole')}>
              <select name="fablabRole" defaultValue={project.fablabRole} className={inputCls}>
                {ROLES.map((k) => (
                  <option key={k} value={k}>{t(`projects_detail.role_value.${k}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('entity_edit.priority')} error={err('priority')}>
              <select name="priority" defaultValue={project.priority} className={inputCls}>
                {PRIORITIES.map((k) => (
                  <option key={k} value={k}>{t(`projects_detail.priority_value.${k}`)}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t('entity_detail.commercial_section')}</div>
          <div className="mt-2 space-y-2">
            <Field label={t('entity_edit.budget')} error={err('budget')}>
              <input
                type="number"
                step="any"
                name="budget"
                defaultValue={project.budget ?? ''}
                min={0}
                className={inputCls}
              />
            </Field>
            <Field label={t('entity_edit.budget_currency')} error={err('budgetCurrency')}>
              <select
                name="budgetCurrency"
                defaultValue={project.budgetCurrency}
                className={inputCls}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label={t('entity_edit.target_handover')} error={err('targetHandoverDate')}>
              <input
                type="date"
                name="targetHandoverDate"
                defaultValue={project.targetHandoverDate ?? ''}
                className={inputCls}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t('entity_edit.site_address')}</div>
        <Field label="" error={err('siteAddress')}>
          <textarea
            name="siteAddress"
            defaultValue={project.siteAddress ?? ''}
            rows={3}
            className={inputCls}
          />
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
