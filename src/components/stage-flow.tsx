import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

const STAGES = [
  'brief', 'concept', 'design_development', 'specification',
  'procurement_production', 'installation', 'handover'
] as const;

type Stage = typeof STAGES[number];

/**
 * The 7-stage project lifecycle visual (Wave 1).
 * `currentStage` highlights the active step in accent.
 */
export function StageFlow({ currentStage }: { currentStage: string }) {
  const t = useTranslations();
  const currentIdx = STAGES.indexOf(currentStage as Stage);
  return (
    <div className="flex items-start bg-surface border border-line rounded-lg p-4 overflow-x-auto">
      {STAGES.map((stage, idx) => {
        const done = currentIdx > idx;
        const current = currentIdx === idx;
        return (
          <div key={stage} className="contents">
            <div className="flex-1 min-w-[90px] flex flex-col items-center">
              <div
                className={cx(
                  'w-8 h-8 rounded-full border-2 grid place-items-center text-xs font-semibold',
                  done && 'bg-ink border-ink text-surface',
                  current && 'bg-accent border-accent text-white',
                  !done && !current && 'bg-bg border-line text-ink-3'
                )}
              >
                {done ? '✓' : idx + 1}
              </div>
              <div className="mt-2 text-[11px] font-semibold text-center px-1 leading-tight">
                {t(`stage.${stage}`)}
              </div>
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
