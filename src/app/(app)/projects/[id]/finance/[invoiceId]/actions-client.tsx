'use client';

import { useActionState, useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { issueInvoice, markInvoiceSent, voidInvoice, recordPayment } from '@/server/actions/finance';
import { cx } from '@/lib/utils';

export function InvoiceActions({
  invoiceId, projectId, status, balanceDue, currency
}: {
  invoiceId: string; projectId: string; status: string; balanceDue: string; currency: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startAction] = useTransition();
  const [showRecord, setShowRecord] = useState(false);
  const recBound = recordPayment.bind(null, invoiceId, projectId);
  const [recState, recAction, recPending] = useActionState(recBound, null);

  function run(fn: () => Promise<unknown>) {
    startAction(async () => { await fn(); router.refresh(); });
  }

  if (status === 'draft') {
    return (
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => run(() => voidInvoice(invoiceId, projectId))} className="btn">
          {t('action.void')}
        </button>
        <button disabled={pending} onClick={() => run(() => issueInvoice(invoiceId, projectId))} className="btn btn-primary">
          {pending ? t('action.issuing') : t('action.issue_invoice')}
        </button>
      </div>
    );
  }

  if (status === 'issued') {
    return (
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => run(() => markInvoiceSent(invoiceId, projectId))} className="btn">
          {t('action.mark_sent')}
        </button>
        <RecordPaymentTrigger show={showRecord} setShow={setShowRecord} balanceDue={balanceDue} currency={currency} action={recAction} state={recState} pending={recPending} />
      </div>
    );
  }

  if (status === 'sent' || status === 'partially_paid') {
    return <RecordPaymentTrigger show={showRecord} setShow={setShowRecord} balanceDue={balanceDue} currency={currency} action={recAction} state={recState} pending={recPending} />;
  }

  return null;
}

function RecordPaymentTrigger({
  show, setShow, balanceDue, currency, action, state, pending
}: {
  show: boolean; setShow: (b: boolean) => void;
  balanceDue: string; currency: string;
  action: (formData: FormData) => void;
  state: { ok: boolean; error?: string } | null;
  pending: boolean;
}) {
  const t = useTranslations();
  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="btn btn-primary">
        {t('action.record_payment')}
      </button>
    );
  }
  return (
    <div className="card bg-info-soft border-info p-3 min-w-[360px]">
      <form action={action} className="space-y-2">
        {state && !state.ok && <div className="text-[12px] text-danger">{state.error}</div>}
        <div className="grid grid-cols-[110px_1fr] gap-2 items-center text-[13px]">
          <label className="text-info">{t('invoice.amount')}</label>
          <input name="amount" type="number" step="0.01" min="0.01" required defaultValue={balanceDue}
            className="px-2 py-1.5 border border-line rounded-md" />
          <label className="text-info">{t('invoice.currency')}</label>
          <select name="currency" required defaultValue={currency} className="px-2 py-1.5 border border-line rounded-md">
            {['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'].map(c => <option key={c}>{c}</option>)}
          </select>
          <label className="text-info">{t('invoice.received_date')}</label>
          <input name="receivedDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="px-2 py-1.5 border border-line rounded-md" />
          <label className="text-info">{t('invoice.payment_method')}</label>
          <select name="method" required defaultValue="bank_transfer" className="px-2 py-1.5 border border-line rounded-md">
            <option value="bank_transfer">{t('invoice.method.bank_transfer')}</option>
            <option value="card">{t('invoice.method.card')}</option>
            <option value="cheque">{t('invoice.method.cheque')}</option>
            <option value="cash">{t('invoice.method.cash')}</option>
            <option value="credit_note">{t('invoice.method.credit_note')}</option>
            <option value="other">{t('invoice.method.other')}</option>
          </select>
          <label className="text-info">{t('invoice.bank_ref')}</label>
          <input name="bankReference" className="px-2 py-1.5 border border-line rounded-md" />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={() => setShow(false)} className="btn btn-ghost">{t('action.cancel')}</button>
          <button type="submit" disabled={pending} className={cx('btn btn-primary', pending && 'opacity-60')}>
            {pending ? t('action.saving') : t('action.log_payment')}
          </button>
        </div>
      </form>
    </div>
  );
}
