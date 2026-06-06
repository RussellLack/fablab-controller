import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { asc, eq } from 'drizzle-orm';
import { db, items, packages } from '@/db';
import { NextActionBanner } from '@/components/next-action-banner';
import { formatDate } from '@/lib/utils';
import { DeliveryRowActions } from './row-actions';
import { CoachCard } from '@/components/coach-card';
import { getDeliveryHealth } from '@/server/queries/coach-health';

/**
 * Per-project Delivery list — real implementation of the Phase-2 stub.
 *
 * Doctrine: items don't disappear after a PO is issued; they move
 * through ordered → in_production → ready → shipped → received →
 * installed. Anything stuck falls into an exception state (on_hold /
 * backorder / damaged / substituted / cancelled) with an audit note.
 *
 * Layout: sections grouped by status, oldest-ordered first within each
 * section. Items in `specified` / `quoted` are pre-delivery and excluded
 * here (they live on the Items tab); `signed_off` items belong to the
 * Handover view.
 *
 * Each row shows: name + manufacturer/sku, package, key date, and a
 * single primary action (advance or open exceptions menu).
 */

const LINEAR_STATES = [
  'ordered',
  'in_production',
  'ready',
  'shipped',
  'received',
  'installed'
] as const;

const EXCEPTION_STATES = [
  'on_hold',
  'backorder',
  'damaged',
  'substituted',
  'cancelled'
] as const;

type DeliveryRow = {
  id: string;
  name: string;
  manufacturer: string | null;
  sku: string | null;
  status: string;
  orderedAt: string | null;
  expectedDeliveryAt: string | null;
  actualDeliveryAt: string | null;
  installedAt: string | null;
  packageName: string | null;
};

export default async function ProjectDeliveryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();

  // Run the items list + Coach rules in parallel — they're independent
  // queries and the page renders both side by side. Sequential await
  // here was costing ~1 round-trip on every page load.
  const [rows, coachItems]: [DeliveryRow[], Awaited<ReturnType<typeof getDeliveryHealth>>] = await Promise.all([
    db
    .select({
      id: items.id,
      name: items.name,
      manufacturer: items.manufacturer,
      sku: items.sku,
      status: items.status,
      orderedAt: items.orderedAt,
      expectedDeliveryAt: items.expectedDeliveryAt,
      actualDeliveryAt: items.actualDeliveryAt,
      installedAt: items.installedAt,
      packageName: packages.name
    })
    .from(items)
    .innerJoin(packages, eq(items.packageId, packages.id))
    .where(
      // Items are scoped via their package's projectId. Pre-delivery
      // items (specified / quoted) are filtered out below.
      eq(packages.projectId, id)
    )
    .orderBy(asc(items.orderedAt)),
    getDeliveryHealth(id)
  ]);

  // Filter & bucket in JS — small N per project; cheaper than two extra
  // round-trips for separate group queries.
  const inDelivery = rows.filter((r) =>
    LINEAR_STATES.includes(r.status as (typeof LINEAR_STATES)[number]) ||
    EXCEPTION_STATES.includes(r.status as (typeof EXCEPTION_STATES)[number])
  );
  const byStatus: Record<string, DeliveryRow[]> = {};
  for (const r of inDelivery) {
    (byStatus[r.status] ??= []).push(r);
  }

  const linearSections = LINEAR_STATES.filter((s) => byStatus[s]?.length).map(
    (status) => ({ status, items: byStatus[status]! })
  );
  const exceptionItems = EXCEPTION_STATES.flatMap(
    (s) => byStatus[s] ?? []
  );

  return (
    <>
      <NextActionBanner projectId={id} gate="delivery" />

      <CoachCard items={coachItems} />

      <p className="text-ink-2 text-[13px] mb-4">{t('delivery.subtitle')}</p>

      {inDelivery.length === 0 ? (
        <div className="card">
          <p className="text-[13px] leading-snug text-ink-2">
            {t('delivery.empty_doctrine')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {linearSections.map(({ status, items: bucket }) => (
            <Section
              key={status}
              titleKey={`delivery.section.${status}`}
              countSubtitleKey={`delivery.section_sub.${status}`}
              count={bucket.length}
              tone="linear"
            >
              {bucket.map((r) => (
                <DeliveryRowView
                  key={r.id}
                  row={r}
                  projectId={id}
                />
              ))}
            </Section>
          ))}

          {exceptionItems.length > 0 && (
            <Section
              titleKey="delivery.section.exceptions"
              countSubtitleKey="delivery.section_sub.exceptions"
              count={exceptionItems.length}
              tone="exception"
            >
              {exceptionItems.map((r) => (
                <DeliveryRowView
                  key={r.id}
                  row={r}
                  projectId={id}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </>
  );
}

async function Section({
  titleKey,
  countSubtitleKey,
  count,
  tone,
  children
}: {
  titleKey: string;
  countSubtitleKey?: string;
  count: number;
  tone: 'linear' | 'exception';
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  return (
    <section>
      <div
        className={`flex items-baseline gap-2 mb-2 ${
          tone === 'exception' ? 'text-warn' : ''
        }`}
      >
        <h2 className="text-[12px] uppercase tracking-wider">
          {t(titleKey)}
        </h2>
        <span className="text-[12px] text-ink-3">({count})</span>
        {countSubtitleKey && (
          <span className="text-[12px] text-ink-3">· {t(countSubtitleKey)}</span>
        )}
      </div>
      <ul
        className={`divide-y rounded-md overflow-hidden border ${
          tone === 'exception' ? 'border-warn/40 bg-warn-soft/10' : 'border-line'
        } divide-line`}
      >
        {children}
      </ul>
    </section>
  );
}

function DeliveryRowView({
  row,
  projectId
}: {
  row: DeliveryRow;
  projectId: string;
}) {
  const stamp =
    row.status === 'installed'
      ? row.installedAt
      : row.status === 'received'
        ? row.actualDeliveryAt
        : row.status === 'shipped' || row.status === 'ready' || row.status === 'in_production'
          ? row.expectedDeliveryAt
          : row.orderedAt;

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-[13px]">
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">
          <Link
            href={`/projects/${projectId}/items/${row.id}`}
            className="hover:underline"
          >
            {row.name}
          </Link>
        </div>
        <div className="text-[11px] text-ink-3 truncate">
          {[row.manufacturer, row.sku, row.packageName]
            .filter(Boolean)
            .join(' · ') || '—'}
        </div>
      </div>
      {stamp && (
        <div className="text-[11px] text-ink-3 shrink-0">
          {formatDate(stamp)}
        </div>
      )}
      <DeliveryRowActions
        itemId={row.id}
        projectId={projectId}
        status={row.status}
      />
    </li>
  );
}
