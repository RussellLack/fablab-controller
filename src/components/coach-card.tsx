import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Recommendation, Severity } from '@/server/queries/coach-health';

/**
 * Shared inline Coach card — server component.
 *
 * Renders a project's open findings on the surface where they're
 * actionable (Brief / Scope / PO / Delivery / etc.). Empty `items`
 * → renders nothing (the parent surface stays quiet when there's
 * nothing to nudge).
 *
 * Doctrine:
 *   - Title channels `00-` §22-style framing ("Coach: ...").
 *   - Each row is observation + why-it-matters + one-click action.
 *   - Severity drives the pill colour, never the prose tone — the
 *     copy stays calm regardless. The card itself stays small;
 *     it's prompting, not blocking.
 */
export async function CoachCard({
  items,
  variant = 'inline'
}: {
  items: Recommendation[];
  /** `inline` is for embedding on a module page; `compact` for tight
   *  surfaces like the PO detail sidebar. */
  variant?: 'inline' | 'compact';
}) {
  if (items.length === 0) return null;
  const t = await getTranslations();

  return (
    <div
      className={`card border-l-2 border-brand ${
        variant === 'compact' ? 'py-3' : ''
      }`}
    >
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <h3 className="card-title text-brand">
          ◐ {t('coach_card.title')}
        </h3>
        <span className="text-[11px] text-ink-3">
          {t('coach_card.subtitle', { count: items.length })}
        </span>
      </div>
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id}>
            <CoachRow rec={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function CoachRow({ rec }: { rec: Recommendation }) {
  const t = await getTranslations();
  return (
    <div className="flex items-start gap-3">
      <SeverityDot severity={rec.severity} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug">
          {t(rec.observationKey, rec.observationParams as never)}
        </div>
        <div className="text-[11px] text-ink-3 mt-0.5 leading-snug">
          {t(`${rec.ruleKey}.why`)}
        </div>
      </div>
      <Link
        href={rec.actionHref}
        className="btn btn-ghost text-[11px] shrink-0 self-center py-1 px-2 whitespace-nowrap"
      >
        {t(rec.actionLabelKey)} →
      </Link>
    </div>
  );
}

function SeverityDot({ severity }: { severity: Severity }) {
  const colour =
    severity === 'critical'
      ? 'bg-danger'
      : severity === 'high'
        ? 'bg-warn'
        : severity === 'medium'
          ? 'bg-info'
          : 'bg-ok';
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${colour}`}
      aria-label={severity}
    />
  );
}
