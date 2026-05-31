'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';
import {
  GATE_ORDER,
  GATE_NUMERAL,
  gateHref,
  type ProjectGates,
  type GateName,
  type GateState
} from '@/lib/project-gates';

/**
 * Linear stepper rendered at the top of every /projects/[id]/* page.
 *
 * Data is fetched server-side by the project layout (via getProjectGates)
 * and handed in as a prop. This component is `'use client'` only so it can
 * read the live pathname for active-state highlighting.
 *
 * Beneath the linear track, a smaller "transverse" row exposes
 * Approvals · Change Control · Risk · Finance · Reporting — modules that
 * run across the project lifecycle rather than in sequence.
 */

const STATE_BADGE: Record<GateState, string> = {
  done: '✓',
  in_progress: '●',
  locked: '⌀'
};

const STATE_CLASS: Record<GateState, string> = {
  done: 'border-ok text-ok bg-ok-soft',
  in_progress: 'border-accent text-accent bg-accent-soft',
  locked: 'border-line-strong text-ink-3 bg-bg'
};

const GATE_LABEL_KEY: Record<GateName, string> = {
  brief: 'tab.brief',
  scope: 'tab.scope',
  items: 'tab.items',
  procurement: 'tab.procurement',
  delivery: 'tab.delivery',
  handover: 'tab.handover'
};

type TransverseModule = {
  slug: string;
  labelKey: string;
  soon?: boolean;
};

const TRANSVERSE: TransverseModule[] = [
  { slug: 'approvals',      labelKey: 'tab.approvals' },
  { slug: 'change-control', labelKey: 'tab.change_control', soon: true },
  { slug: 'risk',           labelKey: 'tab.risk',           soon: true },
  { slug: 'finance',        labelKey: 'tab.finance' },
  // Element-list route reused as Phase 2 Reporting (per design doc table).
  { slug: 'element-list',   labelKey: 'tab.reporting' }
];

export function ProjectStepper({
  projectId,
  gates
}: {
  projectId: string;
  gates: ProjectGates;
}) {
  const t = useTranslations();
  const pathname = usePathname() ?? '';

  return (
    <div className="mb-4">
      {/* Linear track */}
      <div className="flex gap-1.5 flex-wrap mb-2">
        {GATE_ORDER.map((gate) => {
          const result = gates[gate];
          const href = gateHref(gate, projectId);
          const active = pathname === href;
          const countLabel =
            result.total != null && result.total > 0
              ? ` ${result.count ?? 0}/${result.total}`
              : '';

          return (
            <Link
              key={gate}
              href={href}
              className={cx(
                'flex items-center gap-2 px-3 py-2 rounded-md text-[13px] border',
                STATE_CLASS[result.state],
                active && 'ring-2 ring-ink',
                result.state === 'locked' && 'opacity-70'
              )}
              title={result.nextActionKey ? t(result.nextActionKey) : undefined}
            >
              <span className="text-[13px] tabular-nums">{GATE_NUMERAL[gate]}</span>
              <span className="font-medium">{t(GATE_LABEL_KEY[gate])}</span>
              <span className="text-[11px] opacity-80">
                {STATE_BADGE[result.state]}
                {countLabel}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Transverse track */}
      <div className="flex items-center gap-3 text-[12px] text-ink-2 border-t border-line pt-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-ink-3">
          {t('sidebar.transverse')}:
        </span>
        {TRANSVERSE.map((m, i) => {
          const href = `/projects/${projectId}/${m.slug}`;
          const isActive = pathname.startsWith(href);
          const className = cx(
            'inline-flex items-center gap-1',
            isActive && 'text-ink font-semibold',
            m.soon && 'text-ink-3 cursor-default'
          );
          return (
            <span key={m.slug} className="inline-flex items-center gap-3">
              {i > 0 && <span className="text-ink-3">·</span>}
              {m.soon ? (
                <span className={className}>
                  {t(m.labelKey)}{' '}
                  <span className="text-[10px] text-ink-3">
                    {t('sidebar.soon')}
                  </span>
                </span>
              ) : (
                <Link href={href} className={cx(className, 'hover:text-ink')}>
                  {t(m.labelKey)}
                </Link>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
