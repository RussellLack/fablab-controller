'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry
} from '@/server/actions/time-entries';

/**
 * Inline time entry form. Two modes: `create` (top of the day list)
 * and `edit` (replaces a row in place).
 *
 * The first Project-Coach prompt (Level 1) lives here: when a raw
 * `note` is filled but `commercialReason` is empty, a warn banner
 * surfaces explaining the gap and pointing at the field. The prompt
 * is dismissible per-session — staff can still save, they just see
 * the warning so the choice is conscious.
 *
 * Chargeability classification drives an inline non-billable-reason
 * field when the user picks a non-chargeable state (goodwill /
 * internal_admin / rework_*). The form derives the legacy boolean
 * `chargeable` server-side from the richer enum.
 */

const WORK_CATEGORIES = [
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
type WorkCategory = (typeof WORK_CATEGORIES)[number];

const PROJECT_STAGES = [
  'brief',
  'concept',
  'design_development',
  'specification',
  'procurement_production',
  'installation',
  'handover',
  'on_hold',
  'cancelled',
  'archived',
  'in_dispute'
] as const;
type ProjectStage = (typeof PROJECT_STAGES)[number];

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

const NON_CHARGEABLE_STATES: Chargeability[] = [
  'goodwill',
  'internal_admin',
  'rework_fablab',
  'rework_customer',
  'rework_supplier',
  'out_of_scope_approval_needed'
];

// Suggestion bank for the commercialReason picker. Staff can pick a
// pre-canned reason or type their own. The picker maps to the Step-3
// vocabulary in `28-project-coaching-layer.md`.
const REASON_SUGGESTIONS = [
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

export type TimeEntryDraft = {
  id?: string;
  projectId: string;
  workDate: string;            // YYYY-MM-DD
  hours: string;               // string-typed input, parsed server-side
  stage: ProjectStage;
  category: WorkCategory;
  note: string;
  commercialReason: string;
  customerVisibleSummary: string;
  chargeabilityStatus: Chargeability | '';
  nonChargeableReason: string;
  linkedObjectType: string;
  linkedObjectId: string;
  reportable: boolean;
};

export function TimeEntryForm({
  mode,
  projects,
  initial,
  onClose
}: {
  mode: 'create' | 'edit';
  projects: Array<{ id: string; reference: string; title: string; currentStage: ProjectStage }>;
  initial?: TimeEntryDraft;
  onClose?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [state, setState] = useState<TimeEntryDraft>(
    initial ?? {
      projectId: projects[0]?.id ?? '',
      workDate: today,
      hours: '',
      stage: projects[0]?.currentStage ?? 'concept',
      category: 'design_work',
      note: '',
      commercialReason: '',
      customerVisibleSummary: '',
      chargeabilityStatus: '',
      nonChargeableReason: '',
      linkedObjectType: '',
      linkedObjectId: '',
      reportable: true
    }
  );

  // Auto-set stage when project changes (uses the project's current stage).
  const selectedProject = projects.find((p) => p.id === state.projectId);
  useEffect(() => {
    if (selectedProject && mode === 'create') {
      setState((s) => ({ ...s, stage: selectedProject.currentStage }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.projectId]);

  function set<K extends keyof TimeEntryDraft>(key: K, value: TimeEntryDraft[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  // The Coach prompt fires whenever a note is filled but reason is empty.
  const coachPromptActive =
    state.note.trim().length > 0 && state.commercialReason.trim().length === 0;

  const isNonBillable =
    state.chargeabilityStatus &&
    NON_CHARGEABLE_STATES.includes(state.chargeabilityStatus as Chargeability);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('reportable', state.reportable ? 'on' : 'off');
    setError(null);
    startTransition(async () => {
      const r =
        mode === 'create'
          ? await createTimeEntry(fd)
          : await updateTimeEntry(initial!.id!, fd);
      if (!r.ok) setError(r.error);
      else {
        router.refresh();
        onClose?.();
      }
    });
  }

  function onDelete() {
    if (!initial?.id) return;
    if (!window.confirm(t('time.delete_confirm'))) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTimeEntry(initial.id!);
      if (!r.ok) setError(r.error);
      else {
        router.refresh();
        onClose?.();
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card border-l-2 border-brand bg-surface space-y-3"
    >
      <input type="hidden" name="projectId" value={state.projectId} />
      <input type="hidden" name="stage" value={state.stage} />

      <div className="grid grid-cols-4 gap-3">
        <Row label={t('time.field_project')} required>
          <select
            value={state.projectId}
            onChange={(e) => set('projectId', e.target.value)}
            className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} · {p.title}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('time.field_date')} required>
          <input
            type="date"
            name="workDate"
            value={state.workDate}
            onChange={(e) => set('workDate', e.target.value)}
            max={today}
            className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </Row>
        <Row label={t('time.field_hours')} required>
          <input
            type="number"
            name="hours"
            value={state.hours}
            onChange={(e) => set('hours', e.target.value)}
            step="0.25"
            min="0.25"
            max="24"
            placeholder="2.5"
            className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </Row>
        <Row label={t('time.field_category')} required>
          <select
            name="category"
            value={state.category}
            onChange={(e) => set('category', e.target.value as WorkCategory)}
            className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {WORK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`time.category.${c}`)}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <Row label={t('time.field_note')}>
        <textarea
          name="note"
          value={state.note}
          onChange={(e) => set('note', e.target.value)}
          rows={2}
          placeholder={t('time.field_note_placeholder')}
          className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
      </Row>

      {coachPromptActive && (
        <div className="border-l-2 border-warn bg-warn-soft/40 rounded-r px-3 py-2 text-[12px] text-warn leading-snug">
          <div className="font-semibold mb-0.5">{t('time.coach.missing_reason_title')}</div>
          <div className="text-ink-2">{t('time.coach.missing_reason_body')}</div>
        </div>
      )}

      <Row label={t('time.field_commercial_reason')}>
        <textarea
          name="commercialReason"
          value={state.commercialReason}
          onChange={(e) => set('commercialReason', e.target.value)}
          rows={2}
          placeholder={t('time.field_commercial_reason_placeholder')}
          className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
        <div className="flex flex-wrap gap-1 mt-1.5">
          {REASON_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                const label = t(`time.reason.${s}`);
                set(
                  'commercialReason',
                  state.commercialReason ? state.commercialReason : label
                );
              }}
              className="text-[10px] px-2 py-0.5 rounded border border-line text-ink-2 hover:bg-bg"
              title={t(`time.reason.${s}`)}
            >
              {t(`time.reason.${s}`)}
            </button>
          ))}
        </div>
      </Row>

      <Row label={t('time.field_customer_summary')}>
        <textarea
          name="customerVisibleSummary"
          value={state.customerVisibleSummary}
          onChange={(e) => set('customerVisibleSummary', e.target.value)}
          rows={2}
          placeholder={t('time.field_customer_summary_placeholder')}
          className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
        <p className="text-[11px] text-ink-3 mt-1">{t('time.field_customer_summary_help')}</p>
      </Row>

      <div className="grid grid-cols-2 gap-3">
        <Row label={t('time.field_chargeability')}>
          <select
            name="chargeabilityStatus"
            value={state.chargeabilityStatus}
            onChange={(e) => set('chargeabilityStatus', e.target.value as Chargeability | '')}
            className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">—</option>
            {CHARGEABILITY.map((c) => (
              <option key={c} value={c}>
                {t(`time.chargeability.${c}`)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('time.field_reportable')}>
          <label className="flex items-center gap-2 text-[12px] mt-1.5">
            <input
              type="checkbox"
              checked={state.reportable}
              onChange={(e) => set('reportable', e.target.checked)}
            />
            {t('time.field_reportable_help')}
          </label>
        </Row>
      </div>

      {isNonBillable && (
        <Row label={t('time.field_non_chargeable_reason')}>
          <textarea
            name="nonChargeableReason"
            value={state.nonChargeableReason}
            onChange={(e) => set('nonChargeableReason', e.target.value)}
            rows={2}
            placeholder={t('time.field_non_chargeable_reason_placeholder')}
            className="w-full px-2 py-1.5 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />
        </Row>
      )}

      {error && (
        <div className="text-[12px] text-warn bg-warn-soft border border-warn/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          {mode === 'edit' && (
            <button
              type="button"
              onClick={onDelete}
              className="btn btn-ghost text-[12px] text-warn"
              disabled={isPending}
            >
              {t('time.delete_cta')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost text-[12px]"
              disabled={isPending}
            >
              {t('action.cancel')}
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary text-[12px]"
            disabled={isPending}
          >
            {isPending
              ? t('time.saving')
              : mode === 'edit'
                ? t('time.save_changes')
                : t('time.save_entry')}
          </button>
        </div>
      </div>
    </form>
  );
}

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
