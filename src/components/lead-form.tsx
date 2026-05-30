'use client';

import { useTranslations } from 'next-intl';
import type { IntakeField } from '@/lib/validations/lead';
import { cx } from '@/lib/utils';

type Lead = Record<string, unknown>;
type FieldKey = IntakeField;

const SELECT_KIND = [
  ['individual', 'lead.kind.individual'],
  ['business', 'lead.kind.business'],
  ['public_sector', 'lead.kind.public_sector'],
  ['cultural_institution', 'lead.kind.cultural'],
  ['hospitality_group', 'lead.kind.hospitality']
] as const;

const SELECT_TYPE = ['residential', 'commercial', 'hospitality', 'retail', 'workplace', 'cultural', 'mixed'] as const;
const SELECT_ROLE = [
  'design_advisory_only', 'design_and_specification', 'procurement_support',
  'procurement_and_resale', 'supplier_coordination', 'delivery_coordination',
  'installation_coordination', 'full_project_control'
] as const;

/**
 * The intake form — shared by the new-lead and intake screens.
 * Visually flags missing required fields in danger-red so they're impossible
 * to miss. Names match the column names in the DB so FormData maps 1:1.
 */
export function LeadForm({ lead = {}, missing = [], readOnly = false }: { lead?: Lead; missing?: FieldKey[]; readOnly?: boolean }) {
  const t = useTranslations();
  const m = (key: FieldKey) => missing.includes(key);
  const inputCx = (key: FieldKey) =>
    cx(
      'w-full px-2.5 py-2 border rounded-md text-[13px] bg-surface',
      m(key) ? 'border-danger bg-danger-soft' : 'border-line'
    );

  return (
    <div className="grid gap-4">
      <Section title={t('lead.client_section')}>
        <Row label={t('lead.client_name')} required missing={m('prospectiveClientName')}>
          <input type="text" name="prospectiveClientName" defaultValue={(lead.prospectiveClientName as string) ?? ''} className={inputCx('prospectiveClientName')} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.client_kind')} required missing={m('clientKind')}>
          <select name="clientKind" defaultValue={(lead.clientKind as string) ?? ''} className={inputCx('clientKind')} disabled={readOnly}>
            <option value="">—</option>
            {SELECT_KIND.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
          </select>
        </Row>
        <Row label={t('lead.contact_name')} required missing={m('primaryContactName')}>
          <input type="text" name="primaryContactName" defaultValue={(lead.primaryContactName as string) ?? ''} className={inputCx('primaryContactName')} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.contact_email')} required missing={m('primaryContactEmail')}>
          <input type="email" name="primaryContactEmail" defaultValue={(lead.primaryContactEmail as string) ?? ''} className={inputCx('primaryContactEmail')} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.contact_phone')} required missing={m('primaryContactPhone')}>
          <input type="tel" name="primaryContactPhone" defaultValue={(lead.primaryContactPhone as string) ?? ''} className={inputCx('primaryContactPhone')} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.property')} required missing={m('propertyAddress')}>
          <input type="text" name="propertyAddress" defaultValue={(lead.propertyAddress as string) ?? ''} className={inputCx('propertyAddress')} readOnly={readOnly} />
        </Row>
      </Section>

      <Section title={t('lead.project_section')}>
        <Row label={t('lead.project_type')} required missing={m('projectType')}>
          <select name="projectType" defaultValue={(lead.projectType as string) ?? ''} className={inputCx('projectType')} disabled={readOnly}>
            <option value="">—</option>
            {SELECT_TYPE.map(v => <option key={v} value={v}>{t(`type.${v}`)}</option>)}
          </select>
        </Row>
        <Row label={t('lead.rooms')} required missing={m('roomsOrZones')}>
          <textarea name="roomsOrZones" defaultValue={(lead.roomsOrZones as string) ?? ''} className={inputCx('roomsOrZones')} rows={2} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.outcome')} required missing={m('desiredOutcome')}>
          <textarea name="desiredOutcome" defaultValue={(lead.desiredOutcome as string) ?? ''} className={inputCx('desiredOutcome')} rows={3} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.style')} required missing={m('designStylePreferences')}>
          <textarea name="designStylePreferences" defaultValue={(lead.designStylePreferences as string) ?? ''} className={inputCx('designStylePreferences')} rows={2} readOnly={readOnly} />
        </Row>
      </Section>

      <Section title={t('lead.commercial_section')}>
        <Row label={t('lead.budget')} required missing={m('budgetExpectation')}>
          <div className="flex gap-2">
            <input type="number" name="budgetExpectation" defaultValue={(lead.budgetExpectation as string) ?? ''} className={inputCx('budgetExpectation') + ' flex-[2]'} step="1000" readOnly={readOnly} />
            <select name="budgetCurrency" defaultValue={(lead.budgetCurrency as string) ?? 'NOK'} className="flex-1 px-2.5 py-2 border border-line rounded-md text-[13px]" disabled={readOnly}>
              {['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Row>
        <Row label={t('lead.timeline')} required missing={m('timelineExpectation')}>
          <input type="text" name="timelineExpectation" defaultValue={(lead.timelineExpectation as string) ?? ''} className={inputCx('timelineExpectation')} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.decision_makers')} required missing={m('decisionMakers')}>
          <input type="text" name="decisionMakers" defaultValue={(lead.decisionMakers as string) ?? ''} className={inputCx('decisionMakers')} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.approval_process')} required missing={m('approvalProcess')}>
          <textarea name="approvalProcess" defaultValue={(lead.approvalProcess as string) ?? ''} className={inputCx('approvalProcess')} rows={2} readOnly={readOnly} />
        </Row>
      </Section>

      <Section title={t('lead.engagement_section')}>
        <Row label={t('lead.existing_suppliers')} required missing={m('existingSuppliers')}>
          <input type="text" name="existingSuppliers" defaultValue={(lead.existingSuppliers as string) ?? ''} className={inputCx('existingSuppliers')} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.constraints')} required missing={m('knownConstraints')}>
          <textarea name="knownConstraints" defaultValue={(lead.knownConstraints as string) ?? ''} className={inputCx('knownConstraints')} rows={2} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.proc_expect')} required missing={m('procurementExpectations')}>
          <textarea name="procurementExpectations" defaultValue={(lead.procurementExpectations as string) ?? ''} className={inputCx('procurementExpectations')} rows={2} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.delivery_expect')} required missing={m('deliveryInstallExpectations')}>
          <textarea name="deliveryInstallExpectations" defaultValue={(lead.deliveryInstallExpectations as string) ?? ''} className={inputCx('deliveryInstallExpectations')} rows={2} readOnly={readOnly} />
        </Row>
        <Row label={t('lead.fablab_role')} required missing={m('fablabExpectedRole')}>
          <select name="fablabExpectedRole" defaultValue={(lead.fablabExpectedRole as string) ?? ''} className={inputCx('fablabExpectedRole')} disabled={readOnly}>
            <option value="">—</option>
            {SELECT_ROLE.map(v => <option key={v} value={v}>{t(`role.short.${v}`)}</option>)}
          </select>
        </Row>
      </Section>

      <Section title={t('lead.notes')}>
        <textarea name="notes" defaultValue={(lead.notes as string) ?? ''} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" rows={3} readOnly={readOnly} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="card-title mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, required, missing, children }: { label: string; required?: boolean; missing?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
      <label className={cx('text-[13px]', missing ? 'text-danger font-semibold' : 'text-ink-2')}>
        {label}{required && <span className="ml-0.5">*</span>}
      </label>
      <div>{children}</div>
    </div>
  );
}
