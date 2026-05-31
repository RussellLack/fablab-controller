'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createPoDraftAtomic } from '@/server/actions/procurement';
import { formatMoney } from '@/lib/utils';
import { Wizard, type WizardStepDef } from './wizard';

/**
 * PO wizard — W2 of 22-wizards.md.
 *
 * The most consequential creation in the app — issuing a PO is BINDING
 * per `20-doc-templates-best-practice.md`. The wizard creates a DRAFT
 * only; issuing remains a separate action on the PO detail page, behind
 * the existing canIssuePurchaseOrder gate (R3 enforcement).
 *
 * Steps:
 *   1 — Vendor          pick from vendors with ≥1 winning quote on this
 *                       project's items not already on a PO
 *   2 — Lines           preview the line items that will be auto-generated
 *                       from the winning quotes (read-only in v1)
 *   3 — Delivery        delivery address, deadline, freight terms +
 *                       responsible party, customs requirements
 *   4 — Authorisation   pick the authorising Approval (R3 gate). If none
 *                       eligible exists, links out to /approvals/new
 *   5 — Review          full summary + Create draft button. The BINDING
 *                       red banner is explicitly NOT shown here — only on
 *                       the detail page's Issue button.
 */

export type CandidateVendor = {
  id: string;
  name: string;
  itemCount: number;
  /** Items this vendor would PO if selected. Drives step 2 preview. */
  items: Array<{
    id: string;
    name: string;
    quantity: string;
    unit: string;
    unitCost: string;
    currency: string | null;
  }>;
};

export type CandidateApproval = {
  id: string;
  reference: string;
  subject: string;
  status: string;
};

type FreightParty = 'fablab' | 'vendor' | 'freight_forwarder';

type State = {
  vendorId: string;
  currency: string;
  deliveryAddress: string;
  deliveryDeadline: string;
  deliveryInstructions: string;
  freightTerms: string;
  freightResponsibleParty: FreightParty;
  customsRequirements: string;
  approvalReferenceId: string;
  notes: string;
  terms: string;
};

function freshState(defaultSiteAddress: string | null): State {
  return {
    vendorId: '',
    currency: 'NOK',
    deliveryAddress: defaultSiteAddress ?? '',
    deliveryDeadline: '',
    deliveryInstructions: '',
    freightTerms: '',
    freightResponsibleParty: 'vendor',
    customsRequirements: '',
    approvalReferenceId: '',
    notes: '',
    terms: ''
  };
}

/* ─── Step components ─────────────────────────────────────────── */

function VendorStep({
  state,
  update,
  candidates
}: {
  state: State;
  update: (p: Partial<State>) => void;
  candidates: CandidateVendor[];
}) {
  const t = useTranslations();
  if (candidates.length === 0) {
    return (
      <div className="text-[13px] text-ink-2">
        <p>{t('po_wizard.no_candidates')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-ink-3 leading-snug">{t('po_wizard.vendor_helper')}</p>
      {candidates.map((v) => (
        <label
          key={v.id}
          className="flex items-center gap-2 cursor-pointer text-[13px] px-2 py-2 rounded border border-line hover:bg-bg"
        >
          <input
            type="radio"
            name="po-vendor"
            checked={state.vendorId === v.id}
            onChange={() => update({ vendorId: v.id })}
          />
          <span className="flex-1">{v.name}</span>
          <span className="text-[11px] text-ink-3">
            {t('po_wizard.item_count', { count: v.itemCount })}
          </span>
        </label>
      ))}
    </div>
  );
}

function LinesStep({
  state,
  candidates
}: {
  state: State;
  update: (p: Partial<State>) => void;
  candidates: CandidateVendor[];
}) {
  const t = useTranslations();
  const vendor = candidates.find((v) => v.id === state.vendorId);
  if (!vendor) {
    return <p className="text-[13px] text-ink-2">{t('po_wizard.pick_vendor_first')}</p>;
  }
  const subtotal = vendor.items.reduce(
    (s, i) => s + parseFloat(i.unitCost) * parseFloat(i.quantity || '1'),
    0
  );
  const vat = subtotal * 0.25;
  const total = subtotal + vat;
  const currency = vendor.items[0]?.currency ?? state.currency;

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3 leading-snug">{t('po_wizard.lines_helper')}</p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
            <th className="py-2">{t('po.col_item')}</th>
            <th className="py-2 text-right">{t('po.col_qty')}</th>
            <th className="py-2 text-right">{t('po.col_unit_cost')}</th>
            <th className="py-2 text-right">{t('po.col_line_total')}</th>
          </tr>
        </thead>
        <tbody>
          {vendor.items.map((i) => {
            const lineTotal = parseFloat(i.unitCost) * parseFloat(i.quantity || '1');
            return (
              <tr key={i.id} className="border-b border-line last:border-0">
                <td className="py-1.5">{i.name}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {i.quantity} {i.unit}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(i.unitCost, currency)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(lineTotal.toFixed(2), currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-line pt-2 text-[12px] space-y-1 tabular-nums">
        <div className="flex justify-between">
          <span className="text-ink-3">{t('po.subtotal')}</span>
          <span>{formatMoney(subtotal.toFixed(2), currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">{t('po.vat')}</span>
          <span>{formatMoney(vat.toFixed(2), currency)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>{t('po.total_gross')}</span>
          <span>{formatMoney(total.toFixed(2), currency)}</span>
        </div>
      </div>
    </div>
  );
}

function DeliveryStep({
  state,
  update
}: {
  state: State;
  update: (p: Partial<State>) => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3 leading-snug">{t('po_wizard.delivery_helper')}</p>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('po.delivery_address')}</label>
        <textarea
          value={state.deliveryAddress}
          onChange={(e) => update({ deliveryAddress: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('po.delivery_deadline')}</label>
        <input
          type="date"
          value={state.deliveryDeadline}
          onChange={(e) => update({ deliveryDeadline: e.target.value })}
          className="px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('po.delivery_instructions')}</label>
        <textarea
          value={state.deliveryInstructions}
          onChange={(e) => update({ deliveryInstructions: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('po.freight_terms')}</label>
        <input
          value={state.freightTerms}
          onChange={(e) => update({ freightTerms: e.target.value })}
          placeholder="DDP Tromsø / FOB Hamburg / …"
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('po.freight_party')}</label>
        <select
          value={state.freightResponsibleParty}
          onChange={(e) =>
            update({ freightResponsibleParty: e.target.value as FreightParty })
          }
          className="px-2.5 py-2 border border-line rounded-md text-[13px]"
        >
          <option value="vendor">{t('po.freight_vendor')}</option>
          <option value="fablab">{t('po.freight_fablab')}</option>
          <option value="freight_forwarder">{t('po.freight_forwarder')}</option>
        </select>
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('po.customs_requirements')}</label>
        <textarea
          value={state.customsRequirements}
          onChange={(e) => update({ customsRequirements: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
    </div>
  );
}

function AuthorisationStep({
  state,
  update,
  approvals,
  projectId
}: {
  state: State;
  update: (p: Partial<State>) => void;
  approvals: CandidateApproval[];
  projectId: string;
}) {
  const t = useTranslations();
  if (approvals.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-[12px] text-ink-2 leading-snug">{t('po_wizard.no_approvals_yet')}</p>
        <Link
          href={`/projects/${projectId}/approvals/new`}
          className="btn btn-primary text-[12px] inline-block"
        >
          {t('po_wizard.create_approval')}
        </Link>
        <p className="text-[11px] text-ink-3 italic">{t('po_wizard.approval_r3_note')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-ink-3 leading-snug">{t('po_wizard.authorisation_helper')}</p>
      {approvals.map((a) => (
        <label
          key={a.id}
          className="flex items-center gap-2 cursor-pointer text-[13px] px-2 py-2 rounded border border-line hover:bg-bg"
        >
          <input
            type="radio"
            name="po-approval"
            checked={state.approvalReferenceId === a.id}
            onChange={() => update({ approvalReferenceId: a.id })}
          />
          <span className="ref">{a.reference}</span>
          <span className="flex-1">{a.subject}</span>
        </label>
      ))}
      <p className="text-[11px] text-ink-3 italic mt-2">{t('po_wizard.approval_r3_note')}</p>
    </div>
  );
}

function ReviewStep({
  state,
  update,
  candidates,
  approvals
}: {
  state: State;
  update: (p: Partial<State>) => void;
  candidates: CandidateVendor[];
  approvals: CandidateApproval[];
}) {
  const t = useTranslations();
  const vendor = candidates.find((v) => v.id === state.vendorId);
  const approval = approvals.find((a) => a.id === state.approvalReferenceId);
  const subtotal = vendor
    ? vendor.items.reduce(
        (s, i) => s + parseFloat(i.unitCost) * parseFloat(i.quantity || '1'),
        0
      )
    : 0;
  const total = subtotal * 1.25;
  const currency = vendor?.items[0]?.currency ?? state.currency;

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3 leading-snug">{t('po_wizard.review_helper')}</p>

      <div className="border border-line rounded-md p-3 text-[13px] space-y-2">
        <Row label={t('po.vendor')} value={vendor?.name ?? '—'} />
        <Row
          label={t('po.lines_header')}
          value={`${vendor?.items.length ?? 0} ${t('po.lines')}`}
        />
        <Row label={t('po.total_gross')} value={formatMoney(total.toFixed(2), currency)} />
        <Row label={t('po.delivery_address')} value={state.deliveryAddress || '—'} />
        {state.deliveryDeadline && (
          <Row label={t('po.delivery_deadline')} value={state.deliveryDeadline} />
        )}
        {state.freightTerms && (
          <Row label={t('po.freight_terms')} value={state.freightTerms} />
        )}
        <Row
          label={t('po.freight_party')}
          value={t(`po.freight_${state.freightResponsibleParty}`)}
        />
        <Row
          label={t('po.authorising_approval')}
          value={approval ? `${approval.reference} — ${approval.subject}` : '—'}
        />
      </div>

      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('po.notes')}</label>
        <textarea
          value={state.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>

      <div className="border border-line-strong bg-bg rounded-md p-3 text-[12px] text-ink-2 leading-snug">
        <strong className="text-ink">{t('po_wizard.draft_only_label')}</strong>{' '}
        {t('po_wizard.draft_only_body')}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-1 border-b border-line last:border-0">
      <span className="text-ink-3 text-[12px]">{label}</span>
      <span className="text-ink whitespace-pre-wrap">{value || '—'}</span>
    </div>
  );
}

/* ─── Wizard wrapper ──────────────────────────────────────────── */

export function PoWizard({
  open,
  onClose,
  projectId,
  projectRef,
  defaultSiteAddress,
  candidates,
  approvals
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectRef: string;
  defaultSiteAddress: string | null;
  candidates: CandidateVendor[];
  approvals: CandidateApproval[];
}) {
  const router = useRouter();
  const initial = useMemo(() => freshState(defaultSiteAddress), [defaultSiteAddress]);

  const steps: WizardStepDef<State>[] = [
    {
      id: 'vendor',
      titleKey: 'po_wizard.step_vendor',
      isValid: (s) => !!s.vendorId,
      Component: (props) => <VendorStep {...props} candidates={candidates} />
    },
    {
      id: 'lines',
      titleKey: 'po_wizard.step_lines',
      isValid: (s) => !!s.vendorId,
      Component: (props) => <LinesStep {...props} candidates={candidates} />
    },
    {
      id: 'delivery',
      titleKey: 'po_wizard.step_delivery',
      isValid: () => true,
      Component: DeliveryStep
    },
    {
      id: 'authorisation',
      titleKey: 'po_wizard.step_authorisation',
      // R3 gate: must pick an authorising approval to advance from this step.
      isValid: (s) => !!s.approvalReferenceId,
      Component: (props) => (
        <AuthorisationStep {...props} approvals={approvals} projectId={projectId} />
      )
    },
    {
      id: 'review',
      titleKey: 'po_wizard.step_review',
      isValid: (s) => !!s.vendorId && !!s.approvalReferenceId,
      Component: (props) => (
        <ReviewStep {...props} candidates={candidates} approvals={approvals} />
      )
    }
  ];

  return (
    <Wizard<State>
      open={open}
      onClose={onClose}
      titleKey="po_wizard.title"
      initialState={initial}
      steps={steps}
      flatFormHref={`/projects/${projectId}/pos/new`}
      submitLabelKey="po_wizard.submit"
      onSubmit={async (state) => {
        const fd = new FormData();
        fd.set('vendorId', state.vendorId);
        fd.set('currency', state.currency);
        if (state.deliveryAddress) fd.set('deliveryAddress', state.deliveryAddress);
        if (state.deliveryDeadline) fd.set('deliveryDeadline', state.deliveryDeadline);
        if (state.deliveryInstructions)
          fd.set('deliveryInstructions', state.deliveryInstructions);
        if (state.freightTerms) fd.set('freightTerms', state.freightTerms);
        fd.set('freightResponsibleParty', state.freightResponsibleParty);
        if (state.customsRequirements) fd.set('customsRequirements', state.customsRequirements);
        fd.set('approvalReferenceId', state.approvalReferenceId);
        if (state.notes) fd.set('notes', state.notes);
        if (state.terms) fd.set('terms', state.terms);

        const res = await createPoDraftAtomic(projectId, projectRef, fd);
        if (res.ok && res.poId) {
          router.push(`/projects/${projectId}/pos/${res.poId}`);
          return { ok: true };
        }
        return { ok: false, error: res.ok ? undefined : res.error };
      }}
    />
  );
}
