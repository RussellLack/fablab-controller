'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createCoachEvidence } from '@/server/actions/coach';
import { Wizard, type WizardStepDef } from './wizard';

/**
 * Project Coach drawer wizard — Project Coaching MVP-B
 * (see `28-project-coaching-layer.md` §4).
 *
 * 5 steps:
 *   1. Stage — confirm project context + the module the user is in
 *   2. Work  — what work is happening + linked-object provenance
 *   3. Why   — controlled reason picker + free-text expansion
 *   4. Scope — in-scope / chargeable / change / goodwill classification
 *   5. Output — what gets created: evidence note (always) + an
 *               optional pre-filled time entry
 *
 * Step 4's classification options carry the Step-3 chips' weight —
 * doctrine words from `00-` §22 framed as plain English. The wizard
 * doesn't auto-create binding records (approvals, change orders, POs).
 * It commits a structured note + optional time entry; deep links to
 * Change Control / Approvals appear when the classification suggests
 * them.
 */

const WORK_TYPES = [
  'design_development',
  'sourcing',
  'supplier_coordination',
  'client_meeting',
  'scope_clarification',
  'change_request',
  'approval_preparation',
  'procurement_follow_up',
  'delivery_coordination',
  'reporting',
  'handover'
] as const;
type WorkType = (typeof WORK_TYPES)[number];

const LINKED_OBJECT_TYPES = [
  'none',
  'brief',
  'scope',
  'item',
  'package',
  'approval',
  'rfq',
  'quote',
  'purchase_order',
  'change_order',
  'customer_comment',
  'customer_upload',
  'time_entry'
] as const;
type LinkedObjectType = (typeof LINKED_OBJECT_TYPES)[number];

const REASONS = [
  'clarify_customer_intent',
  'translate_brief_into_design_direction',
  'develop_design_recommendation',
  'compare_options',
  'protect_budget',
  'reduce_delivery_risk',
  'coordinate_supplier_response',
  'prepare_customer_decision',
  'manage_customer_change',
  'resolve_supplier_issue',
  'prevent_incorrect_order',
  'protect_margin',
  'document_agreed_decision',
  'prepare_customer_reporting',
  'close_open_issue'
] as const;
type Reason = (typeof REASONS)[number];

const CHARGEABILITY = [
  'included',
  'chargeable',
  'change',
  'out_of_scope_approval_needed',
  'goodwill',
  'internal_admin',
  'rework_fablab',
  'rework_customer',
  'rework_supplier'
] as const;
type Chargeability = (typeof CHARGEABILITY)[number];

const EVIDENCE_CATEGORIES = [
  'design_progress',
  'project_coordination',
  'decisions_and_approvals',
  'budget_and_scope_control',
  'risks_and_issues',
  'customer_actions_needed',
  'handover'
] as const;
type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

const WORK_CATEGORIES_FOR_TIME = [
  'design_work',
  'client_meetings',
  'procurement',
  'supplier_coordination',
  'freight_customs',
  'site_visits',
  'install_coordination',
  'admin',
  'rework',
  'change_requests',
  'non_billable_goodwill'
] as const;
type WorkCategoryForTime = (typeof WORK_CATEGORIES_FOR_TIME)[number];

const PROJECT_STAGES = [
  'brief',
  'concept',
  'design_development',
  'specification',
  'procurement_production',
  'installation',
  'handover'
] as const;
type ProjectStage = (typeof PROJECT_STAGES)[number];

type State = {
  // Step 1 — context
  projectId: string;
  projectStage: ProjectStage;
  module: string;
  task: string;            // free text — what's being reviewed

  // Step 2 — work
  workTypes: WorkType[];
  linkedObjectType: LinkedObjectType;
  sourceId: string;        // optional UUID
  occurredOn: string;      // YYYY-MM-DD

  // Step 3 — why
  reasons: Reason[];
  customReason: string;
  customerVisibleReason: string;

  // Step 4 — scope
  chargeability: Chargeability | '';

  // Step 5 — output
  evidenceCategory: EvidenceCategory;
  internalNote: string;
  customerSummary: string;
  includeInReport: boolean;
  alsoCreateTimeEntry: boolean;
  timeEntryHours: string;
  timeEntryStage: ProjectStage;
  timeEntryCategory: WorkCategoryForTime;
};

export function CoachWizard({
  open,
  onClose,
  projectId,
  projectStage,
  initialModule,
  initialLinkedObjectType,
  initialSourceId
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectStage: ProjectStage;
  initialModule?: string;
  initialLinkedObjectType?: LinkedObjectType;
  initialSourceId?: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const initialState: State = {
    projectId,
    projectStage,
    module: initialModule ?? 'general',
    task: '',
    workTypes: [],
    linkedObjectType: initialLinkedObjectType ?? 'none',
    sourceId: initialSourceId ?? '',
    occurredOn: today,
    reasons: [],
    customReason: '',
    customerVisibleReason: '',
    chargeability: '',
    evidenceCategory: 'project_coordination',
    internalNote: '',
    customerSummary: '',
    includeInReport: true,
    alsoCreateTimeEntry: false,
    timeEntryHours: '',
    timeEntryStage: projectStage,
    timeEntryCategory: 'design_work'
  };

  const steps: WizardStepDef<State>[] = [
    {
      id: 'stage',
      titleKey: 'coach.step_stage',
      isValid: (s) => s.task.trim().length > 0,
      Component: StageStep
    },
    {
      id: 'work',
      titleKey: 'coach.step_work',
      isValid: (s) => s.workTypes.length > 0,
      Component: WorkStep
    },
    {
      id: 'why',
      titleKey: 'coach.step_why',
      isValid: (s) =>
        s.reasons.length > 0 || s.customReason.trim().length > 0,
      Component: WhyStep
    },
    {
      id: 'scope',
      titleKey: 'coach.step_scope',
      isValid: (s) => s.chargeability !== '',
      Component: ScopeStep
    },
    {
      id: 'output',
      titleKey: 'coach.step_output',
      isValid: (s) => s.internalNote.trim().length > 0,
      Component: OutputStep
    }
  ];

  return (
    <Wizard<State>
      open={open}
      onClose={onClose}
      titleKey="coach.wizard_title"
      initialState={initialState}
      steps={steps}
      submitLabelKey="coach.commit"
      onSubmit={async (state) => {
        const fd = new FormData();
        fd.set('projectId', state.projectId);
        fd.set('occurredOn', state.occurredOn);
        fd.set('evidenceCategory', state.evidenceCategory);
        fd.set(
          'sourceType',
          state.linkedObjectType === 'none' ? 'coach_wizard' : state.linkedObjectType
        );
        if (state.sourceId.trim()) fd.set('sourceId', state.sourceId.trim());
        fd.set('internalNote', state.internalNote.trim());
        if (state.customerSummary.trim()) fd.set('customerSummary', state.customerSummary.trim());
        fd.set('includeInReport', state.includeInReport ? 'on' : 'off');
        if (state.alsoCreateTimeEntry) {
          fd.set('alsoCreateTimeEntry', 'on');
          fd.set('timeEntryHours', state.timeEntryHours);
          fd.set('timeEntryStage', state.timeEntryStage);
          fd.set('timeEntryCategory', state.timeEntryCategory);
          if (state.chargeability) fd.set('timeEntryChargeability', state.chargeability);
        }
        const r = await createCoachEvidence(fd);
        if (r.ok) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: r.error };
      }}
    />
  );
}

/* ─────────────────────────── STEPS ─────────────────────────── */

function StageStep({
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
        {t('coach.step_stage_intro')}
      </p>
      <Row label={t('coach.field_stage')}>
        <select
          value={state.projectStage}
          onChange={(e) => update({ projectStage: e.target.value as ProjectStage })}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {PROJECT_STAGES.map((s) => (
            <option key={s} value={s}>
              {t(`stage.${s}`)}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('coach.field_module')}>
        <select
          value={state.module}
          onChange={(e) => update({ module: e.target.value })}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {[
            'general',
            'brief',
            'scope',
            'items',
            'approvals',
            'procurement',
            'delivery',
            'reporting',
            'handover',
            'change_control'
          ].map((m) => (
            <option key={m} value={m}>
              {t(`coach.module.${m}`)}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('coach.field_task')} required>
        <textarea
          value={state.task}
          onChange={(e) => update({ task: e.target.value })}
          rows={2}
          placeholder={t('coach.field_task_placeholder')}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
      </Row>
    </div>
  );
}

function WorkStep({
  state,
  update
}: {
  state: State;
  update: (patch: Partial<State>) => void;
}) {
  const t = useTranslations();
  function toggle(v: WorkType) {
    update({
      workTypes: state.workTypes.includes(v)
        ? state.workTypes.filter((x) => x !== v)
        : [...state.workTypes, v]
    });
  }
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-2 leading-snug">
        {t('coach.step_work_intro')}
      </p>
      <Row label={t('coach.field_work_types')} required>
        <div className="flex flex-wrap gap-1.5">
          {WORK_TYPES.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => toggle(w)}
              className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                state.workTypes.includes(w)
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line bg-surface text-ink-2 hover:bg-bg'
              }`}
            >
              {t(`coach.work_type.${w}`)}
            </button>
          ))}
        </div>
      </Row>
      <Row label={t('coach.field_occurred_on')}>
        <input
          type="date"
          value={state.occurredOn}
          onChange={(e) => update({ occurredOn: e.target.value })}
          max={new Date().toISOString().slice(0, 10)}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </Row>
      <Row label={t('coach.field_linked_object_type')}>
        <select
          value={state.linkedObjectType}
          onChange={(e) => update({ linkedObjectType: e.target.value as LinkedObjectType })}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {LINKED_OBJECT_TYPES.map((o) => (
            <option key={o} value={o}>
              {t(`coach.linked_object.${o}`)}
            </option>
          ))}
        </select>
      </Row>
      {state.linkedObjectType !== 'none' && (
        <Row label={t('coach.field_source_id')}>
          <input
            type="text"
            value={state.sourceId}
            onChange={(e) => update({ sourceId: e.target.value })}
            placeholder={t('coach.field_source_id_placeholder')}
            className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono"
          />
          <p className="text-[11px] text-ink-3 mt-1">{t('coach.field_source_id_help')}</p>
        </Row>
      )}
    </div>
  );
}

function WhyStep({
  state,
  update
}: {
  state: State;
  update: (patch: Partial<State>) => void;
}) {
  const t = useTranslations();
  function toggle(v: Reason) {
    update({
      reasons: state.reasons.includes(v)
        ? state.reasons.filter((x) => x !== v)
        : [...state.reasons, v]
    });
  }
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-2 leading-snug">
        {t('coach.step_why_intro')}
      </p>
      <Row label={t('coach.field_reasons')} required>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                state.reasons.includes(r)
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line bg-surface text-ink-2 hover:bg-bg'
              }`}
            >
              {t(`time.reason.${r}`)}
            </button>
          ))}
        </div>
      </Row>
      <Row label={t('coach.field_custom_reason')}>
        <textarea
          value={state.customReason}
          onChange={(e) => update({ customReason: e.target.value })}
          rows={2}
          placeholder={t('coach.field_custom_reason_placeholder')}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
      </Row>
      <Row label={t('coach.field_customer_visible_reason')}>
        <textarea
          value={state.customerVisibleReason}
          onChange={(e) => update({ customerVisibleReason: e.target.value })}
          rows={2}
          placeholder={t('coach.field_customer_visible_reason_placeholder')}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
        <p className="text-[11px] text-ink-3 mt-1">{t('coach.field_customer_visible_reason_help')}</p>
      </Row>
    </div>
  );
}

function ScopeStep({
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
        {t('coach.step_scope_intro')}
      </p>
      <Row label={t('coach.field_chargeability')} required>
        <div className="space-y-1.5">
          {CHARGEABILITY.map((c) => (
            <label
              key={c}
              className={`flex items-start gap-2 px-3 py-2 border rounded cursor-pointer transition-colors ${
                state.chargeability === c
                  ? 'border-brand bg-brand-soft/30'
                  : 'border-line bg-surface hover:bg-bg'
              }`}
            >
              <input
                type="radio"
                name="chargeability"
                value={c}
                checked={state.chargeability === c}
                onChange={() => update({ chargeability: c })}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">
                  {t(`time.chargeability.${c}`)}
                </span>
                <span className="block text-[11px] text-ink-3 mt-0.5">
                  {t(`coach.chargeability_explainer.${c}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Row>

      {(state.chargeability === 'change' ||
        state.chargeability === 'out_of_scope_approval_needed') && (
        <div className="border-l-2 border-info bg-info-soft/30 rounded-r p-3 text-[12px] text-ink-2 leading-snug">
          <div className="font-semibold mb-1">{t('coach.follow_up_title')}</div>
          <p>{t('coach.follow_up_change_body')}</p>
          <p className="text-[11px] text-ink-3 mt-1.5">
            {t('coach.follow_up_change_hint')}
          </p>
        </div>
      )}
      {state.chargeability === 'goodwill' && (
        <div className="border-l-2 border-warn bg-warn-soft/30 rounded-r p-3 text-[12px] text-ink-2 leading-snug">
          <div className="font-semibold mb-1">{t('coach.follow_up_title')}</div>
          <p>{t('coach.follow_up_goodwill_body')}</p>
        </div>
      )}
    </div>
  );
}

function OutputStep({
  state,
  update
}: {
  state: State;
  update: (patch: Partial<State>) => void;
}) {
  const t = useTranslations();

  // Pre-fill internal note + customer summary on first render of the
  // step if empty — staff can edit before commit.
  if (state.internalNote === '' && state.task.trim().length > 0) {
    const reasonText =
      state.reasons.map((r) => t(`time.reason.${r}`)).join(' · ') ||
      state.customReason;
    const auto = [
      state.task.trim(),
      reasonText ? `Why: ${reasonText}` : null,
      state.customReason.trim() && state.customReason.trim() !== state.task.trim()
        ? state.customReason.trim()
        : null
    ]
      .filter(Boolean)
      .join('\n');
    if (auto) update({ internalNote: auto });
  }
  if (
    state.customerSummary === '' &&
    state.customerVisibleReason.trim().length > 0
  ) {
    update({ customerSummary: state.customerVisibleReason.trim() });
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-2 leading-snug">
        {t('coach.step_output_intro')}
      </p>

      <Row label={t('coach.field_evidence_category')}>
        <select
          value={state.evidenceCategory}
          onChange={(e) => update({ evidenceCategory: e.target.value as EvidenceCategory })}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {EVIDENCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`coach.evidence_category.${c}`)}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-3 mt-1">{t('coach.field_evidence_category_help')}</p>
      </Row>

      <Row label={t('coach.field_internal_note')} required>
        <textarea
          value={state.internalNote}
          onChange={(e) => update({ internalNote: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
      </Row>

      <Row label={t('coach.field_customer_summary')}>
        <textarea
          value={state.customerSummary}
          onChange={(e) => update({ customerSummary: e.target.value })}
          rows={3}
          placeholder={t('coach.field_customer_summary_placeholder')}
          className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
        <p className="text-[11px] text-ink-3 mt-1">{t('coach.field_customer_summary_help')}</p>
      </Row>

      <label className="flex items-center gap-2 text-[12px] cursor-pointer">
        <input
          type="checkbox"
          checked={state.includeInReport}
          onChange={(e) => update({ includeInReport: e.target.checked })}
        />
        {t('coach.field_include_in_report')}
      </label>

      <div className="border border-line rounded-md p-3 space-y-3">
        <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={state.alsoCreateTimeEntry}
            onChange={(e) => update({ alsoCreateTimeEntry: e.target.checked })}
          />
          {t('coach.field_also_create_time_entry')}
        </label>
        {state.alsoCreateTimeEntry && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <Row label={t('time.field_hours')} required>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={state.timeEntryHours}
                onChange={(e) => update({ timeEntryHours: e.target.value })}
                placeholder="2.5"
                className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </Row>
            <Row label={t('time.field_category')}>
              <select
                value={state.timeEntryCategory}
                onChange={(e) =>
                  update({ timeEntryCategory: e.target.value as WorkCategoryForTime })
                }
                className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {WORK_CATEGORIES_FOR_TIME.map((c) => (
                  <option key={c} value={c}>
                    {t(`time.category.${c}`)}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t('coach.field_stage')}>
              <select
                value={state.timeEntryStage}
                onChange={(e) =>
                  update({ timeEntryStage: e.target.value as ProjectStage })
                }
                className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {PROJECT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`stage.${s}`)}
                  </option>
                ))}
              </select>
            </Row>
          </div>
        )}
        <p className="text-[11px] text-ink-3">
          {t('coach.field_also_create_time_entry_help')}
        </p>
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
      <label className="block text-[11px] text-ink-2 mb-1 uppercase tracking-wider">
        {label}
        {required && <span className="text-warn ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
