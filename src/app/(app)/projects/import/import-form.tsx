'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  previewProjectsCsv,
  commitProjectsCsv,
  type PreviewResult
} from '@/server/actions/project-import';

/**
 * Project CSV importer. Differs from /clients and /vendors in two
 * important ways the form surfaces clearly:
 *
 *   • UPDATE-ONLY by Reference. The plan never offers an "Insert"
 *     row — every row either updates an existing project or is
 *     flagged as an error because the reference doesn't exist.
 *   • Stage column is read but never written. A per-row "Stage
 *     ignored" note appears so the user can see we noticed and
 *     chose not to touch it.
 */
export function ProjectImportForm() {
  const t = useTranslations();
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [plan, setPlan] = useState<PreviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [committed, setCommitted] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => setCsv(text));
  }

  function runPreview() {
    if (!csv.trim()) return;
    setCommitted(false);
    startTransition(async () => setPlan(await previewProjectsCsv(csv)));
  }

  function runCommit() {
    if (!csv.trim()) return;
    if (!confirm(t('csv_import.confirm_projects'))) return;
    startTransition(async () => {
      const result = await commitProjectsCsv(csv);
      setPlan(result);
      if (result.ok && (result as { applied?: boolean }).applied) {
        setCommitted(true);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-3"
      >
        ← {t('csv_import.back_to_projects')}
      </Link>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tighter">
          {t('csv_import.title_projects')}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1 max-w-2xl">
          {t('csv_import.intro_projects')}
        </p>
        <p className="text-warn text-[12px] mt-2 max-w-2xl">
          {t('csv_import.update_only_warning')}
        </p>
      </div>

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="card-title">{t('csv_import.source')}</div>
          <label className="text-[12px] text-ink-3 hover:text-ink cursor-pointer">
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
            {t('csv_import.choose_file')}
          </label>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          placeholder={t('csv_import.placeholder_projects')}
          className="w-full px-3 py-2 text-[12px] font-mono border border-line rounded-md bg-surface focus:outline-none focus:border-ink-2"
        />
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={runPreview}
            disabled={pending || !csv.trim()}
            className="btn text-[12px]"
          >
            {pending && !committed ? t('csv_import.previewing') : t('csv_import.preview')}
          </button>
          {plan && plan.ok && !committed && (
            <button
              onClick={runCommit}
              disabled={pending || plan.updateCount === 0}
              className="btn btn-primary text-[12px]"
            >
              {t('csv_import.commit', { n: plan.updateCount })}
            </button>
          )}
        </div>
      </div>

      {plan && (
        <div className="card">
          {!plan.ok ? (
            <p className="text-[13px] text-danger">{plan.error}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="card-title">{t('csv_import.plan')}</div>
                {committed && (
                  <span className="text-[12px] text-ok font-semibold">
                    {t('csv_import.applied')}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-ink-2 mb-3">
                {t('csv_import.summary_projects', {
                  updates: plan.updateCount,
                  errors: plan.errorCount
                })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-[10px] uppercase tracking-wider text-ink-3 bg-bg">
                    <tr>
                      <th className="text-left px-3 py-1.5">#</th>
                      <th className="text-left px-3 py-1.5">{t('csv_import.col_decision')}</th>
                      <th className="text-left px-3 py-1.5">{t('csv_import.col_reference')}</th>
                      <th className="text-left px-3 py-1.5">{t('csv_import.col_title')}</th>
                      <th className="text-left px-3 py-1.5">{t('csv_import.col_client')}</th>
                      <th className="text-left px-3 py-1.5">{t('csv_import.col_notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((item) => {
                      const colorClass =
                        item.errors?.length
                          ? 'text-danger'
                          : item.decision === 'update'
                          ? 'text-info'
                          : 'text-ink-3';
                      const notes = [
                        ...(item.errors ?? []),
                        ...(item.notes ?? [])
                      ].join(' · ');
                      return (
                        <tr key={item.rowNumber} className="border-t border-line">
                          <td className="px-3 py-1.5 text-ink-3 font-mono">{item.rowNumber}</td>
                          <td className={`px-3 py-1.5 font-semibold uppercase tracking-wider ${colorClass}`}>
                            {item.errors?.length
                              ? t('csv_import.decision_error')
                              : item.decision === 'update'
                              ? t('csv_import.decision_update')
                              : '—'}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-ink-2">
                            {item.parsed?.reference ?? item.raw[0] ?? ''}
                          </td>
                          <td className="px-3 py-1.5">{item.parsed?.title ?? item.raw[1] ?? ''}</td>
                          <td className="px-3 py-1.5 text-ink-2">
                            {item.parsed?.clientName ?? item.raw[2] ?? ''}
                          </td>
                          <td className="px-3 py-1.5 text-ink-3">{notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
