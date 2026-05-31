import { getTranslations } from 'next-intl/server';
import {
  getProjectGates,
  type GateName
} from '@/server/queries/project-gates';

/**
 * Banner that prompts the user with the next concrete action for a given
 * gate on a project. Renders nothing if the gate is already done (or if no
 * `nextActionKey` is set).
 *
 * Drop it at the top of any linear-step page:
 *
 *     <NextActionBanner projectId={p.id} gate="items" />
 */
export async function NextActionBanner({
  projectId,
  gate
}: {
  projectId: string;
  gate: GateName;
}) {
  const gates = await getProjectGates(projectId);
  const result = gates[gate];
  if (result.state === 'done' || !result.nextActionKey) return null;
  const t = await getTranslations();

  const tone =
    result.state === 'locked'
      ? 'bg-bg border-line-strong text-ink-2'
      : 'bg-accent-soft border-accent text-accent';

  return (
    <div
      className={`border rounded-lg px-3.5 py-2.5 mb-4 text-[13px] ${tone}`}
    >
      <span className="text-[11px] uppercase tracking-wider font-bold mr-2">
        {t('gate.whats_next')}
      </span>
      {t(result.nextActionKey)}
    </div>
  );
}
