import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/utils';
import {
  getTodayActiveProjects,
  getTodayApprovalsWaiting,
  getTodayAwaitingConfirmation,
  getTodayIntake,
  getTodayOpenChangeOrders,
  getTodayPosReadyToIssue,
  getTodayRecentActivity,
  getTodayRiskProjects,
  getTodayStats,
  INTAKE_FIELD_COUNT
} from '@/server/queries/today';

/**
 * "Today" view — replaces the Dashboard tiles with action queues that
 * surface what needs the user *right now*.
 *
 * Doctrine per `21-ux-design.md` Phase 3:
 *   - Section titles borrow `00-` doctrine words ("Approval discipline",
 *     "Commercial protection", "Change control") so the page is itself
 *     a reminder of the operating principles.
 *   - Each section caps at 5 rows + a count; the rest is one click away.
 *   - A global `Show: mine / all` toggle filters every section by
 *     project ownership (`projects.currentOwnerId`).
 *
 * The old aggregate KPIs survive as a demoted STATS footer at the
 * bottom (decision #3 in the Phase 3 doc).
 */
export default async function TodayPage({
  searchParams
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const sp = await searchParams;
  const mineOnly = sp.show !== 'all';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) redirect('/login');

  const t = await getTranslations();

  const [
    intake,
    active,
    approvalsWaiting,
    posReady,
    awaitingConfirmation,
    changeOpen,
    riskProjects,
    recent,
    stats
  ] = await Promise.all([
    getTodayIntake(user.id, mineOnly),
    getTodayActiveProjects(user.id, mineOnly),
    getTodayApprovalsWaiting(user.id, mineOnly),
    getTodayPosReadyToIssue(user.id, mineOnly),
    getTodayAwaitingConfirmation(user.id, mineOnly),
    getTodayOpenChangeOrders(user.id, mineOnly),
    getTodayRiskProjects(user.id, mineOnly),
    getTodayRecentActivity(user.id, mineOnly),
    getTodayStats()
  ]);

  const now = new Date();
  const greeting = greetingFor(now);
  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
    user.email?.split('@')[0] ??
    '';
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">
            {t(`today.greeting_${greeting}`, { name: displayName })}
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">{dateLine}</p>
        </div>
        <MineAllToggle mineOnly={mineOnly} />
      </div>

      <Section
        titleKey="today.intake_heading"
        total={intake.total}
        emptyKey="today.intake_empty"
      >
        {intake.rows.map((r) => (
          <Row
            key={r.id}
            href={`/leads/${r.id}`}
            primary={r.prospectiveClientName ?? r.reference}
            secondary={r.reference}
            meta={`${r.fieldsFilled}/${INTAKE_FIELD_COUNT} ${t('today.intake_fields')} · ${t(`lead.status.${r.status}`)}`}
          />
        ))}
      </Section>

      <Section
        titleKey="today.active_projects_heading"
        total={active.total}
        emptyKey={
          mineOnly ? 'today.active_projects_empty_mine' : 'today.active_projects_empty_all'
        }
      >
        {active.rows.map((r) => (
          <Row
            key={r.id}
            href={`/projects/${r.id}`}
            primary={r.title}
            secondary={r.reference}
            meta={`${r.clientName ?? '—'} · ${t(`stage.${r.currentStage}`)}`}
          />
        ))}
      </Section>

      <Section
        titleKey="today.approvals_heading"
        total={approvalsWaiting.total}
        emptyKey="today.approvals_empty"
      >
        {approvalsWaiting.rows.map((r) => (
          <Row
            key={r.id}
            href={`/projects/${r.projectId}/approvals`}
            primary={r.subject}
            secondary={`${r.projectReference} · ${r.reference}`}
            meta={
              r.sentAt
                ? t('today.approvals_sent_ago', { ago: relativeDays(r.sentAt, now) })
                : ''
            }
            tone="warn"
          />
        ))}
      </Section>

      <Section
        titleKey="today.pos_ready_heading"
        total={posReady.total}
        emptyKey="today.pos_ready_empty"
      >
        {posReady.rows.map((r) => (
          <Row
            key={r.id}
            href={`/projects/${r.projectId}/pos/${r.id}`}
            primary={`${r.vendorName ?? '—'}`}
            secondary={`${r.projectReference} · ${r.reference}`}
            meta={`${formatMoney(r.totalGross, r.currency)} · ${t('today.pos_not_binding')}`}
            tone="warn"
          />
        ))}
      </Section>

      <Section
        titleKey="today.awaiting_confirmation_heading"
        total={awaitingConfirmation.total}
        emptyKey="today.awaiting_confirmation_empty"
      >
        {awaitingConfirmation.rows.map((r) => (
          <Row
            key={r.id}
            href={`/projects/${r.projectId}/pos/${r.id}`}
            primary={r.vendorName ?? '—'}
            secondary={`${r.projectReference} · ${r.reference}`}
            meta={
              r.daysSinceIssue !== null
                ? t('today.awaiting_confirmation_days', { n: r.daysSinceIssue })
                : ''
            }
            tone={
              r.daysSinceIssue !== null && r.daysSinceIssue >= 7
                ? 'danger'
                : 'warn'
            }
          />
        ))}
      </Section>

      <Section
        titleKey="today.change_control_heading"
        total={changeOpen.total}
        emptyKey="today.change_control_empty"
      >
        {changeOpen.rows.map((r) => (
          <Row
            key={r.id}
            href={`/projects/${r.projectId}/change-control`}
            primary={r.title}
            secondary={`${r.projectReference} · ${r.reference}`}
            meta={r.status.replace(/_/g, ' ')}
          />
        ))}
      </Section>

      <Section
        titleKey="today.risk_heading"
        total={riskProjects.total}
        emptyKey="today.risk_empty"
      >
        {riskProjects.rows.map((r) => (
          <Row
            key={r.id}
            href={`/projects/${r.id}`}
            primary={r.title}
            secondary={r.reference}
            meta={`${r.clientName ?? '—'} · ${t(`stage.${r.currentStage}`)}`}
            tone="danger"
          />
        ))}
      </Section>

      <Section
        titleKey="today.recent_heading"
        total={recent.length}
        emptyKey="today.recent_empty"
      >
        {recent.map((r, i) => (
          <Row
            key={i}
            href={r.href}
            primary={r.description}
            secondary=""
            meta={r.when.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short'
            })}
          />
        ))}
      </Section>

      <div className="border-t border-line pt-6">
        <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-3">
          {t('today.stats_heading')}
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Tile
            titleKey="dash.live_projects"
            value={stats.liveProjects}
            metaKey="dash.live_meta"
          />
          <Tile
            titleKey="dash.items_open"
            value={stats.itemsInFlight}
            metaKey="dash.items_meta"
          />
          <Tile
            titleKey="dash.dwg_review"
            value={stats.drawingsForReview}
            metaKey="dash.dwg_meta"
          />
          <Tile
            titleKey="dash.budget_committed"
            value={stats.budgetCommitted}
            metaKey="dash.budget_meta"
          />
        </div>
      </div>
    </div>
  );
}

function greetingFor(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function relativeDays(then: Date, now: Date): string {
  const days = Math.floor((now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days`;
}

async function MineAllToggle({ mineOnly }: { mineOnly: boolean }) {
  const t = await getTranslations();
  return (
    <div className="flex items-center gap-1 text-[12px]">
      <span className="text-ink-3 mr-1">{t('today.show')}</span>
      <Link
        href="/dashboard"
        className={`px-2 py-1 rounded border ${
          mineOnly ? 'bg-ink text-surface border-ink' : 'border-line hover:bg-bg'
        }`}
      >
        {t('today.show_mine')}
      </Link>
      <Link
        href="/dashboard?show=all"
        className={`px-2 py-1 rounded border ${
          !mineOnly ? 'bg-ink text-surface border-ink' : 'border-line hover:bg-bg'
        }`}
      >
        {t('today.show_all')}
      </Link>
    </div>
  );
}

async function Section({
  titleKey,
  total,
  emptyKey,
  children
}: {
  titleKey: string;
  total: number;
  emptyKey: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  const childArray = Array.isArray(children) ? children : [children];
  const hasRows = childArray.some((c) => c != null && c !== false);
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[12px] uppercase tracking-wider text-ink-3">
          {t(titleKey)}
        </h2>
        {total > 0 && (
          <span className="text-[12px] text-ink-3">({total})</span>
        )}
      </div>
      {hasRows ? (
        <ul className="divide-y divide-line border border-line rounded-md overflow-hidden">
          {children}
        </ul>
      ) : (
        <div className="text-[12px] text-ink-3 italic px-3 py-2 border border-line rounded-md">
          {t(emptyKey)}
        </div>
      )}
    </section>
  );
}

function Row({
  href,
  primary,
  secondary,
  meta,
  tone
}: {
  href: string;
  primary: string;
  secondary?: string;
  meta?: string;
  tone?: 'warn' | 'danger';
}) {
  const toneClass =
    tone === 'warn' ? 'border-l-2 border-warn' : tone === 'danger' ? 'border-l-2 border-danger' : '';
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center justify-between gap-3 px-3 py-2 hover:bg-bg transition-colors ${toneClass}`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate">{primary}</div>
          {secondary && (
            <div className="text-[11px] text-ink-3 truncate">{secondary}</div>
          )}
        </div>
        {meta && (
          <div className="text-[11px] text-ink-3 shrink-0">{meta}</div>
        )}
      </Link>
    </li>
  );
}

async function Tile({
  titleKey,
  value,
  metaKey
}: {
  titleKey: string;
  value: number | string;
  metaKey: string;
}) {
  const t = await getTranslations();
  return (
    <div className="card">
      <div className="card-title">{t(titleKey)}</div>
      <div className="card-value">{value}</div>
      <div className="card-meta">{t(metaKey)}</div>
    </div>
  );
}
