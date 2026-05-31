'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createRfqAtomic } from '@/server/actions/procurement';
import { buildRfqBodyTemplate } from '@/lib/rfq-body-template';
import { Wizard, type WizardStepDef } from './wizard';

/**
 * RFQ wizard — W1 of 22-wizards.md.
 *
 * Guides the user through composing an RFQ. Steps:
 *   1 — Basics    title, description, response deadline
 *   2 — Items     checkbox tree grouped by package (only `specified` items)
 *   3 — Vendors   checkbox list, best-match by selected items' categories first
 *   4 — Review    summary + Save as draft / Save and send
 *
 * Server handoff: `createRfqAtomic(projectId, projectRef, andSend, FormData)`.
 * Doesn't redirect inside the action so the wizard can close the drawer and
 * `router.push` to the new RFQ detail itself.
 */

export type WizardItem = {
  id: string;
  name: string;
  packageId: string;
  packageName: string;
  category: string;
  quantity: string;
  unit: string;
  description?: string | null;
  manufacturer?: string | null;
  sku?: string | null;
};

export type WizardVendor = {
  id: string;
  name: string;
  kind: string;
  categories: string[];
};

type State = {
  // Step 1 — Basics (description field removed; the body step replaces it)
  title: string;
  responseDeadline: string; // YYYY-MM-DD

  // Step 2 — Items
  selectedItemIds: Set<string>;

  // Step 3 — Vendors
  selectedVendorIds: Set<string>;

  // Step 4 — Body (RFQ letter text, auto-filled from template, user-editable)
  body: string;
  /** True once the user has edited the body away from the auto-template. */
  bodyEdited: boolean;

  // Step 5 — Review
  andSend: boolean;
};

function freshState(): State {
  // Default deadline: 14 days from now (commonly used in RFQ workflows)
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const responseDeadline = d.toISOString().slice(0, 10);

  return {
    title: '',
    responseDeadline,
    selectedItemIds: new Set(),
    selectedVendorIds: new Set(),
    body: '',
    bodyEdited: false,
    andSend: false
  };
}

/* ─── Step components ────────────────────────────────────────────── */

function BasicsStep({
  state,
  update
}: {
  state: State;
  update: (p: Partial<State>) => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3">{t('rfq_wizard.basics_helper')}</p>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">
          {t('rfq.title')} *
        </label>
        <input
          autoFocus
          value={state.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t('rfq_wizard.title_placeholder')}
          className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] text-ink-2 block mb-1">
          {t('rfq.deadline')} *
        </label>
        <input
          type="date"
          value={state.responseDeadline}
          onChange={(e) => update({ responseDeadline: e.target.value })}
          className="px-2.5 py-2 border border-line rounded-md text-[13px]"
        />
      </div>
    </div>
  );
}

function ItemsStep({
  state,
  update,
  items
}: {
  state: State;
  update: (p: Partial<State>) => void;
  items: WizardItem[];
}) {
  const t = useTranslations();
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: WizardItem[] }>();
    for (const it of items) {
      const key = it.packageId;
      if (!map.has(key)) map.set(key, { name: it.packageName, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-[13px] text-ink-2">
        <p>{t('rfq_wizard.no_items')}</p>
      </div>
    );
  }

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(state.selectedItemIds);
    if (checked) next.add(id);
    else next.delete(id);
    update({ selectedItemIds: next });
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3">{t('rfq_wizard.items_helper')}</p>
      {grouped.map(([pkgId, group]) => (
        <div key={pkgId}>
          <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">
            {group.name}
          </div>
          <div className="space-y-0.5">
            {group.items.map((it) => (
              <label
                key={it.id}
                className="flex items-center gap-2 cursor-pointer text-[13px] px-2 py-1.5 rounded hover:bg-bg"
              >
                <input
                  type="checkbox"
                  checked={state.selectedItemIds.has(it.id)}
                  onChange={(e) => toggle(it.id, e.target.checked)}
                />
                <span className="flex-1">{it.name}</span>
                <span className="text-[11px] text-ink-3">
                  {it.quantity} {it.unit} · {it.category}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VendorsStep({
  state,
  update,
  items,
  vendors
}: {
  state: State;
  update: (p: Partial<State>) => void;
  items: WizardItem[];
  vendors: WizardVendor[];
}) {
  const t = useTranslations();

  // Categories of selected items (for best-match)
  const selectedCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const it of items) {
      if (state.selectedItemIds.has(it.id) && it.category) cats.add(it.category);
    }
    return cats;
  }, [items, state.selectedItemIds]);

  const { matched, others } = useMemo(() => {
    const matched: WizardVendor[] = [];
    const others: WizardVendor[] = [];
    for (const v of vendors) {
      const hasMatch = v.categories.some((c) => selectedCategories.has(c));
      if (hasMatch) matched.push(v);
      else others.push(v);
    }
    return { matched, others };
  }, [vendors, selectedCategories]);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(state.selectedVendorIds);
    if (checked) next.add(id);
    else next.delete(id);
    update({ selectedVendorIds: next });
  };

  const renderVendor = (v: WizardVendor) => (
    <label
      key={v.id}
      className="flex items-center gap-2 cursor-pointer text-[13px] px-2 py-1.5 rounded hover:bg-bg"
    >
      <input
        type="checkbox"
        checked={state.selectedVendorIds.has(v.id)}
        onChange={(e) => toggle(v.id, e.target.checked)}
      />
      <span className="flex-1">{v.name}</span>
      <span className="text-[11px] text-ink-3">{t(`vendor.kind.${v.kind}`)}</span>
    </label>
  );

  if (vendors.length === 0) {
    return (
      <div className="text-[13px] text-ink-2">
        <p>{t('rfq_wizard.no_vendors')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3">{t('rfq_wizard.vendors_helper')}</p>
      {matched.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">
            {t('rfq_wizard.matched_vendors')}
          </div>
          <div className="space-y-0.5">{matched.map(renderVendor)}</div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">
            {matched.length > 0
              ? t('rfq_wizard.other_vendors')
              : t('rfq_wizard.all_vendors')}
          </div>
          <div className="space-y-0.5">{others.map(renderVendor)}</div>
        </div>
      )}
    </div>
  );
}

function BodyStep({
  state,
  update,
  items,
  vendors,
  projectRef,
  projectTitle,
  deliveryCountry
}: {
  state: State;
  update: (p: Partial<State>) => void;
  items: WizardItem[];
  vendors: WizardVendor[];
  projectRef: string;
  projectTitle: string;
  deliveryCountry: string | null;
}) {
  const t = useTranslations();

  // Build the template body whenever the inputs that drive it change.
  // The user can edit; once they do, `bodyEdited` flips and we stop
  // overwriting their edits. A "Regenerate from template" button gives
  // them an explicit way to discard their edits.
  const template = useMemo(() => {
    const selItems = items.filter((it) => state.selectedItemIds.has(it.id));
    return buildRfqBodyTemplate({
      projectRef,
      projectTitle,
      itemsForBody: selItems.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        description: it.description ?? null,
        manufacturer: it.manufacturer ?? null,
        sku: it.sku ?? null
      })),
      deliveryCountry,
      responseDeadline: state.responseDeadline,
      invitedVendorsCount: state.selectedVendorIds.size
    });
  }, [
    items,
    state.selectedItemIds,
    state.selectedVendorIds.size,
    state.responseDeadline,
    projectRef,
    projectTitle,
    deliveryCountry
  ]);

  // First time the user enters this step (body empty, bodyEdited false),
  // seed with the template. Don't overwrite later edits.
  useEffect(() => {
    if (!state.bodyEdited && !state.body && template) {
      update({ body: template });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // Mark `bodyEdited` once the textarea changes off the template
  const onBodyChange = (next: string) => {
    update({ body: next, bodyEdited: next !== template });
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3 leading-snug">
        {t('rfq_wizard.body_helper')}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-ink-3">
          {t('rfq_wizard.body_label')}
          {state.bodyEdited && (
            <span className="ml-2 text-ink italic normal-case">
              · {t('rfq_wizard.body_edited')}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => update({ body: template, bodyEdited: false })}
          className="text-[11px] text-ink-3 hover:text-ink underline"
        >
          {t('rfq_wizard.body_regenerate')}
        </button>
      </div>
      <textarea
        value={state.body}
        onChange={(e) => onBodyChange(e.target.value)}
        rows={16}
        className="w-full px-3 py-2 border border-line rounded-md text-[12px] font-mono leading-relaxed"
      />
      <p className="text-[11px] text-ink-3 italic">
        {t('rfq_wizard.body_placeholders_note')}
      </p>
    </div>
  );
}

function ReviewStep({
  state,
  update,
  items,
  vendors
}: {
  state: State;
  update: (p: Partial<State>) => void;
  items: WizardItem[];
  vendors: WizardVendor[];
}) {
  const t = useTranslations();
  const selItems = items.filter((it) => state.selectedItemIds.has(it.id));
  const selVendors = vendors.filter((v) => state.selectedVendorIds.has(v.id));

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-3">{t('rfq_wizard.review_helper')}</p>

      <div className="border border-line rounded-md p-3 text-[13px] space-y-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">{t('rfq.title')}</div>
          <div className="text-ink">{state.title}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">{t('rfq.deadline')}</div>
          <div className="text-ink">{state.responseDeadline}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">
            {selItems.length} {t('rfq.items_count')}
          </div>
          <div className="text-ink-2 text-[12px]">
            {selItems.map((it) => it.name).join(' · ') || '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">
            {selVendors.length} {t('rfq.vendors_count')}
          </div>
          <div className="text-ink-2 text-[12px]">
            {selVendors.map((v) => v.name).join(' · ') || '—'}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-[13px]">
        <input
          type="checkbox"
          checked={state.andSend}
          onChange={(e) => update({ andSend: e.target.checked })}
        />
        <span>{t('rfq_wizard.send_now')}</span>
      </label>
      <p className="text-[11px] text-ink-3 italic pl-6">
        {state.andSend
          ? t('rfq_wizard.send_now_on')
          : t('rfq_wizard.send_now_off')}
      </p>
    </div>
  );
}

/* ─── Wizard wrapper ─────────────────────────────────────────────── */

export function RfqWizard({
  open,
  onClose,
  projectId,
  projectRef,
  projectTitle,
  deliveryCountry,
  items,
  vendors
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectRef: string;
  projectTitle: string;
  deliveryCountry: string | null;
  items: WizardItem[];
  vendors: WizardVendor[];
}) {
  const router = useRouter();

  const steps: WizardStepDef<State>[] = [
    {
      id: 'basics',
      titleKey: 'rfq_wizard.step_basics',
      isValid: (s) => s.title.trim().length > 0 && !!s.responseDeadline,
      Component: BasicsStep
    },
    {
      id: 'items',
      titleKey: 'rfq_wizard.step_items',
      isValid: (s) => s.selectedItemIds.size > 0,
      Component: (props) => <ItemsStep {...props} items={items} />
    },
    {
      id: 'vendors',
      titleKey: 'rfq_wizard.step_vendors',
      isValid: (s) => s.selectedVendorIds.size > 0,
      Component: (props) => <VendorsStep {...props} items={items} vendors={vendors} />
    },
    {
      id: 'body',
      titleKey: 'rfq_wizard.step_body',
      isValid: (s) => s.body.trim().length > 0,
      Component: (props) => (
        <BodyStep
          {...props}
          items={items}
          vendors={vendors}
          projectRef={projectRef}
          projectTitle={projectTitle}
          deliveryCountry={deliveryCountry}
        />
      )
    },
    {
      id: 'review',
      titleKey: 'rfq_wizard.step_review',
      isValid: () => true,
      Component: (props) => <ReviewStep {...props} items={items} vendors={vendors} />
    }
  ];

  return (
    <Wizard<State>
      open={open}
      onClose={onClose}
      titleKey="rfq_wizard.title"
      initialState={freshState()}
      steps={steps}
      flatFormHref={`/projects/${projectId}/rfqs/new`}
      submitLabelKey="rfq_wizard.submit"
      onSubmit={async (state) => {
        const fd = new FormData();
        fd.set('title', state.title);
        if (state.body) fd.set('description', state.body); // body lives in the description column
        fd.set('responseDeadline', state.responseDeadline);
        for (const id of state.selectedItemIds) fd.append('itemIds', id);
        for (const id of state.selectedVendorIds) fd.append('vendorIds', id);

        const res = await createRfqAtomic(
          projectId,
          projectRef,
          state.andSend,
          fd
        );
        if (res.ok && res.rfqId) {
          router.push(`/projects/${projectId}/rfqs/${res.rfqId}`);
          return { ok: true };
        }
        return { ok: false, error: res.ok ? undefined : res.error };
      }}
    />
  );
}
