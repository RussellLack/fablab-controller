'use client';

import { useTranslations } from 'next-intl';
import { createPackage, createItem } from '@/server/actions/procurement';
import { Wizard, type WizardStepDef } from './wizard';

/**
 * Items + Packages wizard — W0 of 22-wizards.md.
 *
 * Guides the user through creating a single item, with optional inline
 * creation of a new package in step 1. Reuses the existing
 * `createPackage` and `createItem` server actions; the wizard is purely
 * a richer client wrapping the same payloads.
 *
 * Steps:
 *   1 — Where        pick existing package or create new inline
 *   2 — Identity     name, itemType, category, subcategory
 *   3 — Specification manufacturer, sku, description
 *   4 — Quantity     quantity, unit, countryOfOrigin, hsCode
 *   5 — Review       summary + Create / Create and add another
 */

export type ItemWizardPackage = {
  id: string;
  name: string;
  kind: string;
};

type State = {
  // Step 1
  mode: 'existing' | 'new';
  packageId: string;            // populated either way (existing id, or after new package created)
  newPackageName: string;
  newPackageKind: 'room' | 'category' | 'trade' | 'phase';
  newPackageBudget: string;     // empty string for unset

  // Step 2
  name: string;
  itemType: 'sourced' | 'bespoke';
  category: string;
  subcategory: string;

  // Step 3
  manufacturer: string;
  sku: string;
  description: string;

  // Step 4
  quantity: string;
  unit: string;
  countryOfOrigin: string;
  hsCode: string;

  // Notes
  notes: string;
};

function freshState(preselectedPackageId?: string): State {
  return {
    mode: preselectedPackageId ? 'existing' : 'existing',
    packageId: preselectedPackageId ?? '',
    newPackageName: '',
    newPackageKind: 'category',
    newPackageBudget: '',
    name: '',
    itemType: 'sourced',
    category: '',
    subcategory: '',
    manufacturer: '',
    sku: '',
    description: '',
    quantity: '1',
    unit: 'each',
    countryOfOrigin: '',
    hsCode: '',
    notes: ''
  };
}

/** Per-step components. State + update patcher injected by the Wizard shell. */

function WhereStep({
  state,
  update,
  packages
}: {
  state: State;
  update: (p: Partial<State>) => void;
  packages: ItemWizardPackage[];
}) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3">{t('items_wizard.where_helper')}</p>

      {packages.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-ink-3">
            {t('items_wizard.pick_package')}
          </label>
          {packages.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 cursor-pointer text-[13px] px-2 py-1.5 rounded hover:bg-bg"
            >
              <input
                type="radio"
                name="package-pick"
                checked={state.mode === 'existing' && state.packageId === p.id}
                onChange={() => update({ mode: 'existing', packageId: p.id })}
              />
              <span>{p.name}</span>
              <span className="text-[11px] text-ink-3 ml-auto">
                {t(`package.kind.${p.kind}`)}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="border-t border-line pt-3">
        <label className="flex items-center gap-2 cursor-pointer text-[13px] px-2 py-1.5 rounded hover:bg-bg">
          <input
            type="radio"
            name="package-pick"
            checked={state.mode === 'new'}
            onChange={() => update({ mode: 'new', packageId: '' })}
          />
          <span>{t('items_wizard.new_package')}</span>
        </label>

        {state.mode === 'new' && (
          <div className="mt-2 space-y-2.5 pl-6">
            <p className="text-[11px] text-ink-3 italic leading-snug">
              {t('package.intro')}
            </p>
            <div>
              <label className="text-[12px] text-ink-2 block mb-1">
                {t('package.name')} *
              </label>
              <input
                value={state.newPackageName}
                onChange={(e) => update({ newPackageName: e.target.value })}
                className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] text-ink-2 block mb-1">
                {t('package.kind_label')} *
              </label>
              <select
                value={state.newPackageKind}
                onChange={(e) =>
                  update({ newPackageKind: e.target.value as State['newPackageKind'] })
                }
                className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
              >
                <option value="room" title={t('package.kind_short.room')}>
                  {t('package.kind.room')} — {t('package.kind_short.room')}
                </option>
                <option value="category" title={t('package.kind_short.category')}>
                  {t('package.kind.category')} — {t('package.kind_short.category')}
                </option>
                <option value="trade" title={t('package.kind_short.trade')}>
                  {t('package.kind.trade')} — {t('package.kind_short.trade')}
                </option>
                <option value="phase" title={t('package.kind_short.phase')}>
                  {t('package.kind.phase')} — {t('package.kind_short.phase')}
                </option>
              </select>
              <p className="text-[11px] text-ink-3 italic mt-1 leading-snug">
                {t(`package.kind_help.${state.newPackageKind}`)}
              </p>
            </div>
            <div>
              <label className="text-[12px] text-ink-2 block mb-1">
                {t('package.budget')}
              </label>
              <input
                type="number"
                step="1000"
                value={state.newPackageBudget}
                onChange={(e) => update({ newPackageBudget: e.target.value })}
                className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IdentityStep({
  state,
  update
}: {
  state: State;
  update: (p: Partial<State>) => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.name')} *</label>
        <input
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
          autoFocus
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.type')} *</label>
        <select
          value={state.itemType}
          onChange={(e) => update({ itemType: e.target.value as State['itemType'] })}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        >
          <option value="sourced">{t('item.type.sourced')}</option>
          <option value="bespoke">{t('item.type.bespoke')}</option>
        </select>
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.category')} *</label>
        <input
          value={state.category}
          onChange={(e) => update({ category: e.target.value })}
          placeholder="ffe / lighting / art / textiles…"
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.subcategory')}</label>
        <input
          value={state.subcategory}
          onChange={(e) => update({ subcategory: e.target.value })}
          placeholder="lounge_chair / track_spotlight / …"
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
    </div>
  );
}

function SpecificationStep({
  state,
  update
}: {
  state: State;
  update: (p: Partial<State>) => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3">{t('items_wizard.specification_helper')}</p>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.manufacturer')}</label>
        <input
          value={state.manufacturer}
          onChange={(e) => update({ manufacturer: e.target.value })}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.sku')}</label>
        <input
          value={state.sku}
          onChange={(e) => update({ sku: e.target.value })}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.description')}</label>
        <textarea
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={3}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
    </div>
  );
}

function QuantityStep({
  state,
  update
}: {
  state: State;
  update: (p: Partial<State>) => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[12px] text-ink-2 block mb-1">{t('item.quantity')} *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={state.quantity}
            onChange={(e) => update({ quantity: e.target.value })}
            className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
          />
        </div>
        <div className="flex-1">
          <label className="text-[12px] text-ink-2 block mb-1">Unit *</label>
          <select
            value={state.unit}
            onChange={(e) => update({ unit: e.target.value })}
            className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
          >
            <option value="each">each</option>
            <option value="set">set</option>
            <option value="m">m</option>
            <option value="m²">m²</option>
            <option value="m³">m³</option>
            <option value="kg">kg</option>
            <option value="hour">hour</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.country_of_origin')}</label>
        <input
          value={state.countryOfOrigin}
          onChange={(e) => update({ countryOfOrigin: e.target.value })}
          maxLength={2}
          placeholder="DE"
          className="w-24 px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.hs_code')}</label>
        <input
          value={state.hsCode}
          onChange={(e) => update({ hsCode: e.target.value })}
          placeholder="9405.10"
          className="w-32 px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">{t('item.notes')}</label>
        <textarea
          value={state.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
    </div>
  );
}

function ReviewStep({
  state,
  packages
}: {
  state: State;
  update: (p: Partial<State>) => void;
  packages: ItemWizardPackage[];
}) {
  const t = useTranslations();
  const targetPackage =
    state.mode === 'new'
      ? `${state.newPackageName} (${t('items_wizard.new_package_suffix')})`
      : packages.find((p) => p.id === state.packageId)?.name ?? '—';

  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-[12px] text-ink-3 mb-3">{t('items_wizard.review_helper')}</p>
      <Row label={t('items_wizard.review_package')} value={targetPackage} />
      <Row label={t('item.name')} value={state.name} />
      <Row label={t('item.type')} value={t(`item.type.${state.itemType}`)} />
      <Row label={t('item.category')} value={state.category} />
      {state.subcategory && <Row label={t('item.subcategory')} value={state.subcategory} />}
      {state.manufacturer && <Row label={t('item.manufacturer')} value={state.manufacturer} />}
      {state.sku && <Row label={t('item.sku')} value={state.sku} />}
      <Row label={t('item.quantity')} value={`${state.quantity} ${state.unit}`} />
      {state.countryOfOrigin && <Row label={t('item.country_of_origin')} value={state.countryOfOrigin} />}
      {state.hsCode && <Row label={t('item.hs_code')} value={state.hsCode} />}
      {state.description && <Row label={t('item.description')} value={state.description} />}
      {state.notes && <Row label={t('item.notes')} value={state.notes} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1 border-b border-line last:border-0">
      <span className="text-ink-3 text-[12px]">{label}</span>
      <span className="text-ink">{value || '—'}</span>
    </div>
  );
}

/** Submit handler: optionally create the package, then create the item. */
async function submitItem(
  projectId: string,
  state: State
): Promise<{ ok: boolean; error?: string; createdPackageId?: string }> {
  let packageId = state.packageId;

  if (state.mode === 'new') {
    const pkgForm = new FormData();
    pkgForm.set('name', state.newPackageName);
    pkgForm.set('kind', state.newPackageKind);
    if (state.newPackageBudget) pkgForm.set('budget', state.newPackageBudget);
    const pkgRes = await createPackage(projectId, null, pkgForm);
    if (!pkgRes.ok) {
      return { ok: false, error: `Package: ${pkgRes.error ?? 'unknown error'}` };
    }
    packageId = pkgRes.id ?? '';
  }

  if (!packageId) {
    return { ok: false, error: 'No package selected' };
  }

  const itemForm = new FormData();
  itemForm.set('packageId', packageId);
  itemForm.set('name', state.name);
  itemForm.set('itemType', state.itemType);
  itemForm.set('category', state.category);
  if (state.subcategory) itemForm.set('subcategory', state.subcategory);
  itemForm.set('quantity', state.quantity);
  itemForm.set('unit', state.unit);
  if (state.manufacturer) itemForm.set('manufacturer', state.manufacturer);
  if (state.sku) itemForm.set('sku', state.sku);
  if (state.description) itemForm.set('description', state.description);
  if (state.countryOfOrigin) itemForm.set('countryOfOrigin', state.countryOfOrigin);
  if (state.hsCode) itemForm.set('hsCode', state.hsCode);
  if (state.notes) itemForm.set('notes', state.notes);

  const itemRes = await createItem(projectId, null, itemForm);
  if (!itemRes.ok) {
    return { ok: false, error: `Item: ${itemRes.error ?? 'unknown error'}` };
  }
  return { ok: true, createdPackageId: packageId };
}

export function ItemWizard({
  open,
  onClose,
  projectId,
  packages,
  preselectedPackageId,
  onSuccess
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  packages: ItemWizardPackage[];
  preselectedPackageId?: string;
  onSuccess: () => void;
}) {
  const steps: WizardStepDef<State>[] = [
    {
      id: 'where',
      titleKey: 'items_wizard.step_where',
      isValid: (s) =>
        s.mode === 'existing'
          ? !!s.packageId
          : s.newPackageName.trim().length > 0,
      Component: (props) => <WhereStep {...props} packages={packages} />
    },
    {
      id: 'identity',
      titleKey: 'items_wizard.step_identity',
      isValid: (s) => s.name.trim().length > 0 && s.category.trim().length > 0,
      Component: IdentityStep
    },
    {
      id: 'specification',
      titleKey: 'items_wizard.step_specification',
      isValid: () => true,
      Component: SpecificationStep
    },
    {
      id: 'quantity',
      titleKey: 'items_wizard.step_quantity',
      isValid: (s) =>
        s.unit.trim().length > 0 && Number(s.quantity) > 0,
      Component: QuantityStep
    },
    {
      id: 'review',
      titleKey: 'items_wizard.step_review',
      isValid: () => true,
      Component: (props) => <ReviewStep {...props} packages={packages} />
    }
  ];

  return (
    <Wizard<State>
      open={open}
      onClose={onClose}
      titleKey="items_wizard.title"
      initialState={freshState(preselectedPackageId)}
      steps={steps}
      flatFormHref={`/projects/${projectId}/items/new${preselectedPackageId ? `?packageId=${preselectedPackageId}` : ''}`}
      onSubmit={async (state) => {
        const res = await submitItem(projectId, state);
        if (res.ok) onSuccess();
        return res;
      }}
      onSubmitAndContinue={{
        labelKey: 'items_wizard.create_and_add',
        handler: async (state) => {
          const res = await submitItem(projectId, state);
          if (!res.ok) return res;
          onSuccess();
          // Preserve package + category for the next item; clear everything else
          return {
            ok: true,
            nextState: {
              ...freshState(),
              mode: 'existing' as const,
              packageId: res.createdPackageId ?? state.packageId,
              category: state.category,
              itemType: state.itemType
            }
          };
        }
      }}
    />
  );
}
