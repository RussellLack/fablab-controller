'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createItem } from '@/server/actions/procurement';
import { cx } from '@/lib/utils';

export function ItemForm({ projectId, packages, defaultPackageId }: {
  projectId: string;
  packages: { id: string; name: string }[];
  defaultPackageId?: string;
}) {
  const t = useTranslations();
  const bound = createItem.bind(null, projectId);
  const [state, action, pending] = useActionState(bound, null);

  return (
    <form action={action} className="max-w-2xl card space-y-3">
      {state && !state.ok && <div className="text-danger text-[13px]">{state.error}</div>}
      <Row label={t('item.package')} required>
        <select name="packageId" required defaultValue={defaultPackageId ?? ''} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]">
          <option value="" disabled>—</option>
          {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Row>
      <Row label={t('item.name')} required>
        <input name="name" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.description')}>
        <textarea name="description" rows={3} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.type_label')} required>
        <select name="itemType" required defaultValue="sourced" className="px-2.5 py-2 border border-line rounded-md text-[13px] w-48">
          <option value="sourced">{t('item.type.sourced')}</option>
          <option value="bespoke">{t('item.type.bespoke')}</option>
        </select>
      </Row>
      <Row label={t('item.category')} required>
        <input name="category" required placeholder="ffe / lighting / art / textiles…" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.subcategory')}>
        <input name="subcategory" placeholder="lounge_chair / track_spotlight / …" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.quantity')} required>
        <div className="flex gap-2 w-48">
          <input name="quantity" type="number" step="0.01" min="0.01" required className="flex-1 px-2.5 py-2 border border-line rounded-md text-[13px]" />
          <select name="unit" required defaultValue="each" className="flex-1 px-2.5 py-2 border border-line rounded-md text-[13px]">
            <option value="each">each</option>
            <option value="set">set</option>
            <option value="m">m</option>
            <option value="m²">m²</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </Row>
      <Row label={t('item.manufacturer')}>
        <input name="manufacturer" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.sku')}>
        <input name="sku" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.country_of_origin')}>
        <input name="countryOfOrigin" maxLength={2} placeholder="DE" className="w-24 px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.hs_code')}>
        <input name="hsCode" placeholder="9405.10" className="w-32 px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <Row label={t('item.notes')}>
        <textarea name="notes" rows={2} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
      </Row>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={cx('btn btn-primary', pending && 'opacity-60')}>
          {pending ? t('action.saving') : t('action.create_item')}
        </button>
      </div>
    </form>
  );
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 items-start">
      <label className="text-[13px] text-ink-2 pt-2">{label}{required && '*'}</label>
      <div>{children}</div>
    </div>
  );
}
