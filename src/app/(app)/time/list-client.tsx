'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TimeEntryForm, type TimeEntryDraft } from './time-entry-form';
import { CoachWizard } from '@/components/wizard/coach-wizard';

type Entry = TimeEntryDraft & {
  id: string;
  projectRef: string;
  projectTitle: string;
  currentStage: TimeEntryDraft['stage'];
};

type Project = {
  id: string;
  reference: string;
  title: string;
  currentStage: TimeEntryDraft['stage'];
};

/**
 * Client-side list controller. Groups entries by ISO week (Mon–Sun),
 * shows a subtotal per week, and handles inline create + edit forms.
 */
export function TimeEntryListClient({
  projects,
  entries,
  activeProjectFilter
}: {
  projects: Project[];
  entries: Entry[];
  activeProjectFilter: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [coachingEntry, setCoachingEntry] = useState<Entry | null>(null);

  // Group entries by ISO week-key "YYYY-Wnn".
  const weeks = useMemo(() => groupByWeek(entries), [entries]);

  const activeProject = activeProjectFilter
    ? projects.find((p) => p.id === activeProjectFilter)
    : null;

  function onChangeFilter(projectId: string) {
    const params = new URLSearchParams(searchParams);
    if (projectId) params.set('project', projectId);
    else params.delete('project');
    router.push(`/time${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-ink-3">{t('time.filter_by_project')}:</span>
          <select
            value={activeProjectFilter ?? ''}
            onChange={(e) => onChangeFilter(e.target.value)}
            className="px-2 py-1 border border-line rounded-md bg-surface text-[12px] focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">{t('time.filter_all_projects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} · {p.title}
              </option>
            ))}
          </select>
        </div>
        {!creating && (
          <button
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
            className="btn btn-primary text-[13px]"
          >
            {t('time.new_cta')}
          </button>
        )}
      </div>

      {creating && (
        <TimeEntryForm
          mode="create"
          projects={
            activeProject ? projects.filter((p) => p.id === activeProject.id) : projects
          }
          onClose={() => setCreating(false)}
        />
      )}

      {weeks.length === 0 ? (
        <div className="card text-[13px] text-ink-2">
          {t('time.empty_doctrine')}
        </div>
      ) : (
        <div className="space-y-6">
          {weeks.map(({ weekKey, weekLabel, entries, total }) => (
            <section key={weekKey}>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="text-[12px] uppercase tracking-wider text-ink-3">
                  {weekLabel}
                </h2>
                <span className="text-[12px] text-ink-3">
                  {t('time.week_total', { hours: total.toFixed(2) })}
                </span>
              </div>
              <ul className="border border-line rounded-md overflow-hidden divide-y divide-line">
                {entries.map((e) => (
                  <li key={e.id}>
                    {editingId === e.id ? (
                      <div className="p-3">
                        <TimeEntryForm
                          mode="edit"
                          projects={projects}
                          initial={{
                            id: e.id,
                            projectId: e.projectId,
                            workDate: e.workDate,
                            hours: e.hours,
                            stage: e.stage,
                            category: e.category,
                            note: e.note,
                            commercialReason: e.commercialReason,
                            customerVisibleSummary: e.customerVisibleSummary,
                            chargeabilityStatus: e.chargeabilityStatus,
                            nonChargeableReason: e.nonChargeableReason,
                            linkedObjectType: e.linkedObjectType,
                            linkedObjectId: e.linkedObjectId,
                            reportable: e.reportable
                          }}
                          onClose={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <EntryRow
                        e={e}
                        onEdit={() => {
                          setEditingId(e.id);
                          setCreating(false);
                        }}
                        onCoach={() => {
                          setCoachingEntry(e);
                          setEditingId(null);
                          setCreating(false);
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <CoachWizard
        open={coachingEntry !== null}
        onClose={() => setCoachingEntry(null)}
        projectId={coachingEntry?.projectId ?? ''}
        projectStage={
          (coachingEntry?.currentStage ?? 'concept') as
            | 'brief'
            | 'concept'
            | 'design_development'
            | 'specification'
            | 'procurement_production'
            | 'installation'
            | 'handover'
        }
        initialModule="general"
        initialLinkedObjectType="time_entry"
        initialSourceId={coachingEntry?.id}
      />
    </div>
  );
}

function EntryRow({
  e,
  onEdit,
  onCoach
}: {
  e: Entry;
  onEdit: () => void;
  onCoach: () => void;
}) {
  const t = useTranslations();
  const missingReason = e.note.length > 0 && e.commercialReason.length === 0;
  return (
    <div
      className="px-3 py-2.5 flex items-start gap-3 hover:bg-bg/40 cursor-pointer"
      onClick={onEdit}
    >
      <div className="w-[80px] shrink-0 text-[12px] text-ink-3">
        {formatLocalDate(e.workDate)}
      </div>
      <div className="w-[64px] shrink-0 text-[13px] font-semibold tabular-nums">
        {Number(e.hours).toFixed(2)} h
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/projects/${e.projectId}`}
            className="ref hover:underline text-[12px]"
            onClick={(ev) => ev.stopPropagation()}
          >
            {e.projectRef}
          </Link>
          <span className="text-[12px] text-ink-2 truncate">{e.projectTitle}</span>
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">
            {t(`time.category.${e.category}`)}
          </span>
          {e.chargeabilityStatus && (
            <ChargeabilityPill status={e.chargeabilityStatus as string} />
          )}
          {!e.reportable && (
            <span className="text-[10px] text-ink-3">{t('time.not_reportable')}</span>
          )}
        </div>
        {e.customerVisibleSummary ? (
          <div className="text-[12px] text-ink mt-0.5 truncate">
            {e.customerVisibleSummary}
          </div>
        ) : e.commercialReason ? (
          <div className="text-[12px] text-ink-2 mt-0.5 truncate">
            {e.commercialReason}
          </div>
        ) : e.note ? (
          <div className="text-[12px] text-ink-2 mt-0.5 truncate">{e.note}</div>
        ) : (
          <div className="text-[12px] text-ink-3 italic mt-0.5">
            {t('time.no_note')}
          </div>
        )}
        {missingReason && (
          <div className="text-[10px] text-warn mt-0.5">
            {t('time.coach.missing_reason_inline')}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          onCoach();
        }}
        className="text-[10px] text-brand hover:underline shrink-0 self-center px-2 py-1"
        title={t('coach.row_cta_title')}
      >
        ◐ {t('coach.row_cta')}
      </button>
    </div>
  );
}

function ChargeabilityPill({ status }: { status: string }) {
  const t = useTranslations();
  const tone: string =
    status === 'included'
      ? 'text-ok bg-ok-soft'
      : status === 'chargeable'
        ? 'text-accent bg-accent-soft'
        : status === 'change'
          ? 'text-info bg-info-soft'
          : status === 'goodwill'
            ? 'text-warn bg-warn-soft'
            : status === 'internal_admin'
              ? 'text-ink-3 bg-bg'
              : 'text-ink-3 bg-bg';
  return (
    <span className={`pill ${tone} text-[10px]`}>
      {t(`time.chargeability.${status}`)}
    </span>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

type WeekBucket = {
  weekKey: string;
  weekLabel: string;
  entries: Entry[];
  total: number;
};

function groupByWeek(entries: Entry[]): WeekBucket[] {
  const map = new Map<string, WeekBucket>();
  for (const e of entries) {
    const d = parseLocalDate(e.workDate);
    const monday = startOfIsoWeek(d);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const weekKey = `${d.getFullYear()}-W${String(isoWeekNumber(d)).padStart(2, '0')}`;
    const label = `${formatLocalDateObj(monday)} – ${formatLocalDateObj(sunday)}`;
    if (!map.has(weekKey)) {
      map.set(weekKey, { weekKey, weekLabel: label, entries: [], total: 0 });
    }
    const bucket = map.get(weekKey)!;
    bucket.entries.push(e);
    bucket.total += Number(e.hours);
  }
  // Sort buckets by weekKey desc (newest first).
  return Array.from(map.values()).sort((a, b) =>
    a.weekKey < b.weekKey ? 1 : -1
  );
}

function parseLocalDate(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function startOfIsoWeek(d: Date): Date {
  // Monday = 1, Sunday = 7 (in ISO).
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  return monday;
}

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatLocalDate(yyyymmdd: string): string {
  return formatLocalDateObj(parseLocalDate(yyyymmdd));
}

function formatLocalDateObj(d: Date): string {
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short'
  });
}
