'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CoachWizard } from '@/components/wizard/coach-wizard';

type ProjectStage =
  | 'brief'
  | 'concept'
  | 'design_development'
  | 'specification'
  | 'procurement_production'
  | 'installation'
  | 'handover';

/**
 * Project Coach drawer launcher — mounted in the project header.
 *
 * Renders a small "📋 Coach" button. Clicking opens the Project
 * Coach wizard, pre-filled with the project's id and current stage.
 * Optional initial module / linked-object props pass the current
 * page's context through so the wizard's Step 1 detection is more
 * specific than just "general".
 */
export function CoachLauncher({
  projectId,
  projectStage,
  initialModule,
  initialLinkedObjectType,
  initialSourceId
}: {
  projectId: string;
  projectStage: ProjectStage;
  initialModule?: string;
  initialLinkedObjectType?:
    | 'brief'
    | 'scope'
    | 'item'
    | 'package'
    | 'approval'
    | 'rfq'
    | 'quote'
    | 'purchase_order'
    | 'change_order'
    | 'customer_comment'
    | 'customer_upload'
    | 'time_entry';
  initialSourceId?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-ghost text-[12px] gap-1.5"
        title={t('coach.launcher_title')}
      >
        <span className="text-brand">◐</span>
        {t('coach.launcher_cta')}
      </button>
      <CoachWizard
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        projectStage={projectStage}
        initialModule={initialModule}
        initialLinkedObjectType={initialLinkedObjectType}
        initialSourceId={initialSourceId}
      />
    </>
  );
}
