'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createRfq } from '@/server/actions/procurement';
import { cx } from '@/lib/utils';

type Item = { id: string; name: string; packageId: string; packageName: string; quantity: string; unit: string; itemType: string };
type Vendor = { id: string; name: string; kind: string };

export function RfqBuilderForm({ projectId, projectRef, items, vendors }: {
  projectId: string; projectRef: string; items: Item[]; vendors: Vendor[];
}) {
  const t = useTranslations();
  const bound = createRfq.bind(null, projectId, projectRef);
  const [state, action, pending] = useActionState(bound, null);

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      {state && !state.ok && <div className="card bg-danger-soft border-danger text-danger text-[13px]">{state.error}</div>}

      <div className="card bg-info-soft border-info text-info text-[13px]">
        <strong className="block mb-1">⚠ {t('rfq.banner_label')}</strong>
        {t('rfq.banner_body')}
      </div>

      <div className="card space-y-3">
        <h3 className="card-title">{t('rfq.section_meta')}</h3>
        <Row label={t('rfq.title')} required>
          <input name="title" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('rfq.description')}>
          <textarea name="description" rows={3} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('rfq.deadline')} required>
          <input name="responseDeadline" type="date" required className="px-2.5 py-2 border border-line rounded-md text-[13px] w-48" />
        </Row>
      </div>

      <div className="card">
        <h3 className="card-title mb-3">{t('rfq.section_items')}</h3>
        {items.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t('rfq.no_items')}</p>
        ) : (
          <div className="space-y-1.5">
            {items.map(i => (
              <label key={i.id} className="flex items-center gap-3 text-[13px] py-1.5 px-2 hover:bg-bg rounded">
                <input type="checkbox" name="itemIds" value={i.id} className="w-4 h-4" />
                <span className="flex-1">
                  <span className="font-medium">{i.name}</span>
                  <span className="text-ink-3"> · {i.quantity} {i.unit} · {i.packageName}</span>
                </span>
                <span className="text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
                  {t(`item.type.${i.itemType}`)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title mb-3">{t('rfq.section_vendors')}</h3>
        {vendors.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t('rfq.no_vendors')}</p>
        ) : (
          <div className="space-y-1.5">
            {vendors.map(v => (
              <label key={v.id} className="flex items-center gap-3 text-[13px] py-1.5 px-2 hover:bg-bg rounded">
                <input type="checkbox" name="vendorIds" value={v.id} className="w-4 h-4" />
                <span className="flex-1 font-medium">{v.name}</span>
                <span className="text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
                  {t(`vendor.kind.${v.kind}`)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="submit" disabled={pending} className={cx('btn btn-primary', pending && 'opacity-60')}>
          {pending ? t('action.saving') : t('action.save_as_draft')}
        </button>
      </div>
      <p className="text-ink-3 text-xs">{t('rfq.new_footer')}</p>
    </form>
  );
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
      <label className="text-[13px] text-ink-2">{label}{required && '*'}</label>
      <div>{children}</div>
    </div>
  );
}
