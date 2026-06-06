import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, items, packages } from '@/db';
import { NextActionBanner } from '@/components/next-action-banner';
import { formatDate } from '@/lib/utils';
import { HandoverRowActions } from './row-actions';
import { CoachCard } from '@/components/coach-card';
import { getHandoverHealth } from '@/server/queries/coach-health';

/**
 * Per-project Handover view — real implementation of the Phase-2 stub.
 *
 * The Handover module is the project's last linear gate. Items that
 * reached `installed` via the Delivery module become eligible here:
 * staff sign each one off (or raises a snag, kicking it back into
 * Delivery's exception flow).
 *
 * Doctrine (`00-` §22): written sign-off is the load-bearing
 * artefact. The portal-side brief sign-off (B5) is for the brief;
 * this is per-item sign-off at completion.
 *
 * Layout:
 *   - Progress bar at top: N/M items signed off, % complete
 *   - Section: Awaiting sign-off  (status = 'installed')
 *   - Section: Signed off         (status = 'signed_off')
 *   - Section: Snags raised       (status = 'damaged', noted at handover)
 *
 * The Snags section deliberately overlaps with the Delivery
 * Exceptions section by design — handover-time snags need visibility
 * in both places.
 */
export default async function ProjectHandoverPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();

  // Items relevant to handover are anything that's reached installed
  // or beyond, plus anything currently sitting at damaged (snags).
  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      manufacturer: items.manufacturer,
      sku: items.sku,
      status: items.status,
      installedAt: items.installedAt,
      signedOffAt: items.signedOffAt,
      packageName: packages.name
    })
    .from(items)
    .innerJoin(packages, eq(items.packageId, packages.id))
    .where(
      eq(packages.projectId, id)
      // Filter at SQL level for the three relevant states.
    )
    .orderBy(asc(items.installedAt));

  const relevant = rows.filter((r) =>
    ['installed', 'signed_off', 'damaged'].includes(r.status)
  );
  const awaiting = relevant.filter((r) => r.status === 'installed');
  const signedOff = relevant.filter((r) => r.status === 'signed_off');
  const snags = relevant.filter((r) => r.status === 'damaged');

  const totalEligible = awaiting.length + signedOff.length;
  const pct = totalEligible > 0
    ? Math.round((signedOff.length / totalEligible) * 100)
    : 0;

  const coachItems = await getHandoverHealth(id);

  return (
    <>
      <NextActionBanner projectId={id} gate="handover" />

      <CoachCard items={coachItems} />

      <p className="text-ink-2 text-[13px] mb-4">{t('handover.subtitle')}</p>

      {relevant.length === 0 ? (
        <div className="card">
          <p className="text-[13px] leading-snug text-ink-2">
            {t('handover.empty_doctrine')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="card-title">{t('handover.progress')}</h3>
              <span className="text-[13px] font-semibold">
                {signedOff.length} / {totalEligible}
              </span>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden border border-line">
              <div
                className="h-full bg-ok transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[11px] text-ink-3 mt-2">
              {pct === 100
                ? t('handover.progress_complete')
                : t('handover.progress_meta', { pct })}
            </p>
          </div>

          {awaiting.length > 0 && (
            <Section
              titleKey="handover.section.awaiting"
              subKey="handover.section_sub.awaiting"
              count={awaiting.length}
              tone="awaiting"
            >
              {awaiting.map((r) => (
                <HandoverItemRow key={r.id} row={r} projectId={id} />
              ))}
            </Section>
          )}

          {snags.length > 0 && (
            <Section
              titleKey="handover.section.snags"
              subKey="handover.section_sub.snags"
              count={snags.length}
              tone="snag"
            >
              {snags.map((r) => (
                <HandoverItemRow key={r.id} row={r} projectId={id} />
              ))}
            </Section>
          )}

          {signedOff.length > 0 && (
            <Section
              titleKey="handover.section.signed_off"
              subKey="handover.section_sub.signed_off"
              count={signedOff.length}
              tone="signed_off"
            >
              {signedOff.map((r) => (
                <HandoverItemRow key={r.id} row={r} projectId={id} />
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
  subKey,
  count,
  tone,
  children
}: {
  titleKey: string;
  subKey?: string;
  count: number;
  tone: 'awaiting' | 'snag' | 'signed_off';
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  const headColor =
    tone === 'snag' ? 'text-warn' : tone === 'signed_off' ? 'text-ok' : '';
  return (
    <section>
      <div className={`flex items-baseline gap-2 mb-2 ${headColor}`}>
        <h2 className="text-[12px] uppercase tracking-wider">{t(titleKey)}</h2>
        <span className="text-[12px] text-ink-3">({count})</span>
        {subKey && (
          <span className="text-[12px] text-ink-3">· {t(subKey)}</span>
        )}
      </div>
      <ul
        className={`divide-y rounded-md overflow-hidden border ${
          tone === 'snag'
            ? 'border-warn/40 bg-warn-soft/10'
            : tone === 'signed_off'
              ? 'border-ok/40 bg-ok-soft/20'
              : 'border-line'
        } divide-line`}
      >
        {children}
      </ul>
    </section>
  );
}

function HandoverItemRow({
  row,
  projectId
}: {
  row: {
    id: string;
    name: string;
    manufacturer: string | null;
    sku: string | null;
    status: string;
    installedAt: string | null;
    signedOffAt: string | null;
    packageName: string | null;
  };
  projectId: string;
}) {
  const stamp = row.signedOffAt ?? row.installedAt;
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
      <HandoverRowActions
        itemId={row.id}
        projectId={projectId}
        status={row.status}
      />
    </li>
  );
}
