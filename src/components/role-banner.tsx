import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';

const HIGH_LIABILITY: ReadonlyArray<string> = ['procurement_and_resale', 'full_project_control'];

/**
 * Surfaces the Fablab Role Profile on Project header (Wave 1).
 * Different visual treatment depending on liability level.
 */
export function RoleBanner({ role }: { role: string }) {
  const t = useTranslations();
  const high = HIGH_LIABILITY.includes(role);
  return (
    <div
      className={cx(
        'flex gap-3 items-start rounded-md p-3 mb-4 border-l-4',
        high ? 'bg-danger-soft border-danger text-danger' : 'bg-warn-soft border-warn text-warn'
      )}
    >
      <span className="text-lg leading-none">⚠</span>
      <div className="text-[13px]">
        <strong className="block mb-0.5">{t(`role.profile.${role}`)}</strong>
        <span>{t(`role.implication.${role}`)}</span>
      </div>
    </div>
  );
}
