import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';
import { STAGE_TO_MODULE } from '@/lib/stage-module-map';

const STAGES = [
  'brief', 'concept', 'design_development', 'specification',
  'procurement_production', 'installation', 'handover'
] as const;

type Stage = typeof STAGES[number];

/**
 * The 7-stage project lifecycle visual. `currentStage` highlights
 * the active step in accent.
 *
 * Each circle is a Link to its canonical module — clicking a stage
 * jumps to the surface where that stage's work happens. Closes the
 * loop between the two project navigation axes:
 *
 *   STAGE  (this component)  ←→  MODULE  (the bar above)
 *
 * The map STAGE_TO_MODULE is the single source of truth; same map
 * powers the active-stage cue on the module bar.
 */
export function StageFlow({
  currentStage,
  projectId
}: {
  currentStage: string;
  projectId: string;
}) {
  const t = useTranslations();
  const currentIdx = STAGES.indexOf(currentStage as Stage);
  return (
    <div className="flex items-start bg-surface border border-line rounded-lg p-4 overflow-x-auto">
      {STAGES.map((stage, idx) => {
        const done = currentIdx > idx;
        const current = currentIdx === idx;
        const moduleSlug = STAGE_TO_MODULE[stage];
        const href =
          moduleSlug === undefined
            ? null
            : moduleSlug === ''
            ? `/projects/${projectId}`
            : `/projects/${projectId}/${moduleSlug}`;

        const circle = (
          <div
            className={cx(
              'w-8 h-8 rounded-full border-2 grid place-items-center text-xs font-semibold transition-colors duration-75',
              done && 'bg-ink border-ink text-surface group-hover:bg-[#333]',
              // Current = brand (deep heritage red), not accent (bright urgency red).
              // Frees accent-red for transient problem overlays elsewhere on the page.
              current && 'bg-brand border-brand text-surface group-hover:bg-[#26120b]',
              !done && !current && 'bg-bg border-line text-ink-3 group-hover:border-line-strong group-hover:text-ink-2'
            )}
          >
            {done ? '✓' : idx + 1}
          </div>
        );

        const label = (
          <div className={cx(
            'mt-2 text-[11px] font-semibold text-center px-1 leading-tight transition-colors duration-75',
            current ? 'text-ink' : done ? 'text-ink' : 'text-ink-3 group-hover:text-ink-2'
          )}>
            {t(`stage.${stage}`)}
          </div>
        );

        return (
          <div key={stage} className="contents">
            <div className="flex-1 min-w-[90px] flex flex-col items-center">
              {href ? (
                <Link
                  href={href}
                  className="group flex flex-col items-center w-full cursor-pointer"
                  title={t('stage_flow.click_hint', { stage: t(`stage.${stage}`) })}
                >
                  {circle}
                  {label}
                </Link>
              ) : (
                <div className="flex flex-col items-center w-full">
                  {circle}
                  {label}
                </div>
              )}
            </div>
            {idx < STAGES.length - 1 && (
              <div className={cx('flex-none w-6 h-0.5 mt-4', done ? 'bg-ink' : 'bg-line')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
