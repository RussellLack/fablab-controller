'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BriefWizard, type IntakeContext } from '@/components/wizard/brief-wizard';

type FablabRole =
  | 'design_advisory_only'
  | 'design_and_specification'
  | 'procurement_support'
  | 'procurement_and_resale'
  | 'supplier_coordination'
  | 'delivery_coordination'
  | 'installation_coordination'
  | 'full_project_control';

/** Client-side launcher for the Brief wizard. */
export function BriefLauncher({
  projectId,
  currentDescription,
  currentRole,
  intake,
  scopeApprovalApproved
}: {
  projectId: string;
  currentDescription: string;
  currentRole: FablabRole;
  intake: IntakeContext | null;
  scopeApprovalApproved: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        {t('action.review_brief')}
      </button>
      <BriefWizard
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        currentDescription={currentDescription}
        currentRole={currentRole}
        intake={intake}
        scopeApprovalApproved={scopeApprovalApproved}
      />
    </>
  );
}
