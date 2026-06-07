import { getTranslations } from 'next-intl/server';
import { asc, sql } from 'drizzle-orm';
import { db, clients, projects } from '@/db';

/**
 * Clients — REFERENCE list view.
 *
 * One row per client with kind, primary contact, payment terms, and an
 * active-project count. Read-only for now; creation flows live inside
 * the Lead → Project pipeline (a client is captured during /leads/new).
 *
 * This page deliberately stays minimal: it's the lookup-table surface
 * for clients, not the CRM. The aspirational fuller surface (invoices,
 * receivables per client, repeat-business signals) lives at /finance.
 */
async function getClients() {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        id: clients.id,
        name: clients.name,
        kind: clients.kind,
        primaryContactName: clients.primaryContactName,
        primaryContactEmail: clients.primaryContactEmail,
        primaryContactPhone: clients.primaryContactPhone,
        orgNumber: clients.orgNumber,
        paymentTermsDays: clients.paymentTermsDays,
        activeProjects: sql<number>`(
          select count(*)::int from ${projects}
          where ${projects.clientId} = ${clients.id}
            and ${projects.currentStage} not in ('cancelled', 'archived')
        )`
      })
      .from(clients)
      .orderBy(asc(clients.name))
      .limit(500);
    return rows;
  } catch {
    return [];
  }
}

export default async function ClientsPage() {
  const rows = await getClients();
  const t = await getTranslations();

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {t('nav.clients')}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            {t('clients_page.count', { n: rows.length })}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">
          {t('clients_page.empty')}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
              <tr>
                <th className="text-left px-4 py-2.5">{t('clients_page.col_name')}</th>
                <th className="text-left px-4 py-2.5">{t('clients_page.col_kind')}</th>
                <th className="text-left px-4 py-2.5">{t('clients_page.col_contact')}</th>
                <th className="text-left px-4 py-2.5">{t('clients_page.col_org')}</th>
                <th className="text-right px-4 py-2.5">{t('clients_page.col_terms')}</th>
                <th className="text-right px-4 py-2.5">{t('clients_page.col_active')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {t(`client_kind.${c.kind}`)}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {c.primaryContactName ? (
                      <>
                        {c.primaryContactName}
                        {c.primaryContactEmail && (
                          <span className="text-ink-3"> · {c.primaryContactEmail}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2 font-mono text-[12px]">
                    {c.orgNumber ?? <span className="text-ink-3">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-2">
                    {c.paymentTermsDays}{t('clients_page.days_suffix')}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.activeProjects > 0 ? (
                      <span className="inline-block bg-accent-soft text-accent text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                        {c.activeProjects}
                      </span>
                    ) : (
                      <span className="text-ink-3">0</span>
                    )}
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
