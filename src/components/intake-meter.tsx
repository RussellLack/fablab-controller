import { cx } from '@/lib/utils';

/** Completeness meter — same visual as the wireframe (danger/warn/ok by pct). */
export function IntakeMeter({ complete, total, percent }: { complete: number; total: number; percent: number }) {
  const band = percent === 100 ? 'ok' : percent >= 50 ? 'warn' : 'danger';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden border border-line">
        <div
          className={cx(
            'h-full transition-all',
            band === 'ok' && 'bg-ok',
            band === 'warn' && 'bg-warn',
            band === 'danger' && 'bg-danger'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-ink-2 whitespace-nowrap">
        {complete} / {total}
      </span>
    </div>
  );
}
