import { getTranslations } from 'next-intl/server';
import { asc, sql } from 'drizzle-orm';
import { db, translations } from '@/db';

/**
 * Translations — REFERENCE list view.
 *
 * Shows the full EN/NO translation register from the `translations`
 * table, with a review-status pill so missing or machine-translation-
 * only strings stand out. Filterable by status via `?status=mt_only`.
 *
 * This is the bilingual surface the brief in `03-bilingual-pattern.md`
 * asks for: one line per key with side-by-side EN/NO and a clear
 * indicator of how trusted each translation is.
 *
 * Read-only for now. Editing flows belong in their own admin surface
 * (out of scope here); this page makes the register inspectable.
 */

const STATUS_TONE: Record<string, string> = {
  verified: 'text-ok bg-ok-soft',
  human_reviewed: 'text-info bg-info-soft',
  mt_only: 'text-warn bg-warn-soft'
};

async function getTranslationRows(filter: string | null) {
  if (!process.env.DATABASE_URL) {
    return { rows: [], totals: { all: 0, verified: 0, human_reviewed: 0, mt_only: 0, missing_no: 0 } };
  }
  try {
    const [totals] = await db
      .select({
        all: sql<number>`count(*)::int`,
        verified: sql<number>`count(*) filter (where ${translations.status} = 'verified')::int`,
        human_reviewed: sql<number>`count(*) filter (where ${translations.status} = 'human_reviewed')::int`,
        mt_only: sql<number>`count(*) filter (where ${translations.status} = 'mt_only')::int`,
        missing_no: sql<number>`count(*) filter (where ${translations.no} is null or ${translations.no} = '')::int`
      })
      .from(translations);

    const validStatus =
      filter === 'mt_only' || filter === 'human_reviewed' || filter === 'verified'
        ? filter
        : null;

    const baseQuery = db
      .select({
        key: translations.key,
        en: translations.en,
        no: translations.no,
        status: translations.status,
        updatedAt: translations.updatedAt
      })
      .from(translations);

    const rows = await (validStatus
      ? baseQuery.where(sql`${translations.status} = ${validStatus}`)
      : baseQuery
    )
      .orderBy(asc(translations.key))
      .limit(1000);

    return {
      rows,
      totals: totals ?? { all: 0, verified: 0, human_reviewed: 0, mt_only: 0, missing_no: 0 }
    };
  } catch {
    return { rows: [], totals: { all: 0, verified: 0, human_reviewed: 0, mt_only: 0, missing_no: 0 } };
  }
}

export default async function TranslationsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.status ?? null;
  const { rows, totals } = await getTranslationRows(filter);
  const t = await getTranslations();

  const FilterPill = ({ value, label, n }: { value: string | null; label: string; n: number }) => {
    const active = (filter ?? '') === (value ?? '');
    const href = value ? `/translations?status=${value}` : '/translations';
    return (
      <a
        href={href}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-colors duration-75 ${
          active
            ? 'bg-ink text-surface border-ink'
            : 'bg-surface text-ink-2 border-line hover:text-ink active:bg-line'
        }`}
      >
        {label}
        <span className={active ? 'text-surface/70' : 'text-ink-3'}>· {n}</span>
      </a>
    );
  };

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {t('nav.translation')}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('translations_page.count', { n: rows.length, all: totals.all })}
            {totals.missing_no > 0 && (
              <>
                {' · '}
                <span className="text-warn">
                  {t('translations_page.missing_no', { n: totals.missing_no })}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <FilterPill value={null} label={t('translations_page.filter_all')} n={totals.all} />
        <FilterPill value="verified" label={t('translation_status.verified')} n={totals.verified} />
        <FilterPill value="human_reviewed" label={t('translation_status.human_reviewed')} n={totals.human_reviewed} />
        <FilterPill value="mt_only" label={t('translation_status.mt_only')} n={totals.mt_only} />
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          {t('translations_page.empty')}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <tr>
                <th className="text-left px-4 py-2.5 w-[28%]">{t('translations_page.col_key')}</th>
                <th className="text-left px-4 py-2.5">{t('translations_page.col_en')}</th>
                <th className="text-left px-4 py-2.5">{t('translations_page.col_no')}</th>
                <th className="text-left px-4 py-2.5">{t('translations_page.col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line align-top">
                  <td className="px-4 py-2 font-mono text-[11.5px] text-ink-2">
                    {r.key}
                  </td>
                  <td className="px-4 py-2">{r.en}</td>
                  <td className="px-4 py-2">
                    {r.no ?? <span className="text-warn text-[12px]">{t('translations_page.missing_short')}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`pill ${STATUS_TONE[r.status] ?? ''}`}>
                      {t(`translation_status.${r.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
