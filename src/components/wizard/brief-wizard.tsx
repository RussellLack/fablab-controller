'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateProjectBrief } from '@/server/actions/project-brief';
import { Wizard, type WizardStepDef } from './wizard';

/**
 * Brief wizard — W4 of 22-wizards.md.
 *
 * Unlike W0/W1/W2/W3 the Brief isn't really *created* — the 16
 * intake fields are already on the lead (per 00-industry-best-
 * practices.md §2) and copied to the project at conversion. The
 * Brief gate (per 21-ux-design.md Phase 2 decision #2) needs three
 * things: description filled + role set + at least one approved
 * Approval with target = scope_baseline_version.
 *
 * So this is a guided REVIEW that:
 *   1. Shows all 16 intake fields from the originating lead as
 *      read-only context (so the user has the full design picture
 *      while writing the brief).
 *   2. Lets the user edit / expand the project description and
 *      confirm/change the Fablab role. The role implication banner
 *      updates live as the user changes role.
 *   3. Surfaces the 3 Brief gate criteria with live tick/cross
 *      against the user's current edits + a direct link to
 *      /approvals/new to request the scope approval if missing.
 *
 * Submit writes only description + fablabRole via updateProjectBrief.
 */

export type IntakeContext = {
  prospectiveClientName: string | null;
  clientKind: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  propertyAddress: string | null;
  projectType: string | null;
  roomsOrZones: string | null;
  desiredOutcome: string | null;
  budgetExpectation: string | null;
  budgetCurrency: string | null;
  timelineExpectation: string | null;
  decisionMakers: string | null;
  approvalProcess: string | null;
  existingSuppliers: string | null;
  knownConstraints: string | null;
  designStylePreferences: string | null;
  procurementExpectations: string | null;
  deliveryInstallExpectations: string | null;
  fablabExpectedRole: string | null;
};

type FablabRole =
  | 'design_advisory_only'
  | 'design_and_specification'
  | 'procurement_support'
  | 'procurement_and_resale'
  | 'supplier_coordination'
  | 'delivery_coordination'
  | 'installation_coordination'
  | 'full_project_control';

const ROLES: FablabRole[] = [
  'design_advisory_only',
  'design_and_specification',
  'procurement_support',
  'procurement_and_resale',
  'supplier_coordination',
  'delivery_coordination',
  'installation_coordination',
  'full_project_control'
];

type State = {
  description: string;
  fablabRole: FablabRole;
};

/* ─── Step 1 — Intake context (read-only) ────────────────────── */

function IntakeContextStep({
  intake
}: {
  state: State;
  update: (p: Partial<State>) => void;
  intake: IntakeContext | null;
}) {
  const t = useTranslations();

  if (!intake) {
    return (
      <div className="text-[13px] text-ink-2 leading-snug">
        <p>{t('brief_wizard.no_lead_context')}</p>
      </div>
    );
  }

  // The 16 §2 intake fields in canonical order, plus budget currency separately
  const rows: Array<{ labelKey: string; value: string | null; valueIsKey?: boolean }> = [
    { labelKey: 'lead.client_name', value: intake.prospectiveClientName },
    { labelKey: 'lead.client_kind', value: intake.clientKind, valueIsKey: true },
    { labelKey: 'lead.contact_name', value: intake.primaryContactName },
    { labelKey: 'lead.contact_email', value: intake.primaryContactEmail },
    { labelKey: 'lead.contact_phone', value: intake.primaryContactPhone },
    { labelKey: 'lead.property', value: intake.propertyAddress },
    { labelKey: 'lead.project_type', value: intake.projectType, valueIsKey: true },
    { labelKey: 'lead.rooms', value: intake.roomsOrZones },
    { labelKey: 'lead.outcome', value: intake.desiredOutcome },
    {
      labelKey: 'lead.budget',
      value: intake.budgetExpectation
        ? `${intake.budgetExpectation} ${intake.budgetCurrency ?? ''}`.trim()
        : null
    },
    { labelKey: 'lead.timeline', value: intake.timelineExpectation },
    { labelKey: 'lead.decision_makers', value: intake.decisionMakers },
    { labelKey: 'lead.approval_process', value: intake.approvalProcess },
    { labelKey: 'lead.existing_suppliers', value: intake.existingSuppliers },
    { labelKey: 'lead.constraints', value: intake.knownConstraints },
    { labelKey: 'lead.style', value: intake.designStylePreferences },
    { labelKey: 'lead.proc_expect', value: intake.procurementExpectations },
    { labelKey: 'lead.delivery_expect', value: intake.deliveryInstallExpectations },
    {
      labelKey: 'lead.fablab_role',
      value: intake.fablabExpectedRole,
      valueIsKey: true
    }
  ];

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3 leading-snug">{t('brief_wizard.intake_intro')}</p>
      <div className="border border-line rounded-md text-[12px]">
        {rows.map(({ labelKey, value, valueIsKey }) => (
          <div
            key={labelKey}
            className="grid grid-cols-[160px_1fr] gap-2 px-3 py-1.5 border-b border-line last:border-0"
          >
            <span className="text-ink-3">{t(labelKey)}</span>
            <span className="text-ink whitespace-pre-wrap">
              {value
                ? valueIsKey
                  ? t(
                      labelKey === 'lead.fablab_role'
                        ? `role.short.${value}`
                        : labelKey === 'lead.project_type'
                          ? `type.${value}`
                          : `lead.kind.${value}`
                    )
                  : value
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 2 — Description + role ────────────────────────────── */

function DescriptionAndRoleStep({
  state,
  update,
  intake
}: {
  state: State;
  update: (p: Partial<State>) => void;
  intake: IntakeContext | null;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3 leading-snug">{t('brief_wizard.edit_intro')}</p>

      <div>
        <label className="text-[12px] text-ink-2 block mb-1">
          {t('proj.brief')} *
        </label>
        <textarea
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={8}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
          placeholder={
            intake?.desiredOutcome
              ? t('brief_wizard.desc_placeholder_from_intake', {
                  outcome: intake.desiredOutcome.slice(0, 100)
                })
              : t('brief_wizard.desc_placeholder')
          }
        />
        <p className="text-[11px] text-ink-3 italic mt-1 leading-snug">
          {t('brief_wizard.desc_helper')}
        </p>
      </div>

      <div>
        <label className="text-[12px] text-ink-2 block mb-1">
          {t('lead.fablab_role')} *
        </label>
        <select
          value={state.fablabRole}
          onChange={(e) => update({ fablabRole: e.target.value as FablabRole })}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.short.${r}`)}
            </option>
          ))}
        </select>
        <div className="mt-2 border-l-2 border-warn bg-warn-soft text-warn px-3 py-2 text-[12px] leading-snug rounded-r">
          <div className="font-semibold mb-0.5">{t(`role.profile.${state.fablabRole}`)}</div>
          <div className="text-[11px]">{t(`role.implication.${state.fablabRole}`)}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 3 — Gate status ───────────────────────────────────── */

function GateStatusStep({
  state,
  projectId,
  scopeApprovalApproved
}: {
  state: State;
  update: (p: Partial<State>) => void;
  projectId: string;
  scopeApprovalApproved: boolean;
}) {
  const t = useTranslations();
  const descriptionOk = state.description.trim().length > 0;
  const roleOk = !!state.fablabRole;
  const allOk = descriptionOk && roleOk && scopeApprovalApproved;

  type Criterion = { labelKey: string; ok: boolean };
  const criteria: Criterion[] = [
    { labelKey: 'brief_wizard.crit_description', ok: descriptionOk },
    { labelKey: 'brief_wizard.crit_role', ok: roleOk },
    { labelKey: 'brief_wizard.crit_scope_approval', ok: scopeApprovalApproved }
  ];

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3 leading-snug">{t('brief_wizard.gate_intro')}</p>
      <div className="border border-line rounded-md text-[13px]">
        {criteria.map((c) => (
          <div
            key={c.labelKey}
            className="grid grid-cols-[14px_1fr] gap-2 px-3 py-2 border-b border-line last:border-0"
          >
            <span className={c.ok ? 'text-ok' : 'text-ink-3'}>{c.ok ? '✓' : '○'}</span>
            <span className="text-ink">{t(c.labelKey)}</span>
          </div>
        ))}
      </div>

      {!scopeApprovalApproved && (
        <div className="border border-line-strong bg-bg rounded-md p-3 text-[12px] text-ink-2 leading-snug">
          <strong className="text-ink">{t('brief_wizard.scope_pending_label')}</strong>{' '}
          {t('brief_wizard.scope_pending_body')}{' '}
          <Link
            href={`/projects/${projectId}/approvals/new`}
            className="text-accent hover:underline"
          >
            {t('brief_wizard.scope_pending_link')}
          </Link>
        </div>
      )}

      <div
        className={
          allOk
            ? 'border-2 border-ok bg-ok-soft text-ok rounded-md p-3 text-[13px]'
            : 'border border-line-strong bg-bg rounded-md p-3 text-[12px] text-ink-2'
        }
      >
        {allOk ? (
          <span>{t('brief_wizard.all_ok')}</span>
        ) : (
          <span>{t('brief_wizard.save_anyway')}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Wizard wrapper ─────────────────────────────────────────── */

export function BriefWizard({
  open,
  onClose,
  projectId,
  currentDescription,
  currentRole,
  intake,
  scopeApprovalApproved
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  currentDescription: string;
  currentRole: FablabRole;
  intake: IntakeContext | null;
  scopeApprovalApproved: boolean;
}) {
  const router = useRouter();

  const initialState: State = {
    description: currentDescription,
    fablabRole: currentRole
  };

  const steps: WizardStepDef<State>[] = [
    {
      id: 'intake',
      titleKey: 'brief_wizard.step_intake',
      isValid: () => true,
      Component: (props) => <IntakeContextStep {...props} intake={intake} />
    },
    {
      id: 'edit',
      titleKey: 'brief_wizard.step_edit',
      // Description must be non-empty to advance — the Brief gate requires it
      isValid: (s) => s.description.trim().length > 0 && !!s.fablabRole,
      Component: (props) => <DescriptionAndRoleStep {...props} intake={intake} />
    },
    {
      id: 'gate',
      titleKey: 'brief_wizard.step_gate',
      isValid: (s) => s.description.trim().length > 0 && !!s.fablabRole,
      Component: (props) => (
        <GateStatusStep
          {...props}
          projectId={projectId}
          scopeApprovalApproved={scopeApprovalApproved}
        />
      )
    }
  ];

  return (
    <Wizard<State>
      open={open}
      onClose={onClose}
      titleKey="brief_wizard.title"
      initialState={initialState}
      steps={steps}
      submitLabelKey="brief_wizard.submit"
      onSubmit={async (state) => {
        const fd = new FormData();
        fd.set('description', state.description);
        fd.set('fablabRole', state.fablabRole);
        const res = await updateProjectBrief(projectId, fd);
        if (res.ok) {
          router.refresh();
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}
