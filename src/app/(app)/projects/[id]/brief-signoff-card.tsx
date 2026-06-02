import { desc, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db, projects, projectBriefSignoffs } from '@/db';
import { formatDate } from '@/lib/utils';

/**
 * Staff-side card showing customer brief sign-off status + history.
 *
 * Latest sign-off by signed_off_at is the operative one. We show:
 *   - A status pill: pending / signed (current) / signed (brief drifted)
 *   - Most recent sign-off timestamp + truncated description snapshot
 *   - History list (last N rows) so staff can see the audit trail
 *
 * "Drifted" means staff edited the brief AFTER the latest sign-off —
 * the customer's recorded consent no longer matches what the brief
 * actually says. UI nudges staff to request a fresh sign-off.
 *
 * No write surface here — staff cannot sign off on the customer's
 * behalf. The sign-off action lives on the customer portal only.
 */

const HISTORY_LIMIT = 5;

type SnapshotShape = {
  description?: string;
  fablabRole?: string;
  projectRef?: string;
  title?: string;
};

function asSnapshot(raw: unknown): SnapshotShape | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as SnapshotShape;
}

function signoffMatches(
  snapshot: unknown,
  currentDescription: string | null,
  currentRole: string | null
): boolean {
  const s = asSnapshot(snapshot);
  if (!s) return false;
  const snapDesc = typeof s.description === 'string' ? s.description : '';
  const snapRole = typeof s.fablabRole === 'string' ? s.fablabRole : '';
  return (
    snapDesc === (currentDescription ?? '') &&
    snapRole === (currentRole ?? '')
  );
}

export async function BriefSignoffCard({ projectId }: { projectId: string }) {
  const t = await getTranslations();

  const [proj] = await db
    .select({
      description: projects.description,
      fablabRole: projects.fablabRole
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const rows = await db
    .select({
      id: projectBriefSignoffs.id,
      signedOffBy: projectBriefSignoffs.signedOffBy,
      signedOffAt: projectBriefSignoffs.signedOffAt,
      briefSnapshot: projectBriefSignoffs.briefSnapshot,
      userAgent: projectBriefSignoffs.userAgent,
      ip: projectBriefSignoffs.ip
    })
    .from(projectBriefSignoffs)
    .where(eq(projectBriefSignoffs.projectId, projectId))
    .orderBy(desc(projectBriefSignoffs.signedOffAt))
    .limit(HISTORY_LIMIT);

  const latest = rows[0];
  const status: 'none' | 'current' | 'drifted' = !latest
    ? 'none'
    : signoffMatches(
          latest.briefSnapshot,
          proj?.description ?? null,
          proj?.fablabRole ?? null
        )
      ? 'current'
      : 'drifted';

  return (
    <div
      className={`card ${
        status === 'current'
          ? 'border-l-2 border-ok'
          : status === 'drifted'
            ? 'border-l-2 border-warn'
            : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="card-title">{t('brief_signoff_staff.title')}</h3>
        <StatusPill status={status} t={t} />
      </div>

      {status === 'none' && (
        <p className="text-[12px] text-ink-2 leading-snug">
          {t('brief_signoff_staff.none_body')}
        </p>
      )}
      {status === 'current' && latest && (
        <p className="text-[12px] text-ink-2 leading-snug">
          {t('brief_signoff_staff.current_body', {
            date: formatDate(latest.signedOffAt)
          })}
        </p>
      )}
      {status === 'drifted' && latest && (
        <p className="text-[12px] text-ink-2 leading-snug">
          {t('brief_signoff_staff.drifted_body', {
            date: formatDate(latest.signedOffAt)
          })}
        </p>
      )}

      {rows.length > 0 && (
        <details className="mt-3">
          <summary className="text-[11px] text-ink-3 cursor-pointer hover:text-ink">
            {t('brief_signoff_staff.history_toggle', { n: rows.length })}
          </summary>
          <ul className="mt-2 space-y-2">
            {rows.map((r) => {
              const snap = asSnapshot(r.briefSnapshot);
              const desc = snap?.description?.trim() ?? '';
              const preview =
                desc.length > 160 ? desc.slice(0, 160) + '…' : desc;
              return (
                <li
                  key={r.id}
                  className="border-l-2 border-line pl-3 text-[12px]"
                >
                  <div className="text-ink-2 mb-0.5">
                    {formatDate(r.signedOffAt)} ·{' '}
                    <span className="text-ink-3">
                      {t(`role.profile.${snap?.fablabRole ?? 'design_advisory_only'}`)}
                    </span>
                  </div>
                  {preview && (
                    <div className="text-ink whitespace-pre-wrap leading-snug">
                      {preview}
                    </div>
                  )}
                  {(r.userAgent || r.ip) && (
                    <div className="text-[10px] text-ink-3 mt-1">
                      {[r.ip, r.userAgent].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function StatusPill({
  status,
  t
}: {
  status: 'none' | 'current' | 'drifted';
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const colour =
    status === 'current'
      ? 'text-ok bg-ok-soft'
      : status === 'drifted'
        ? 'text-warn bg-warn-soft'
        : 'text-ink-3 bg-bg';
  return (
    <span className={`pill ${colour}`}>
      {t(`brief_signoff_staff.pill_${status}`)}
    </span>
  );
}
