'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createPoDraft } from '@/server/actions/procurement';
import { cx } from '@/lib/utils';

type VendorOpt = { id: string; name: string; item_count: number };
type ApprovalOpt = { id: string; reference: string; subject: string };

export function NewPoForm({ projectId, projectRef, siteAddress, vendors, approvals }: {
  projectId: string;
  projectRef: string;
  siteAddress: string | null;
  vendors: VendorOpt[];
  approvals: ApprovalOpt[];
}) {
  const t = useTranslations();
  const bound = createPoDraft.bind(null, projectId, projectRef);
  const [state, action, pending] = useActionState(bound, null);

  if (vendors.length === 0) {
    return (
      <div className="card bg-warn-soft border-warn text-warn text-[13px]">
        <strong className="block mb-1">{t('po.no_candidates_title')}</strong>
        {t('po.no_candidates_body')}
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-3 max-w-2xl">
      {state && !state.ok && <div className="text-danger text-[13px]">{state.error}</div>}

      <Row label={t('po.vendor')} required>
        <select name="vendorId" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]">
          <option value="" disabled>—</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.item_count} items)</option>)}
        </select>
      </Row>
      <Row label={t('po.currency')} required>
        <select name="currency" required defaultValue="NOK" className="w-32 px-2.5 py-2 border border-line rounded-md text-[13px]">
          {['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'].map(c => <option key={c}>{c}</option>)}
        </select>
      </Row>
      <Row label={t('po.delivery_address')}>
        <textarea name="deliveryAddress" defaultValue={siteAddress ?? ''} rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('po.delivery_deadline')}>
        <input name="deliveryDeadline" type="date" className="w-48 px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('po.delivery_instructions')}>
        <textarea name="deliveryInstructions" rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('po.freight_terms')}>
        <input name="freightTerms" placeholder="DDP Tromsø / FOB Hamburg / …" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('po.freight_party')}>
        <select name="freightResponsibleParty" defaultValue="vendor" className="w-48 px-2.5 py-2 border border-line rounded-md text-[13px]">
          <option value="vendor">{t('po.freight_vendor')}</option>
          <option value="fablab">{t('po.freight_fablab')}</option>
          <option value="freight_forwarder">{t('po.freight_forwarder')}</option>
        </select>
      </Row>
      <Row label={t('po.customs_requirements')}>
        <textarea name="customsRequirements" rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('po.authorising_approval')}>
        <select name="approvalReferenceId" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]">
          <option value="">{t('po.no_approval_yet')}</option>
          {approvals.map(a => <option key={a.id} value={a.id}>{a.reference} — {a.subject}</option>)}
        </select>
        <div className="text-[11px] text-ink-3 mt-1">{t('po.authorising_approval_helper')}</div>
      </Row>
      <Row label={t('po.terms')}>
        <textarea name="terms" rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('po.notes')}>
        <textarea name="notes" rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={cx('btn btn-primary', pending && 'opacity-60')}>
          {pending ? t('action.saving') : t('action.create_po_draft')}
        </button>
      </div>
      <p className="text-[12px] text-ink-3">{t('po.new_footer')}</p>
    </form>
  );
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
      <label className="text-[13px] text-ink-2 pt-2">{label}{required && '*'}</label>
      <div>{children}</div>
    </div>
  );
}
