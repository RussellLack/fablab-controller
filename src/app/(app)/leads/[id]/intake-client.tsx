'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LeadForm } from '@/components/lead-form';
import { IntakeMeter } from '@/components/intake-meter';
import { updateLead, convertLeadToProject } from '@/server/actions/leads';
import type { IntakeField } from '@/lib/validations/lead';
import { cx, formatDate } from '@/lib/utils';

type FieldKey = IntakeField;

/** Lead intake screen — the gate. Save + (conditionally enabled) Convert. */
export function LeadIntakeClient({
  lead,
  missing,
  meter
}: {
  lead: Record<string, unknown>;
  missing: FieldKey[];
  meter: { complete: number; total: number; percent: number; missing: FieldKey[] };
}) {
  const t = useTranslations();
  const router = useRouter();
  const id = lead.id as string;
  const status = lead.status as string;
  const reference = lead.reference as string;
  const receivedAt = lead.receivedAt as Date;
  const isConverted = status === 'converted';
  const isLost = status === 'lost';
  const readOnly = isConverted || isLost;

  const updateBound = updateLead.bind(null, id);
  const [saveState, saveAction, saving] = useActionState(updateBound, null);

  const [converting, startConvert] = useTransition();

  function handleConvert() {
    if (meter.complete < meter.total) return;
    startConvert(async () => {
      const res = await convertLeadToProject(id);
      if (res.ok && res.url) router.push(res.url);
    });
  }

  const canConvert = meter.complete === meter.total && !readOnly;

  return (
    <>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ref">{reference}</span>
            <span className="inline-block text-[11px] py-0.5 px-2 rounded bg-bg text-ink-2 border border-line">
              {t(`lead.status.${status}`)}
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {(lead.prospectiveClientName as string) || t('lead.new_unnamed')}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('lead.received')} {formatDate(receivedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="submit" form="lead-form" disabled={saving || readOnly} className="btn disabled:opacity-60">
            {saving ? t('action.saving') : t('action.save')}
          </button>
          <button
            onClick={handleConvert}
            disabled={!canConvert || converting}
            className={cx(
              'btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed',
              !canConvert && 'opacity-50'
            )}
            title={canConvert ? '' : `${meter.total - meter.complete} field(s) missing`}
          >
            {converting
              ? t('action.converting')
              : canConvert
                ? t('action.convert')
                : `${t('action.convert')} (${meter.total - meter.complete} ${t('lead.fields_missing')})`}
          </button>
        </div>
      </div>

      {/* Completeness card — the gate explainer */}
      {!readOnly && (
        <div className={cx(
          'card mb-4 flex items-center gap-4',
          meter.percent === 100 ? 'bg-ok-soft border-ok' : 'bg-warn-soft border-warn'
        )}>
          <div className="flex-1">
            <strong className={cx(
              'text-[13px] block',
              meter.percent === 100 ? 'text-ok' : 'text-warn'
            )}>
              {meter.percent === 100
                ? t('lead.intake_complete')
                : t('lead.intake_meter_title_dyn', { complete: meter.complete, total: meter.total })}
            </strong>
            <div className="mt-1.5"><IntakeMeter complete={meter.complete} total={meter.total} percent={meter.percent} /></div>
          </div>
          <div className="text-xs text-warn max-w-[260px]">{t('lead.intake_rule')}</div>
        </div>
      )}

      {isConverted && (
        <div className="card bg-ok-soft border-ok mb-4 text-[13px] text-ok">
          {t('lead.already_converted')}{' '}
          <a href={`/projects/${lead.convertedProjectId}`} className="underline">{t('lead.view_project')}</a>
        </div>
      )}

      {saveState && !saveState.ok && (
        <div className="card bg-danger-soft border-danger text-danger mb-4 text-[13px]">{saveState.error}</div>
      )}

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <form id="lead-form" action={saveAction}>
          <LeadForm lead={lead} missing={missing} readOnly={readOnly} />
        </form>

        <div>
          <div className="card mb-3">
            <h3 className="card-title mb-3">{t('lead.missing')}</h3>
            {missing.length === 0 ? (
              <div className="text-[13px] text-ok">{t('lead.intake_complete_short')}</div>
            ) : (
              <div className="text-[13px]">
                {missing.map(f => (
                  <div key={f} className="text-danger py-1.5">• {t(`lead.miss.${f}`)}</div>
                ))}
              </div>
            )}
            <hr className="my-3 border-line" />
            <p className="text-xs text-ink-3">{t('lead.miss_helper')}</p>
          </div>
        </div>
      </div>
    </>
  );
}
