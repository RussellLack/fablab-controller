'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createInvoice } from '@/server/actions/finance';
import { cx, formatMoney } from '@/lib/utils';

type Po = { id: string; reference: string; subtotalNet: string; totalGross: string; currency: string };

type Line = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  purchaseOrderId?: string;
  milestoneType?: string;
};

export function NewInvoiceForm({
  projectId, projectRef, clientName, paymentTermsDays, defaultCurrency, availablePos
}: {
  projectId: string; projectRef: string; clientName: string | null;
  paymentTermsDays: number; defaultCurrency: string; availablePos: Po[];
}) {
  const t = useTranslations();
  const bound = createInvoice.bind(null, projectId, projectRef);
  const [state, action, pending] = useActionState(bound, null);
  const [lines, setLines] = useState<Line[]>([
    { id: '0', description: t('invoice.retainer_default'), quantity: '1', unitPrice: '' }
  ]);

  function addLineFromPo(po: Po) {
    setLines(curr => [...curr, {
      id: String(curr.length),
      description: `Procurement deposit — ${po.reference}`,
      quantity: '1',
      unitPrice: (parseFloat(po.subtotalNet) * 0.5).toFixed(2),     // 50% deposit by convention
      purchaseOrderId: po.id,
      milestoneType: 'procurement_deposit'
    }]);
  }

  function addBlankLine() {
    setLines(curr => [...curr, { id: String(curr.length), description: '', quantity: '1', unitPrice: '' }]);
  }

  function removeLine(id: string) {
    setLines(curr => curr.filter(l => l.id !== id));
  }

  const subtotal = lines.reduce((s, l) =>
    s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const vatAmount = subtotal * 0.25;
  const totalGross = subtotal + vatAmount;

  return (
    <form action={action} className="space-y-4 max-w-4xl">
      {state && !state.ok && <div className="card bg-danger-soft border-danger text-danger text-[13px]">{state.error}</div>}

      <div className="card space-y-3">
        <h3 className="card-title">{t('invoice.section_meta')}</h3>
        <Row label={t('invoice.client')}>
          <input value={clientName ?? ''} readOnly className="w-full px-2.5 py-2 border border-line rounded-md text-[13px] bg-bg" />
        </Row>
        <Row label={t('invoice.currency')}>
          <select name="currency" required defaultValue={defaultCurrency} className="w-32 px-2.5 py-2 border border-line rounded-md text-[13px]">
            {['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'].map(c => <option key={c}>{c}</option>)}
          </select>
        </Row>
        <Row label={t('invoice.issue_date')}>
          <input name="issueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-48 px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('invoice.due_date')}>
          <input name="dueDate" type="date" className="w-48 px-2.5 py-2 border border-line rounded-md text-[13px]"
            defaultValue={new Date(Date.now() + paymentTermsDays * 86400000).toISOString().slice(0, 10)} />
          <div className="text-[11px] text-ink-3 mt-1">{t('invoice.due_helper', { days: paymentTermsDays })}</div>
        </Row>
        <Row label={t('invoice.vat_rate')}>
          <input name="vatRate" type="number" step="0.01" min="0" max="100" defaultValue="25" className="w-32 px-2.5 py-2 border border-line rounded-md text-[13px]" />
          <span className="text-[12px] text-ink-3 ml-2">%</span>
        </Row>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <h3 className="card-title">{t('invoice.lines_section')}</h3>
          <div className="flex gap-1.5">
            <button type="button" onClick={addBlankLine} className="btn btn-ghost text-[12px]">{t('action.add_line')}</button>
          </div>
        </div>

        {availablePos.length > 0 && (
          <div className="mb-3 p-2 bg-bg rounded border border-line">
            <div className="text-[12px] text-ink-2 mb-1.5">{t('invoice.from_po')}</div>
            <div className="flex flex-wrap gap-1.5">
              {availablePos.map(po => (
                <button key={po.id} type="button" onClick={() => addLineFromPo(po)}
                  className="text-[11px] px-2 py-1 border border-line rounded hover:bg-surface">
                  {po.reference} ({formatMoney(po.subtotalNet, po.currency)})
                </button>
              ))}
            </div>
          </div>
        )}

        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
              <th className="py-2 w-12"></th>
              <th className="py-2">{t('invoice.line_description')}</th>
              <th className="py-2 w-20 text-right">{t('invoice.line_qty')}</th>
              <th className="py-2 w-32 text-right">{t('invoice.line_unit')}</th>
              <th className="py-2 w-32 text-right">{t('invoice.line_total')}</th>
              <th className="py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const lineTotal = (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
              return (
                <tr key={line.id} className="border-b border-line">
                  <td className="py-2 text-ink-3 text-[12px]">{idx + 1}</td>
                  <td className="py-2 pr-2">
                    <input name={`line[${idx}][description]`} required value={line.description}
                      onChange={e => setLines(c => c.map(l => l.id === line.id ? { ...l, description: e.target.value } : l))}
                      className="w-full px-2 py-1.5 border border-line rounded text-[13px]" />
                    {line.purchaseOrderId && <input type="hidden" name={`line[${idx}][purchaseOrderId]`} value={line.purchaseOrderId} />}
                    {line.milestoneType && <input type="hidden" name={`line[${idx}][milestoneType]`} value={line.milestoneType} />}
                  </td>
                  <td className="py-2 pr-2">
                    <input name={`line[${idx}][quantity]`} type="number" step="0.01" min="0.01" required value={line.quantity}
                      onChange={e => setLines(c => c.map(l => l.id === line.id ? { ...l, quantity: e.target.value } : l))}
                      className="w-full px-2 py-1.5 border border-line rounded text-[13px] text-right" />
                  </td>
                  <td className="py-2 pr-2">
                    <input name={`line[${idx}][unitPrice]`} type="number" step="0.01" min="0" required value={line.unitPrice}
                      onChange={e => setLines(c => c.map(l => l.id === line.id ? { ...l, unitPrice: e.target.value } : l))}
                      className="w-full px-2 py-1.5 border border-line rounded text-[13px] text-right" />
                  </td>
                  <td className="py-2 text-right font-mono">{lineTotal.toFixed(2)}</td>
                  <td className="py-2">
                    <button type="button" onClick={() => removeLine(line.id)}
                      className="text-ink-3 hover:text-danger text-[16px] leading-none" disabled={lines.length === 1}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-semibold">
              <td colSpan={4} className="pt-2.5 pr-2 text-right">{t('invoice.subtotal_net')}</td>
              <td className="pt-2.5 text-right font-mono">{subtotal.toFixed(2)}</td>
              <td></td>
            </tr>
            <tr className="text-ink-2">
              <td colSpan={4} className="pr-2 text-right">{t('invoice.vat_25')}</td>
              <td className="text-right font-mono">{vatAmount.toFixed(2)}</td>
              <td></td>
            </tr>
            <tr className="font-semibold text-[15px]">
              <td colSpan={4} className="pr-2 text-right">{t('invoice.total_gross')}</td>
              <td className="text-right font-mono">{totalGross.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card">
        <Row label={t('invoice.notes')}>
          <textarea name="notes" rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('invoice.terms')}>
          <textarea name="terms" rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
            placeholder={t('invoice.terms_placeholder')} />
        </Row>
      </div>

      <div className="flex justify-end gap-2">
        <button type="submit" disabled={pending} className={cx('btn btn-primary', pending && 'opacity-60')}>
          {pending ? t('action.saving') : t('action.create_invoice_draft')}
        </button>
      </div>
      <p className="text-[12px] text-ink-3">{t('invoice.new_footer')}</p>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-start mb-3 last:mb-0">
      <label className="text-[13px] text-ink-2 pt-2">{label}</label>
      <div>{children}</div>
    </div>
  );
}
