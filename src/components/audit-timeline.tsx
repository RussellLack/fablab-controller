import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { eq, and, desc } from 'drizzle-orm';
import { db, auditLogs, users } from '@/db';
import { formatDate } from '@/lib/utils';

/**
 * Audit timeline — server component used by /clients/[id]/history,
 * /vendors/[id]/history, /projects/[id]/history.
 *
 * Reads from the existing `auditLogs` table (entity_type + entity_id
 * filter), joined to users for the actor name. Renders one row per
 * change, latest first, with a per-field diff. Each diff line shows
 * the field name + old value → new value, formatted for human
 * scanning.
 *
 * Each entity type passes its own backHref + labelKey so we can
 * reuse the chrome across pages.
 */

type DiffMap = Record<string, unknown>;

type LogEntry = {
  id: string;
  action: string;
  before: DiffMap | null;
  after: DiffMap | null;
  occurredAt: Date;
  actorName: string | null;
};

async function getEntries(entityType: string, entityId: string): Promise<LogEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        before: auditLogs.before,
        after: auditLogs.after,
        occurredAt: auditLogs.occurredAt,
        actorName: users.name
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(500);
    return rows as LogEntry[];
  } catch {
    return [];
  }
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export async function AuditTimeline({
  entityType,
  entityId,
  backHref,
  backLabel,
  entityName
}: {
  entityType: 'client' | 'vendor' | 'project';
  entityId: string;
  backHref: string;
  backLabel: string;
  entityName: string;
}) {
  const entries = await getEntries(entityType, entityId);
  const t = await getTranslations();

  return (
    <>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-3"
      >
        ← {backLabel}
      </Link>

      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tighter">
          {t('audit.title')}
        </h1>
        <p className="text-ink-2 text-[13px] mt-1">
          {entityName} · {t('audit.count', { n: entries.length })}
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="card text-ink-2 text-[13px]">{t('audit.empty')}</div>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => {
            const beforeMap = (entry.before ?? {}) as DiffMap;
            const afterMap = (entry.after ?? {}) as DiffMap;
            // Union of keys so deletions (only-in-before) and creations
            // (only-in-after) both render. The action-writer pipelines
            // normally include the same keys on both sides, but the
            // union is the defensive read shape.
            const keys = Array.from(
              new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])
            );
            return (
              <li key={entry.id} className="card">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <div className="text-[13px]">
                    <span className="font-semibold">
                      {entry.actorName ?? t('audit.unknown_actor')}
                    </span>
                    <span className="text-ink-3 ml-1.5">
                      · {t(`audit.action.${entry.action}`)}
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-3 font-mono">
                    {formatDate(entry.occurredAt)}
                    {' '}
                    {entry.occurredAt.toISOString().slice(11, 16)} UTC
                  </span>
                </div>
                <div className="space-y-1 text-[12.5px]">
                  {keys.map((key) => {
                    const b = beforeMap[key];
                    const a = afterMap[key];
                    return (
                      <div key={key} className="flex items-start gap-2">
                        <span className="text-ink-3 w-40 shrink-0 font-mono text-[11px]">
                          {key}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="line-through text-danger/70">
                            {formatVal(b)}
                          </span>
                          <span className="mx-1.5 text-ink-3">→</span>
                          <span className="text-ok">{formatVal(a)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
