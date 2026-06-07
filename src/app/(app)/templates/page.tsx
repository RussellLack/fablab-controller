import { getTranslations } from 'next-intl/server';
import { asc, desc } from 'drizzle-orm';
import { db, documentTemplates } from '@/db';
import { formatDate } from '@/lib/utils';

/**
 * Document Templates — REFERENCE list view.
 *
 * One row per template (slug × locale × version). Doctrine per
 * `20-doc-templates-best-practice.md`: templates are versioned, so the
 * register shows every version with the latest `active` one surfaced
 * first. Status pill makes it obvious which row is what the system
 * will pick at send-time.
 *
 * Read-only. Authoring + version-promotion live in their own admin
 * surface (not yet built); this page is the canonical list so staff
 * can see what exists and what the locale coverage looks like.
 */

const STATUS_TONE: Record<string, string> = {
  active: 'text-ok bg-ok-soft',
  for_review: 'text-warn bg-warn-soft',
  draft: 'text-ink-3 bg-bg',
  archived: 'text-ink-3 bg-bg opacity-60'
};

async function getTemplates() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db
      .select({
        id: documentTemplates.id,
        slug: documentTemplates.slug,
        locale: documentTemplates.locale,
        version: documentTemplates.version,
        status: documentTemplates.status,
        subjectTemplate: documentTemplates.subjectTemplate,
        updatedAt: documentTemplates.updatedAt
      })
      .from(documentTemplates)
      .orderBy(
        asc(documentTemplates.slug),
        asc(documentTemplates.locale),
        desc(documentTemplates.version)
      )
      .limit(500);
  } catch {
    return [];
  }
}

export default async function TemplatesPage() {
  const rows = await getTemplates();
  const t = await getTranslations();

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {t('nav.templates')}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('templates_page.count', { n: rows.length })}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          {t('templates_page.empty')}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <tr>
                <th className="text-left px-4 py-2.5">{t('templates_page.col_slug')}</th>
                <th className="text-left px-4 py-2.5">{t('templates_page.col_locale')}</th>
                <th className="text-right px-4 py-2.5">{t('templates_page.col_version')}</th>
                <th className="text-left px-4 py-2.5">{t('templates_page.col_status')}</th>
                <th className="text-left px-4 py-2.5">{t('templates_page.col_subject')}</th>
                <th className="text-left px-4 py-2.5">{t('templates_page.col_updated')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tpl) => (
                <tr key={tpl.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium font-mono text-[12px]">
                    {tpl.slug}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2 uppercase text-[12px]">
                    {tpl.locale}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-2 font-mono text-[12px]">
                    v{tpl.version}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`pill ${STATUS_TONE[tpl.status] ?? ''}`}>
                      {t(`template_status.${tpl.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2 truncate max-w-[300px]">
                    {tpl.subjectTemplate ?? <span className="text-ink-3">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-3 text-[12px]">
                    {formatDate(tpl.updatedAt)}
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
