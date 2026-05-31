'use client';

import { useActionState, useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sendRfqViaGmail, recordQuote, selectWinningQuote } from '@/server/actions/procurement';
import { formatMoney, formatDate, cx } from '@/lib/utils';
import { BindingBadge } from '@/components/binding-badge';

type Item = { id: string; name: string; quantity: string; unit: string; winningQuoteId: string | null };
type Vendor = { id: string; name: string };
type Quote = {
  id: string; rfqId: string; itemId: string; vendorId: string;
  status: string; unitCost: string | null; quotedQuantity: string | null;
  lineTotal: string | null; currency: string | null; leadTimeDays: number | null;
  validUntil: string | null; receivedAt: string | null;
};

export function RfqDetailClient({ projectId, rfq, items, vendors, quotes }: {
  projectId: string;
  rfq: { id: string; reference: string; title: string; status: string; sentAt: Date | null; responseDeadline: string | null };
  items: Item[]; vendors: Vendor[]; quotes: Quote[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [sending, startSend] = useTransition();
  const [sendResult, setSendResult] = useState<null | {
    ok: boolean;
    sent?: number;
    failed?: number;
    error?: string;
    errors?: { vendorId: string; vendor: string; error: string }[];
  }>(null);

  const isDraft = rfq.status === 'draft';
  const isSent = rfq.status !== 'draft' && rfq.status !== 'cancelled';

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{rfq.reference}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-info-soft text-info">{t(`rfq.status.${rfq.status}`)}</span>
            <BindingBadge state="not-an-order" />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{rfq.title}</h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {items.length} {t('rfq.items_count')} · {vendors.length} {t('rfq.vendors_count')}
            {rfq.responseDeadline && ` · ${t('rfq.deadline_label')} ${formatDate(rfq.responseDeadline)}`}
          </p>
        </div>
        {isDraft && (
          <button
            className="btn btn-primary"
            disabled={sending}
            onClick={() => startSend(async () => {
              const res = await sendRfqViaGmail(rfq.id, projectId);
              setSendResult(
                'sent' in res
                  ? {
                      ok: res.ok,
                      sent: res.sent,
                      failed: res.failed,
                      error: res.ok ? undefined : res.error,
                      errors: res.errors
                    }
                  : { ok: false, error: res.ok ? undefined : res.error }
              );
              router.refresh();
            })}
          >
            {sending ? t('action.sending') : t('action.send_via_gmail')}
          </button>
        )}
      </div>

      {sendResult && (
        <div
          className={cx(
            'border rounded-lg px-3.5 py-2.5 mb-4 text-[13px]',
            sendResult.ok
              ? 'bg-ok-soft border-ok text-ok'
              : 'bg-warn-soft border-warn text-warn'
          )}
        >
          <div className="font-semibold flex items-center justify-between gap-2">
            <span>
              {sendResult.ok
                ? t('rfq.send_result_ok', { count: sendResult.sent ?? 0 })
                : t('rfq.send_result_partial', {
                    sent: sendResult.sent ?? 0,
                    failed: sendResult.failed ?? 0
                  })}
            </span>
            {sendResult.errors && sendResult.errors.length > 0 && !sending && (
              <button
                className="btn btn-ghost text-[12px]"
                disabled={sending}
                onClick={() => {
                  const failedIds = sendResult.errors?.map((e) => e.vendorId) ?? [];
                  startSend(async () => {
                    const res = await sendRfqViaGmail(rfq.id, projectId, failedIds);
                    setSendResult(
                      'sent' in res
                        ? {
                            ok: res.ok,
                            sent: res.sent,
                            failed: res.failed,
                            error: res.ok ? undefined : res.error,
                            errors: res.errors
                          }
                        : { ok: false, error: res.ok ? undefined : res.error }
                    );
                    router.refresh();
                  });
                }}
              >
                {t('rfq.send_retry_failed')}
              </button>
            )}
          </div>
          {sendResult.error && !sendResult.errors && (
            <div className="mt-1 text-[12px]">{sendResult.error}</div>
          )}
          {sendResult.errors && sendResult.errors.length > 0 && (
            <ul className="mt-1 text-[12px] list-disc list-inside space-y-0.5">
              {sendResult.errors.map((e, i) => (
                <li key={i}>
                  <strong>{e.vendor}:</strong> {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isSent && items.map(item => (
        <ItemQuotesBlock
          key={item.id}
          projectId={projectId}
          rfqId={rfq.id}
          item={item}
          vendors={vendors}
          quotes={quotes.filter(q => q.itemId === item.id)}
        />
      ))}

      {isDraft && (
        <div className="card text-ink-2 text-[13px]">
          {t('rfq.draft_helper')}
          <div className="mt-3">
            <strong className="text-[12px]">{t('rfq.items_in_rfq')}</strong>
            <ul className="text-[13px] mt-1.5">
              {items.map(i => <li key={i.id}>• {i.name} ({i.quantity} {i.unit})</li>)}
            </ul>
            <strong className="text-[12px] block mt-3">{t('rfq.vendors_invited')}</strong>
            <ul className="text-[13px] mt-1.5">
              {vendors.map(v => <li key={v.id}>• {v.name}</li>)}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function ItemQuotesBlock({ projectId, rfqId, item, vendors, quotes }: {
  projectId: string; rfqId: string; item: Item; vendors: Vendor[]; quotes: Quote[];
}) {
  const t = useTranslations();
  return (
    <div className="card mb-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-[15px] font-semibold">{item.name}</h3>
          <p className="text-ink-3 text-[12px]">{item.quantity} {item.unit}</p>
        </div>
        {item.winningQuoteId && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-ok-soft text-ok">
            {t('rfq.winner_selected')}
          </span>
        )}
      </div>

      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <th className="text-left py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.vendor')}</th>
            <th className="text-right py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.unit')}</th>
            <th className="text-right py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.lead')}</th>
            <th className="text-right py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.valid')}</th>
            <th className="text-left py-2 text-[11px] uppercase tracking-wider text-ink-3">{t('quote.status_label')}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {vendors.map(v => {
            const q = quotes.find(x => x.vendorId === v.id);
            if (!q) return null;
            return (
              <QuoteRow
                key={q.id}
                projectId={projectId} rfqId={rfqId} item={item} vendor={v} quote={q}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuoteRow({ projectId, rfqId, item, vendor, quote }: {
  projectId: string; rfqId: string; item: Item; vendor: Vendor; quote: Quote;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [selecting, startSelect] = useTransition();
  const recBound = recordQuote.bind(null, projectId, rfqId);
  const [recState, recAction, recPending] = useActionState(recBound, null);

  const isWinner = quote.id === item.winningQuoteId;
  const isPending = quote.status === 'pending';
  const isReceived = quote.status === 'received';

  if (recording) {
    return (
      <tr>
        <td colSpan={6} className="py-3 bg-info-soft/30">
          <form action={recAction} className="grid grid-cols-[1fr_120px_100px_140px_120px_auto] gap-2 items-end">
            <input type="hidden" name="quoteId" value={quote.id} />
            <div className="text-[12px]"><strong>{vendor.name}</strong> · {item.name}</div>
            <Inp label={t('quote.unit')} required>
              <input name="unitCost" type="number" step="0.01" required className="w-full px-2 py-1.5 border border-line rounded text-[13px]" />
            </Inp>
            <Inp label={t('quote.qty')}>
              <input name="quotedQuantity" type="number" step="0.01" defaultValue={item.quantity} className="w-full px-2 py-1.5 border border-line rounded text-[13px]" />
            </Inp>
            <Inp label={t('quote.currency')}>
              <select name="currency" defaultValue="NOK" className="w-full px-2 py-1.5 border border-line rounded text-[13px]">
                {['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'].map(c => <option key={c}>{c}</option>)}
              </select>
            </Inp>
            <Inp label={t('quote.lead')}>
              <input name="leadTimeDays" type="number" min="0" className="w-full px-2 py-1.5 border border-line rounded text-[13px]" />
            </Inp>
            <div className="flex gap-1">
              <button type="button" onClick={() => setRecording(false)} className="btn btn-ghost text-[12px]">{t('action.cancel')}</button>
              <button type="submit" disabled={recPending} className={cx('btn btn-primary text-[12px]', recPending && 'opacity-60')}>
                {recPending ? '...' : t('action.save')}
              </button>
            </div>
            {recState && !recState.ok && <div className="col-span-6 text-danger text-[12px]">{recState.error}</div>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={cx('border-b border-line last:border-0', isWinner && 'bg-ok-soft/30')}>
      <td className="py-2">{vendor.name}</td>
      <td className="py-2 text-right">{quote.unitCost ? formatMoney(quote.unitCost, quote.currency ?? 'NOK') : <span className="muted">—</span>}</td>
      <td className="py-2 text-right text-ink-2">{quote.leadTimeDays ? `${quote.leadTimeDays} d` : '—'}</td>
      <td className="py-2 text-right text-ink-3">{formatDate(quote.validUntil)}</td>
      <td className="py-2">
        <div className="flex items-center gap-1.5">
          <span className={cx('text-[11px] px-2 py-0.5 rounded-full',
            quote.status === 'winning' ? 'bg-ok-soft text-ok' :
            quote.status === 'pending' ? 'bg-warn-soft text-warn' :
            quote.status === 'received' ? 'bg-info-soft text-info' :
            'bg-bg text-ink-3'
          )}>{t(`quote.status.${quote.status}`)}</span>
          {quote.status === 'winning' && (
            <span className="text-[10px] text-ink-3 italic">{t('binding.selected_not_ordered')}</span>
          )}
        </div>
      </td>
      <td className="py-2 text-right">
        {isPending && <button onClick={() => setRecording(true)} className="btn btn-ghost text-[12px]">{t('action.record_quote')}</button>}
        {isReceived && !isWinner && (
          <button
            onClick={() => startSelect(async () => {
              await selectWinningQuote(projectId, rfqId, item.id, quote.id);
              router.refresh();
            })}
            disabled={selecting}
            className="btn btn-primary text-[12px]"
          >
            {selecting ? '...' : t('action.select_winner')}
          </button>
        )}
        {isWinner && <span className="text-[11px] text-ok">✓ {t('rfq.winner_label')}</span>}
      </td>
    </tr>
  );
}

function Inp({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-ink-3">{label}{required && '*'}</label>
      {children}
    </div>
  );
}
