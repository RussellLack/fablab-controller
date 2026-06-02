'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createScopeVersionAtomic } from '@/server/actions/scope';
import { Wizard, type WizardStepDef } from './wizard';

/**
 * Scope wizard — W3 of 22-wizards.md.
 *
 * Walks the user through the 15 structured scope fields from
 * `00-industry-best-practices.md` §4, grouped into 6 narrative steps
 * plus a review. Submits an atomic create of a new DRAFT
 * scope_baseline_version. Approval (the gate that satisfies
 * Phase 2's Scope criterion) is a separate Approvals workflow against
 * scope_baseline_version_id.
 *
 * Steps:
 *   1 — Areas         projectAreas, roomsOrZones
 *   2 — Services      includedServices, excludedServices
 *   3 — Deliverables  deliverables, designOutputs
 *   4 — Who does what procurement, supplier coordination, client responsibilities
 *   5 — Expectations  site visits, meetings, timeline, budget assumptions
 *   6 — Gates         approvalGates, knownDependencies
 *   7 — Review        summary + Create draft
 *
 * Array fields (services, deliverables, design outputs, approval gates,
 * rooms/zones) use a one-per-line textarea; the FormData append splits
 * on newline + trim + empty-filter.
 */

type State = {
  // 1
  projectAreas: string;
  roomsOrZones: string;
  // 2
  includedServices: string;
  excludedServices: string;
  // 3
  deliverables: string;
  designOutputs: string;
  // 4
  procurementResponsibilities: string;
  supplierCoordinationResponsibilities: string;
  clientResponsibilities: string;
  // 5
  siteVisitExpectations: string;
  meetingExpectations: string;
  timelineAssumptions: string;
  budgetAssumptions: string;
  // 6
  approvalGates: string;
  knownDependencies: string;
};

function freshState(): State {
  return {
    projectAreas: '',
    roomsOrZones: '',
    includedServices: '',
    excludedServices: '',
    deliverables: '',
    designOutputs: '',
    procurementResponsibilities: '',
    supplierCoordinationResponsibilities: '',
    clientResponsibilities: '',
    siteVisitExpectations: '',
    meetingExpectations: '',
    timelineAssumptions: '',
    budgetAssumptions: '',
    approvalGates: '',
    knownDependencies: ''
  };
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function linesOf(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function Field({
  label,
  helper,
  example,
  value,
  onChange,
  rows = 2,
  list = false
}: {
  label: string;
  helper?: string;
  example?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  list?: boolean;
}) {
  const t = useTranslations();
  return (
    <div>
      <label className="text-[12px] text-ink-2 block mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={example}
        className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
      />
      {helper && (
        <p className="text-[11px] text-ink-3 italic mt-1 leading-snug">{helper}</p>
      )}
      {list && (
        <p className="text-[10px] text-ink-3 mt-0.5">
          {t('scope_wizard.list_hint')}
        </p>
      )}
    </div>
  );
}

/* ─── Step components ─────────────────────────────────────────── */

function AreasStep({ state, update }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3 leading-snug">{t('scope_wizard.areas_intro')}</p>
      <Field
        label={t('scope_wizard.f_project_areas')}
        helper={t('scope_wizard.h_project_areas')}
        example={t('scope_wizard.e_project_areas')}
        value={state.projectAreas}
        onChange={(v) => update({ projectAreas: v })}
        rows={3}
      />
      <Field
        label={t('scope_wizard.f_rooms_zones')}
        helper={t('scope_wizard.h_rooms_zones')}
        example={t('scope_wizard.e_rooms_zones')}
        value={state.roomsOrZones}
        onChange={(v) => update({ roomsOrZones: v })}
        rows={4}
        list
      />
    </div>
  );
}

function ServicesStep({ state, update }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3 leading-snug">{t('scope_wizard.services_intro')}</p>
      <Field
        label={t('scope_wizard.f_included')}
        helper={t('scope_wizard.h_included')}
        example={t('scope_wizard.e_included')}
        value={state.includedServices}
        onChange={(v) => update({ includedServices: v })}
        rows={4}
        list
      />
      <Field
        label={t('scope_wizard.f_excluded')}
        helper={t('scope_wizard.h_excluded')}
        example={t('scope_wizard.e_excluded')}
        value={state.excludedServices}
        onChange={(v) => update({ excludedServices: v })}
        rows={4}
        list
      />
    </div>
  );
}

function DeliverablesStep({ state, update }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3 leading-snug">{t('scope_wizard.deliverables_intro')}</p>
      <Field
        label={t('scope_wizard.f_deliverables')}
        helper={t('scope_wizard.h_deliverables')}
        example={t('scope_wizard.e_deliverables')}
        value={state.deliverables}
        onChange={(v) => update({ deliverables: v })}
        rows={4}
        list
      />
      <Field
        label={t('scope_wizard.f_design_outputs')}
        helper={t('scope_wizard.h_design_outputs')}
        example={t('scope_wizard.e_design_outputs')}
        value={state.designOutputs}
        onChange={(v) => update({ designOutputs: v })}
        rows={4}
        list
      />
    </div>
  );
}

function ResponsibilitiesStep({ state, update }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3 leading-snug">{t('scope_wizard.responsibilities_intro')}</p>
      <Field
        label={t('scope_wizard.f_procurement_resp')}
        helper={t('scope_wizard.h_procurement_resp')}
        value={state.procurementResponsibilities}
        onChange={(v) => update({ procurementResponsibilities: v })}
        rows={3}
      />
      <Field
        label={t('scope_wizard.f_supplier_coord')}
        helper={t('scope_wizard.h_supplier_coord')}
        value={state.supplierCoordinationResponsibilities}
        onChange={(v) => update({ supplierCoordinationResponsibilities: v })}
        rows={3}
      />
      <Field
        label={t('scope_wizard.f_client_resp')}
        helper={t('scope_wizard.h_client_resp')}
        value={state.clientResponsibilities}
        onChange={(v) => update({ clientResponsibilities: v })}
        rows={3}
      />
    </div>
  );
}

function ExpectationsStep({ state, update }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3 leading-snug">{t('scope_wizard.expectations_intro')}</p>
      <Field
        label={t('scope_wizard.f_site_visits')}
        helper={t('scope_wizard.h_site_visits')}
        value={state.siteVisitExpectations}
        onChange={(v) => update({ siteVisitExpectations: v })}
        rows={2}
      />
      <Field
        label={t('scope_wizard.f_meetings')}
        helper={t('scope_wizard.h_meetings')}
        value={state.meetingExpectations}
        onChange={(v) => update({ meetingExpectations: v })}
        rows={2}
      />
      <Field
        label={t('scope_wizard.f_timeline')}
        helper={t('scope_wizard.h_timeline')}
        value={state.timelineAssumptions}
        onChange={(v) => update({ timelineAssumptions: v })}
        rows={2}
      />
      <Field
        label={t('scope_wizard.f_budget')}
        helper={t('scope_wizard.h_budget')}
        value={state.budgetAssumptions}
        onChange={(v) => update({ budgetAssumptions: v })}
        rows={2}
      />
    </div>
  );
}

function GatesStep({ state, update }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3 leading-snug">{t('scope_wizard.gates_intro')}</p>
      <Field
        label={t('scope_wizard.f_approval_gates')}
        helper={t('scope_wizard.h_approval_gates')}
        example={t('scope_wizard.e_approval_gates')}
        value={state.approvalGates}
        onChange={(v) => update({ approvalGates: v })}
        rows={4}
        list
      />
      <Field
        label={t('scope_wizard.f_known_deps')}
        helper={t('scope_wizard.h_known_deps')}
        value={state.knownDependencies}
        onChange={(v) => update({ knownDependencies: v })}
        rows={3}
      />
    </div>
  );
}

function ReviewStep({ state }: { state: State; update: (p: Partial<State>) => void }) {
  const t = useTranslations();
  const lc = (s: string) => linesOf(s).length;
  const has = (s: string) => s.trim().length > 0;

  const items: Array<{ key: string; filled: boolean; detail: string }> = [
    { key: 'scope_wizard.f_project_areas', filled: has(state.projectAreas), detail: state.projectAreas.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_rooms_zones', filled: has(state.roomsOrZones), detail: `${lc(state.roomsOrZones)} ${t('scope_wizard.items_count')}` },
    { key: 'scope_wizard.f_included', filled: has(state.includedServices), detail: `${lc(state.includedServices)} ${t('scope_wizard.items_count')}` },
    { key: 'scope_wizard.f_excluded', filled: has(state.excludedServices), detail: `${lc(state.excludedServices)} ${t('scope_wizard.items_count')}` },
    { key: 'scope_wizard.f_deliverables', filled: has(state.deliverables), detail: `${lc(state.deliverables)} ${t('scope_wizard.items_count')}` },
    { key: 'scope_wizard.f_design_outputs', filled: has(state.designOutputs), detail: `${lc(state.designOutputs)} ${t('scope_wizard.items_count')}` },
    { key: 'scope_wizard.f_procurement_resp', filled: has(state.procurementResponsibilities), detail: state.procurementResponsibilities.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_supplier_coord', filled: has(state.supplierCoordinationResponsibilities), detail: state.supplierCoordinationResponsibilities.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_client_resp', filled: has(state.clientResponsibilities), detail: state.clientResponsibilities.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_site_visits', filled: has(state.siteVisitExpectations), detail: state.siteVisitExpectations.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_meetings', filled: has(state.meetingExpectations), detail: state.meetingExpectations.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_timeline', filled: has(state.timelineAssumptions), detail: state.timelineAssumptions.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_budget', filled: has(state.budgetAssumptions), detail: state.budgetAssumptions.slice(0, 80) || '—' },
    { key: 'scope_wizard.f_approval_gates', filled: has(state.approvalGates), detail: `${lc(state.approvalGates)} ${t('scope_wizard.items_count')}` },
    { key: 'scope_wizard.f_known_deps', filled: has(state.knownDependencies), detail: state.knownDependencies.slice(0, 80) || '—' }
  ];
  const filled = items.filter((i) => i.filled).length;

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3 leading-snug">
        {t('scope_wizard.review_intro', { filled, total: 15 })}
      </p>

      <div className="border border-line rounded-md text-[12px]">
        {items.map((it) => (
          <div
            key={it.key}
            className="grid grid-cols-[14px_180px_1fr] gap-2 px-3 py-1.5 border-b border-line last:border-0"
          >
            <span className={it.filled ? 'text-ok' : 'text-ink-3'}>
              {it.filled ? '✓' : '○'}
            </span>
            <span className="text-ink-2">{t(it.key)}</span>
            <span className="text-ink-3 truncate">{it.detail}</span>
          </div>
        ))}
      </div>

      <div className="border border-line-strong bg-bg rounded-md p-3 text-[12px] text-ink-2 leading-snug">
        <strong className="text-ink">{t('scope_wizard.draft_only_label')}</strong>{' '}
        {t('scope_wizard.draft_only_body')}
      </div>
    </div>
  );
}

/* ─── Wizard wrapper ─────────────────────────────────────────── */

export function ScopeWizard({
  open,
  onClose,
  projectId
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const router = useRouter();

  const steps: WizardStepDef<State>[] = [
    {
      id: 'areas',
      titleKey: 'scope_wizard.step_areas',
      isValid: () => true,
      Component: AreasStep
    },
    {
      id: 'services',
      titleKey: 'scope_wizard.step_services',
      isValid: () => true,
      Component: ServicesStep
    },
    {
      id: 'deliverables',
      titleKey: 'scope_wizard.step_deliverables',
      isValid: () => true,
      Component: DeliverablesStep
    },
    {
      id: 'responsibilities',
      titleKey: 'scope_wizard.step_responsibilities',
      isValid: () => true,
      Component: ResponsibilitiesStep
    },
    {
      id: 'expectations',
      titleKey: 'scope_wizard.step_expectations',
      isValid: () => true,
      Component: ExpectationsStep
    },
    {
      id: 'gates',
      titleKey: 'scope_wizard.step_gates',
      isValid: () => true,
      Component: GatesStep
    },
    {
      id: 'review',
      titleKey: 'scope_wizard.step_review',
      isValid: () => true,
      Component: ReviewStep
    }
  ];

  return (
    <Wizard<State>
      open={open}
      onClose={onClose}
      titleKey="scope_wizard.title"
      initialState={freshState()}
      steps={steps}
      submitLabelKey="scope_wizard.submit"
      onSubmit={async (state) => {
        const fd = new FormData();
        if (state.projectAreas.trim()) fd.set('projectAreas', state.projectAreas.trim());
        for (const v of linesOf(state.roomsOrZones)) fd.append('roomsOrZones', v);
        for (const v of linesOf(state.includedServices)) fd.append('includedServices', v);
        for (const v of linesOf(state.excludedServices)) fd.append('excludedServices', v);
        for (const v of linesOf(state.deliverables)) fd.append('deliverables', v);
        for (const v of linesOf(state.designOutputs)) fd.append('designOutputs', v);
        if (state.procurementResponsibilities.trim())
          fd.set('procurementResponsibilities', state.procurementResponsibilities.trim());
        if (state.supplierCoordinationResponsibilities.trim())
          fd.set(
            'supplierCoordinationResponsibilities',
            state.supplierCoordinationResponsibilities.trim()
          );
        if (state.clientResponsibilities.trim())
          fd.set('clientResponsibilities', state.clientResponsibilities.trim());
        if (state.siteVisitExpectations.trim())
          fd.set('siteVisitExpectations', state.siteVisitExpectations.trim());
        if (state.meetingExpectations.trim())
          fd.set('meetingExpectations', state.meetingExpectations.trim());
        if (state.timelineAssumptions.trim())
          fd.set('timelineAssumptions', state.timelineAssumptions.trim());
        if (state.budgetAssumptions.trim())
          fd.set('budgetAssumptions', state.budgetAssumptions.trim());
        for (const v of linesOf(state.approvalGates)) fd.append('approvalGates', v);
        if (state.knownDependencies.trim())
          fd.set('knownDependencies', state.knownDependencies.trim());

        const res = await createScopeVersionAtomic(projectId, fd);
        if (res.ok) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}
