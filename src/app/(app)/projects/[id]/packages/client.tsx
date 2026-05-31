'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createPackage } from '@/server/actions/procurement';
import { cx, formatMoney } from '@/lib/utils';
import { ItemWizard } from '@/components/wizard/item-wizard';

type Pkg = { id: string; name: string; kind: string; sequence: number; status: string; budget: string | null };
type Item = { id: string; name: string; packageId: string; quantity: string; unit: string; status: string; itemType: string; costState: string };

export function PackagesClient({ projectId, packages, items }: { projectId: string; packages: Pkg[]; items: Item[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [wizardPkg, setWizardPkg] = useState<string | null | undefined>(undefined);
  // undefined = wizard closed, null = open with no preselection, string = open with package preselected
  const bound = createPackage.bind(null, projectId);
  const [state, action, pending] = useActionState(bound, null);

  const wizardOpen = wizardPkg !== undefined;
  const onWizardSuccess = () => router.refresh();

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-ink-2 text-[13px]">{packages.length} {t('package.count_suffix')}</p>
        <div className="flex gap-2">
          {packages.length > 0 && (
            <button
              onClick={() => setWizardPkg(null)}
              className="btn btn-primary"
            >
              {t('action.new_item_guided')}
            </button>
          )}
          {!adding && <button onClick={() => setAdding(true)} className="btn btn-ghost">{t('action.new_package')}</button>}
        </div>
      </div>

      {adding && (
        <form action={action} className="card mb-4">
          <h3 className="card-title mb-3">{t('package.new')}</h3>
          {state && !state.ok && <div className="text-danger text-[12px] mb-2">{state.error}</div>}
          <div className="grid grid-cols-[180px_1fr] gap-3 items-center">
            <label className="text-[13px] text-ink-2">{t('package.name')}*</label>
            <input name="name" required placeholder={t('package.name_placeholder')} className="px-2.5 py-2 border border-line rounded-md text-[13px]" />
            <label className="text-[13px] text-ink-2">{t('package.kind_label')}*</label>
            <select name="kind" required defaultValue="category" className="px-2.5 py-2 border border-line rounded-md text-[13px] w-48">
              <option value="room">{t('package.kind.room')}</option>
              <option value="category">{t('package.kind.category')}</option>
              <option value="trade">{t('package.kind.trade')}</option>
              <option value="phase">{t('package.kind.phase')}</option>
            </select>
            <label className="text-[13px] text-ink-2">{t('package.budget')}</label>
            <input name="budget" type="number" step="1000" className="px-2.5 py-2 border border-line rounded-md text-[13px] w-48" />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost">{t('action.cancel')}</button>
            <button type="submit" disabled={pending} className={cx('btn btn-primary', pending && 'opacity-60')}>
              {pending ? t('action.saving') : t('action.create')}
            </button>
          </div>
        </form>
      )}

      {packages.length === 0 && !adding ? (
        <div className="card text-ink-2 text-[13px]">{t('package.empty')}</div>
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => {
            const pkgItems = items.filter(i => i.packageId === pkg.id);
            return (
              <div key={pkg.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-[15px]">{pkg.name}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      {t(`package.kind.${pkg.kind}`)} · {pkgItems.length} items
                      {pkg.budget && ` · ${formatMoney(pkg.budget, 'NOK')}`}
                    </div>
                  </div>
                  <button
                    onClick={() => setWizardPkg(pkg.id)}
                    className="btn btn-ghost text-[12px]"
                  >
                    {t('action.new_item')}
                  </button>
                </div>

                {pkgItems.length > 0 && (
                  <table className="w-full mt-3 text-[13px] border-t border-line">
                    <tbody>
                      {pkgItems.map(item => (
                        <tr key={item.id} className="border-b border-line last:border-0">
                          <td className="py-2">
                            <Link href={`/projects/${projectId}/items/${item.id}`} className="font-medium hover:underline">{item.name}</Link>
                          </td>
                          <td className="py-2 text-ink-2">{item.quantity} {item.unit}</td>
                          <td className="py-2">
                            <span className="inline-block text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
                              {t(`item.type.${item.itemType}`)}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-info-soft text-info">
                              {t(`item.status.${item.status}`)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ItemWizard
        open={wizardOpen}
        onClose={() => setWizardPkg(undefined)}
        projectId={projectId}
        packages={packages.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
        preselectedPackageId={wizardPkg ?? undefined}
        onSuccess={onWizardSuccess}
      />
    </>
  );
}
