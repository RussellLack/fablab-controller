'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createRisk } from '@/server/actions/risk';

const CATEGORIES = [
  'scope_risk',
  'budget_risk',
  'supplier_risk',
  'freight_risk',
  'customs_risk',
  'site_readiness_risk',
  'client_approval_risk',
  'payment_risk',
  'installation_risk',
  'quality_risk',
  'legal_contract_risk',
  'margin_risk',
  'reputation_risk'
] as const;

/**
 * "+ New risk" inline create form. Single panel (no wizard) — keeps
 * the cognitive surface tight for what's a frequent log action. If
 * the risk grows complex enough to warrant scope-creep into a wizard,
 * it almost always wants to be a separate workstream anyway.
 */
export function NewRiskLauncher({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form state — lifted up so we can preview score live.
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('scope_risk');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [description, setDescription] = useState('');
  const [mitigationAction, setMitigationAction] = useState('');
  const [mitigationDueDate, setMitigationDueDate] = useState('');

  const score = likelihood * impact;
  const band =
    score >= 16 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low';
  const bandTone =
    band === 'critical'
      ? 'text-danger bg-danger-soft'
      : band === 'high'
        ? 'text-warn bg-warn-soft'
        : band === 'medium'
          ? 'text-info bg-info-soft'
          : 'text-ink-3 bg-bg';

  function reset() {
    setTitle('');
    setCategory('scope_risk');
    setLikelihood(3);
    setImpact(3);
    setDescription('');
    setMitigationAction('');
    setMitigationDueDate('');
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await createRisk(projectId, fd);
      if (!r.ok) setError(r.error);
      else {
        reset();
        setOpen(false);
        router.refresh();
        if (r.id) router.push(`/projects/${projectId}/risk/${r.id}`);
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        {t('risk.new_cta')}
      </button>
    );
  }

  return (
    <div className="card w-full max-w-[640px]">
      <h3 className="card-title mb-3">{t('risk.new_panel_title')}</h3>
      <form onSubmit={onSubmit} className="space-y-3">
        <Row label={t('risk.field_title')} required>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            autoFocus
            placeholder={t('risk.field_title_placeholder')}
            className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </Row>

        <div className="grid grid-cols-2 gap-3">
          <Row label={t('risk.field_category')} required>
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`risk.category.${c}`)}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('risk.field_mitigation_due')}>
            <input
              type="date"
              name="mitigationDueDate"
              value={mitigationDueDate}
              onChange={(e) => setMitigationDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </Row>
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Row label={`${t('risk.field_likelihood')} (1–5)`} required>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              name="likelihood"
              value={likelihood}
              onChange={(e) => setLikelihood(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-ink-3 mt-1">{t(`risk.likelihood.${likelihood}`)}</div>
          </Row>
          <Row label={`${t('risk.field_impact')} (1–5)`} required>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              name="impact"
              value={impact}
              onChange={(e) => setImpact(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-ink-3 mt-1">{t(`risk.impact.${impact}`)}</div>
          </Row>
          <div>
            <div className="text-[11px] text-ink-3 mb-1 uppercase tracking-wider">
              {t('risk.score_preview')}
            </div>
            <div className={`pill ${bandTone} text-[14px] px-3 py-1`}>
              {score} · {t(`risk.band.${band}`)}
            </div>
          </div>
        </div>

        <Row label={t('risk.field_description')}>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t('risk.field_description_placeholder')}
            className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />
        </Row>

        <Row label={t('risk.field_mitigation_action')}>
          <textarea
            name="mitigationAction"
            value={mitigationAction}
            onChange={(e) => setMitigationAction(e.target.value)}
            rows={2}
            placeholder={t('risk.field_mitigation_action_placeholder')}
            className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />
        </Row>

        {error && (
          <div className="text-[12px] text-warn bg-warn-soft border border-warn/20 rounded px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="btn btn-ghost text-[12px]"
            disabled={isPending}
          >
            {t('action.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary text-[12px]"
            disabled={isPending || !title.trim()}
          >
            {isPending ? t('risk.creating') : t('risk.create_submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Row({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] text-ink-2 mb-1 uppercase tracking-wider">
        {label}
        {required && <span className="text-warn ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
