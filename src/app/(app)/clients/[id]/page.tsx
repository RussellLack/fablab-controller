import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, clients, projects, vendors } from '@/db';
import { eq, desc, sql } from 'drizzle-orm';
import { formatMoney, formatDate } from '@/lib/utils';

/**
 * Client detail page — single source of truth for one client.
 *
 * Header: typology pill(s) + name + kind sub-line.
 * Two-column cards: contact / commercial.
 * Address card.
 * Related projects table — every project where this client is the
 * counterparty, with stage pill and budget.
 * Notes card.
 *
 * The Supplier pill appears alongside Customer when the same legal
 * entity is also registered as a vendor (matched by name or org no.) —
 * clicking through to /vendors lets staff jump to the supplier-side
 * record for that counterparty.
 */

type Params = Promise<{ id: string }>;

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
        createdAt: clients.createdAt,
        // Dual-role check — see /clients page for the qualified-literal
        // workaround explanation.
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
        targetHandoverDate: projects.targetHandoverDate,
        createdAt: projects.createdAt
      })
      .from(projects)
      .where(eq(projects.clientId, clientId))
      .orderBy(desc(projects.createdAt))
      .limit(500);
  } catch {
    return [];
  }
}

export default async function ClientDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const [client, clientProjects] = await Promise.all([
    getClient(id),
    getClientProjects(id)
  ]);
  if (!client) notFound();

  const t = await getTranslations();

  return (
    <>
      {/* Back link */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-3"
      >
        ← {t('entity_detail.back_to_clients')}
      </Link>

      {/* Header — typology pills + name + kind sub-line */}
      <div className="mb-6">
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
        <h1 className="text-[24px] font-semibold tracking-tighter">{client.name}</h1>
        <p className="text-ink-2 text-[13px] mt-1">
          {t(`client_kind.${client.kind}`)}
        </p>
      </div>

      {/* Contact + Commercial — two-column */}
      <div className="grid grid-cols-2 gap-4 mb-4">
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

      {/* Address */}
      {client.billingAddress && (
        <div className="card mb-4">
          <div className="card-title">{t('entity_detail.address_section')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2">{client.billingAddress}</p>
        </div>
      )}

      {/* Related projects */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[14px] font-semibold">
            {t('entity_detail.related_projects')}
          </h2>
          <span className="text-[11px] uppercase tracking-wider text-ink-3">
            {clientProjects.length}
          </span>
        </div>
        {clientProjects.length === 0 ? (
          <div className="card text-ink-2 text-[13px]">
            {t('entity_detail.no_projects')}
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-[11px] uppercase tracking-wider text-ink-3 bg-bg">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('col.ref')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.title')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.stage')}</th>
                  <th className="text-right px-4 py-2.5">{t('col.budget')}</th>
                  <th className="text-left px-4 py-2.5">{t('col.handover')}</th>
                </tr>
              </thead>
              <tbody>
                {clientProjects.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/projects/${p.id}`}
                        className="ref hover:underline"
                      >
                        {p.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/projects/${p.id}`}
                        className="hover:underline"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`pill ${STAGE_PILL[p.currentStage] ?? ''}`}>
                        {t(`stage.${p.currentStage}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {formatMoney(p.budget, p.budgetCurrency ?? 'NOK')}
                    </td>
                    <td className="px-4 py-2.5 text-ink-3 text-[12px]">
                      {formatDate(p.targetHandoverDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes — provenance / PowerOffice metadata lives here from the importer */}
      {client.notes && (
        <div className="card">
          <div className="card-title">{t('entity_detail.notes_section')}</div>
          <p className="text-[13px] whitespace-pre-line mt-2 text-ink-2">{client.notes}</p>
        </div>
      )}
    </>
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
