import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, clients, projects, vendors } from '@/db';
import { eq, desc, sql } from 'drizzle-orm';
import { formatMoney, formatDate } from '@/lib/utils';

/**
 * Shared detail content for a client — used both by /clients/[id]
 * (standalone full page) and by the inline panel in /clients split-view.
 *
 * `mode` toggles between:
 *   - 'page'  → full page chrome (back link, larger h1)
 *   - 'panel' → inline panel chrome (smaller, "Open full page" shortcut)
 */

const STAGE_PILL: Record<string, string> = {
  brief: 'pill-brief',
  concept: 'pill-concept',
  design_development: 'pill-design',
  specification: 'pill-spec',
  procurement_production: 'pill-proc',
  installation: 'pill-install',
  handover: 'pill-handover'
};

async function getClient(id: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db
      .select({
        id: clients.id,
        name: clients.name,
        kind: clients.kind,
        primaryContactName: clients.primaryContactName,
        primaryContactEmail: clients.primaryContactEmail,
        primaryContactPhone: clients.primaryContactPhone,
        billingAddress: clients.billingAddress,
        orgNumber: clients.orgNumber,
        paymentTermsDays: clients.paymentTermsDays,
        bankAccountRef: clients.bankAccountRef,
        notes: clients.notes,
        isAlsoVendor: sql<boolean>`EXISTS (
          SELECT 1 FROM ${vendors} v
          WHERE lower(v.name) = lower(clients.name)
             OR (clients.org_number IS NOT NULL
                 AND v.notes ~ ('Org\\.nr\\.: ' || clients.org_number || '(\\D|$)'))
        )`,
        matchedVendorId: sql<string | null>`(
          SELECT v.id FROM ${vendors} v
          WHERE lower(v.name) = lower(clients.name)
             OR (clients.org_number IS NOT NULL
                 AND v.notes ~ ('Org\\.nr\\.: ' || clients.org_number || '(\\D|$)'))
          LIMIT 1
        )`
      })
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

async function getClientProjects(clientId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db
      .select({
        id: projects.id,
        reference: projects.reference,
        title: projects.title,
        currentStage: projects.currentStage,
        budget: projects.budget,
        budgetCurrency: projects.budgetCurrency,
        targetHandoverDate: projects.targetHandoverDate
      })
      .from(projects)
      .where(eq(projects.clientId, clientId))
      .orderBy(desc(projects.createdAt))
      .limit(500);
  } catch {
    return [];
  }
}

export async function ClientDetailPanel({
  clientId,
  mode = 'page'
}: {
  clientId: string;
  mode?: 'page' | 'panel';
}) {
  const [client, clientProjects] = await Promise.all([
    getClient(clientId),
    getClientProjects(clientId)
  ]);
  if (!client) {
    return (
      <div className="card text-ink-2 text-[13px]">
        Client not found.
      </div>
    );
  }
  const t = await getTranslations();
  const isPanel = mode === 'panel';

  return (
    <div className={isPanel ? 'h-full overflow-y-auto pr-1' : ''}>
      {/* Chrome — only render the back link on full-page mode */}
      {!isPanel && (
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/clients"
            className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
          >
            ← {t('entity_detail.back_to_clients')}
          </Link>
          <Link href={`/clients/${client.id}?edit=1`} className="btn text-[12px]">
            {t('entity_edit.edit_button')}
          </Link>
        </div>
      )}
      {isPanel && (
        <div className="flex justify-end mb-2">
          <Link
            href={`/clients/${client.id}`}
            className="text-[11px] text-ink-3 hover:text-ink underline-offset-2 hover:underline"
          >
            {t('entity_detail.open_full_page')} →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="pill pill-type pill-customer">{t('entity_type.customer')}</span>
          {client.isAlsoVendor && client.matchedVendorId && (
            <Link
              href={`/vendors/${client.matchedVendorId}`}
              className="pill pill-type pill-supplier hover:opacity-80"
              title={t('entity_type.dual_role_title')}
            >
              {t('entity_type.supplier')}
            </Link>
          )}
        </div>
        <h1 className={isPanel ? 'text-[18px] font-semibold tracking-tighter' : 'text-[24px] font-semibold tracking-tighter'}>
          {client.name}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1">{t(`client_kind.${client.kind}`)}</p>
      </div>

      {/* Contact + Commercial — single column in panel mode, two columns full page */}
      <div className={isPanel ? 'space-y-3 mb-3' : 'grid grid-cols-2 gap-4 mb-4'}>
        <div className="card">
          <div className="card-title">{t('entity_detail.contact_section')}</div>
          <dl className="text-[13px] space-y-1.5 mt-2">
            <DetailRow label={t('entity_detail.contact_name')} value={client.primaryContactName} />
            <DetailRow label={t('entity_detail.contact_email')} value={client.primaryContactEmail} mono />
            <DetailRow label={t('entity_detail.contact_phone')} value={client.primaryContactPhone} mono />
          </dl>
        </div>
        <div className="card">
          <div className="card-title">{t('entity_detail.commercial_section')}</div>
          <dl className="text-[13px] space-y-1.5 mt-2">
            <DetailRow label={t('entity_detail.org_number')} value={client.orgNumber} mono />
            <DetailRow
              label={t('entity_detail.payment_terms')}
              value={`${client.paymentTermsDays} ${t('entity_detail.days')}`}
            />
            <DetailRow label={t('entity_detail.bank_account')} value={client.bankAccountRef} mono />
          </dl>
        </div>
      </div>

      {client.billingAddress && (
        <div className="card mb-3">
          <div className="card-title">{t('entity_detail.address_section')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2">{client.billingAddress}</p>
        </div>
      )}

      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[14px] font-semibold">{t('entity_detail.related_projects')}</h2>
          <span className="text-[11px] uppercase tracking-wider text-ink-3">
            {clientProjects.length}
          </span>
        </div>
        {clientProjects.length === 0 ? (
          <div className="card text-ink-2 text-[13px]">{t('entity_detail.no_projects')}</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] uppercase tracking-wider text-ink-3 bg-bg">
                <tr>
                  <th className="text-left px-3 py-2">{t('col.ref')}</th>
                  <th className="text-left px-3 py-2">{t('col.title')}</th>
                  <th className="text-left px-3 py-2">{t('col.stage')}</th>
                  {!isPanel && <th className="text-right px-3 py-2">{t('col.budget')}</th>}
                  {!isPanel && <th className="text-left px-3 py-2">{t('col.handover')}</th>}
                </tr>
              </thead>
              <tbody>
                {clientProjects.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${p.id}`} className="ref hover:underline">
                        {p.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/projects/${p.id}`} className="hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`pill ${STAGE_PILL[p.currentStage] ?? ''}`}>
                        {t(`stage.${p.currentStage}`)}
                      </span>
                    </td>
                    {!isPanel && (
                      <td className="px-3 py-2 text-right">
                        {formatMoney(p.budget, p.budgetCurrency ?? 'NOK')}
                      </td>
                    )}
                    {!isPanel && (
                      <td className="px-3 py-2 text-ink-3 text-[12px]">
                        {formatDate(p.targetHandoverDate)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {client.notes && (
        <div className="card">
          <div className="card-title">{t('entity_detail.notes_section')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2 text-ink-2">{client.notes}</p>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="text-ink-3 w-32 shrink-0">{label}</dt>
      <dd className={mono ? 'font-mono text-[12px]' : ''}>
        {value ?? <span className="text-ink-3">—</span>}
      </dd>
    </div>
  );
}
