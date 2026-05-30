import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

const TONE: Record<string, string> = {
  draft: 'text-ink-3 bg-bg',
  sent_for_approval: 'text-info bg-info-soft',
  approved: 'text-ok bg-ok-soft',
  approved_with_conditions: 'text-warn bg-warn-soft',
  rejected: 'text-danger bg-danger-soft',
  expired: 'text-danger bg-danger-soft',
  superseded: 'text-ink-3 bg-bg'
};

export function ApprovalPill({ status }: { status: string }) {
  const t = useTranslations();
  return (
    <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', TONE[status] ?? 'text-ink-3 bg-bg')}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {t(`approval.status.${status}`)}
    </span>
  );
}
