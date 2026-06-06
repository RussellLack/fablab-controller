'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createChangeOrder } from '@/server/actions/change-orders';
import { Wizard, type WizardStepDef } from './wizard';

/**
 * Change Order wizard — 3 steps (Reason → Impact → Review).
 *
 * Doctrine (`00-` §18, module #8): every change after Brief sign-off
 * must be recorded, priced, and approved BEFORE it's implemented.
 * Step 1 captures the *why*, step 2 captures *how big*, step 3 lets
 * the user see what they're committing to record.
 *
 * The wizard creates the CO in either `requested` (if no cost impact
 * filled) or `priced` (if cost amount filled) — the server action
 * decides based on whether costImpactAmount is set.
 */

type RequestedBy =
  | 'client'
  | 'designer'
  | 'vendor'
  | 'site_condition'
  | 'regulatory'
  | 'cost_pressure'
  | 'client_taste_change'
  | 'other';

const REQUESTED_BY: RequestedBy[] = [
  'client',
  'designer',
  'vendor',
  'site_condition',
  'regulatory',
  'cost_pressure',
  'client_taste_change',
  'other'
];

type Currency = 'NOK' | 'EUR' | 'USD' | 'GBP' | 'SEK' | 'DKK';
const CURRENCIES: Currency[] = ['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'];

type State = {
  title: string;
  requestedBy: RequestedBy;
  requestedByExternal: string;
  reason: string;
  dateRequested: string; // YYYY-MM-DD
  description: string;
  costImpactAmount: string; // string-typed input; parsed server-side
  costImpactCurrency: Currency;
  timeImpactDays: string;
  affectsSupplier: boolean;
  affectsFreightCustoms: boolean;
  affectsInstall: boolean;
};

export function ChangeOrderWizard({
  open,
  onClose,
  projectId
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const router = useRouter();

  const initialState: State = {
    title: '',
    requestedBy: 'client',
    requestedByExternal: '',
    reason: '',
    dateRequested: new Date().toISOString().slice(0, 10),
    description: '',
    costImpactAmount: '',
    costImpactCurrency: 'NOK',
    timeImpactDays: '',
    affectsSupplier: false,
    affectsFreightCustoms: false,
    affectsInstall: false
  };

  const steps: WizardStepDef<State>[] = [
    {
      id: 'reason',
      titleKey: 'change_order_wizard.step_reason',
      isValid: (s) =>
        s.title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(s.dateRequested),
      Component: ReasonStep
    },
    {
      id: 'impact',
      titleKey: 'change_order_wizard.step_impact',
      isValid: () => true, // every field is optional at this step
      Component: ImpactStep
    },
    {
      id: 'review',
      titleKey: 'change_order_wizard.step_review',
      isValid: () => true,
      Component: ReviewStep
    }
  ];

  return (
    <Wizard<State>
      open={open}
      onClose={onClose}
      titleKey="change_order_wizard.title"
      initialState={initialState}
      steps={steps}
      submitLabelKey="change_order_wizard.submit"
      onSubmit={async (state) => {
        const fd = new FormData();
        fd.set('title', state.title.trim());
        fd.set('requestedBy', state.requestedBy);
        if (state.requestedByExternal.trim()) {
          fd.set('requestedByExternal', state.requestedByExternal.trim());
        }
        if (state.reason.trim()) fd.set('reason', state.reason.trim());
        fd.set('dateRequested', state.dateRequested);
        if (state.description.trim()) fd.set('description', state.description.trim());
        if (state.costImpactAmount.trim()) {
          fd.set('costImpactAmount', state.costImpactAmount.trim());
          fd.set('costImpactCurrency', state.costImpactCurrency);
        }
        if (state.timeImpactDays.trim()) {
          fd.set('timeImpactDays', state.timeImpactDays.trim());
        }
        if (state.affectsSupplier) fd.set('affectsSupplier', 'on');
        if (state.affectsFreightCustoms) fd.set('affectsFreightCustoms', 'on');
        if (state.affectsInstall) fd.set('affectsInstall', 'on');
        const res = await createChangeOrder(projectId, fd);
        if (res.ok) {
          router.refresh();
          if (res.id) router.push(`/projects/${projectId}/change-control/${res.id}`);
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}

/* ─────────────────────────── STEPS ─────────────────────────── */

function ReasonStep({
  state,
  update
}: {
  state: State;
  update: (patch: Partial<State>) => void;
}) {
  const t = useTranslations();
  const showExternal = state.requestedBy === 'client' || state.requestedBy === 'vendor' || state.requestedBy === 'other';
  return (
    <div className="space-y-4">
      <Row label={t('change_order_wizard.field_title')} required>
        <input
          type="text"
          value={state.title}
          onChange={(e) => update({ title: e.target.value })}
          maxLength={300}
          autoFocus
          placeholder={t('change_order_wizard.field_title_placeholder')}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <Help text={t('change_order_wizard.field_title_help')} />
      </Row>

      <Row label={t('change_order_wizard.field_requested_by')} required>
        <select
          value={state.requestedBy}
          onChange={(e) => update({ requestedBy: e.target.value as RequestedBy })}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {REQUESTED_BY.map((r) => (
            <option key={r} value={r}>
              {t(`change_order.requested_by.${r}`)}
            </option>
          ))}
        </select>
      </Row>

      {showExternal && (
        <Row label={t('change_order_wizard.field_requested_by_external')}>
          <input
            type="text"
            value={state.requestedByExternal}
            onChange={(e) => update({ requestedByExternal: e.target.value })}
            maxLength={200}
            placeholder={t('change_order_wizard.field_requested_by_external_placeholder')}
            className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </Row>
      )}

      <Row label={t('change_order_wizard.field_reason')}>
        <textarea
          value={state.reason}
          onChange={(e) => update({ reason: e.target.value })}
          rows={3}
          placeholder={t('change_order_wizard.field_reason_placeholder')}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
        <Help text={t('change_order_wizard.field_reason_help')} />
      </Row>

      <Row label={t('change_order_wizard.field_date_requested')} required>
        <input
          type="date"
          value={state.dateRequested}
          onChange={(e) => update({ dateRequested: e.target.value })}
          max={new Date().toISOString().slice(0, 10)}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </Row>
    </div>
  );
}

function ImpactStep({
  state,
  update
}: {
  state: State;
  update: (patch: Partial<State>) => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-2 leading-snug">
        {t('change_order_wizard.impact_intro')}
      </p>

      <Row label={t('change_order_wizard.field_description')}>
        <textarea
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={4}
          placeholder={t('change_order_wizard.field_description_placeholder')}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
      </Row>

      <Row label={t('change_order_wizard.field_cost_impact')}>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            value={state.costImpactAmount}
            onChange={(e) => update({ costImpactAmount: e.target.value })}
            placeholder="0.00"
            className="flex-1 px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <select
            value={state.costImpactCurrency}
            onChange={(e) => update({ costImpactCurrency: e.target.value as Currency })}
            className="px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Help text={t('change_order_wizard.field_cost_impact_help')} />
      </Row>

      <Row label={t('change_order_wizard.field_time_impact')}>
        <input
          type="number"
          step="1"
          value={state.timeImpactDays}
          onChange={(e) => update({ timeImpactDays: e.target.value })}
          placeholder="0"
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <Help text={t('change_order_wizard.field_time_impact_help')} />
      </Row>

      <fieldset className="space-y-2 pt-2">
        <legend className="text-[12px] font-semibold text-ink-2 mb-2">
          {t('change_order_wizard.field_affects')}
        </legend>
        <Checkbox
          label={t('change_order_wizard.affects_supplier')}
          checked={state.affectsSupplier}
          onChange={(v) => update({ affectsSupplier: v })}
        />
        <Checkbox
          label={t('change_order_wizard.affects_freight_customs')}
          checked={state.affectsFreightCustoms}
          onChange={(v) => update({ affectsFreightCustoms: v })}
        />
        <Checkbox
          label={t('change_order_wizard.affects_install')}
          checked={state.affectsInstall}
          onChange={(v) => update({ affectsInstall: v })}
        />
      </fieldset>
    </div>
  );
}

function ReviewStep({ state }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  const willStartAt = state.costImpactAmount.trim() ? 'priced' : 'requested';
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-snug text-ink-2">
        {t('change_order_wizard.review_intro')}
      </p>
      <dl className="grid grid-cols-[160px_1fr] gap-y-2 gap-x-4 text-[13px]">
        <Dt k={t('change_order_wizard.field_title')} v={state.title} />
        <Dt
          k={t('change_order_wizard.field_requested_by')}
          v={
            state.requestedByExternal.trim()
              ? `${t(`change_order.requested_by.${state.requestedBy}`)} — ${state.requestedByExternal}`
              : t(`change_order.requested_by.${state.requestedBy}`)
          }
        />
        <Dt k={t('change_order_wizard.field_reason')} v={state.reason || '—'} />
        <Dt k={t('change_order_wizard.field_date_requested')} v={state.dateRequested} />
        <Dt
          k={t('change_order_wizard.field_cost_impact')}
          v={
            state.costImpactAmount.trim()
              ? `${state.costImpactAmount} ${state.costImpactCurrency}`
              : t('change_order_wizard.cost_not_priced')
          }
        />
        <Dt
          k={t('change_order_wizard.field_time_impact')}
          v={state.timeImpactDays.trim() ? `${state.timeImpactDays} days` : '—'}
        />
        <Dt k={t('change_order_wizard.field_affects')} v={
          [
            state.affectsSupplier && t('change_order_wizard.affects_supplier'),
            state.affectsFreightCustoms && t('change_order_wizard.affects_freight_customs'),
            state.affectsInstall && t('change_order_wizard.affects_install')
          ].filter(Boolean).join(' · ') || '—'
        } />
      </dl>
      <div className="border-l-2 border-info bg-info-soft/30 rounded-r p-3 text-[12px] text-ink-2 leading-snug">
        {willStartAt === 'priced'
          ? t('change_order_wizard.review_starts_priced')
          : t('change_order_wizard.review_starts_requested')}
      </div>
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function Row({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-2 mb-1">
        {label}
        {required && <span className="text-warn ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function Help({ text }: { text: string }) {
  return <p className="text-[11px] text-ink-3 mt-1 leading-snug">{text}</p>;
}

function Checkbox({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-line"
      />
      <span>{label}</span>
    </label>
  );
}

function Dt({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="whitespace-pre-wrap">{v?.trim() || '—'}</dd>
    </>
  );
}
