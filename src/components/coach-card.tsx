import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Recommendation } from '@/server/queries/coach-health';

/**
 * Inline Coach card — server component, designed to feel like a
 * marginalia note rather than an alert.
 *
 * Visual doctrine:
 *   - Container is a soft cream fill (`brand-soft` at low opacity) —
 *     no hard border, no severity colour.
 *   - Header reads "COACH" in small uppercase — like a magazine
 *     sidebar label.
 *   - Each rec is one calm sentence + action link inline, with the
 *     "why it matters" line always visible directly below (Russell's
 *     preference: keep the doctrine framing front-and-centre).
 *   - Severity drives ordering only — the rules engine has already
 *     returned them sorted; the card doesn't shout it.
 *   - Empty input → renders nothing.
 *
 * The card is the *quiet* surface. The Project Coach dashboard
 * (/projects/[id]/coach) is the loud surface where ack/dismiss
 * lifecycle lives.
 */
export async function CoachCard({
  items
}: {
  items: Recommendation[];
}) {
  if (items.length === 0) return null;
  const t = await getTranslations();

  return (
    <div className="bg-brand-soft/30 rounded-md p-5 mb-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-3">
        {t('coach_card.title')}
      </div>
      <ul className="space-y-4">
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
    <div className="text-[13px] leading-snug">
      <div>
        <span className="text-ink">
          {t(rec.observationKey, rec.observationParams as never)}
        </span>
        {' '}
        <Link
          href={rec.actionHref}
          className="text-brand hover:underline whitespace-nowrap"
        >
          {t(rec.actionLabelKey)} →
        </Link>
      </div>
      <div className="text-[11px] text-ink-3 mt-0.5 leading-snug">
        {t(`${rec.ruleKey}.why`)}
      </div>
    </div>
  );
}
