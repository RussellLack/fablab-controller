'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  PoWizard,
  type CandidateVendor,
  type CandidateApproval
} from '@/components/wizard/po-wizard';

/** Client-side launcher for the PO wizard. */
export function PoLauncher({
  projectId,
  projectRef,
  defaultSiteAddress,
  candidates,
  approvals
}: {
  projectId: string;
  projectRef: string;
  defaultSiteAddress: string | null;
  candidates: CandidateVendor[];
  approvals: CandidateApproval[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={candidates.length === 0}
        className="btn btn-primary disabled:opacity-50"
        title={candidates.length === 0 ? t('po.no_candidates_body') : ''}
      >
        {t('action.new_po_guided')}
      </button>
      <PoWizard
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        projectRef={projectRef}
        defaultSiteAddress={defaultSiteAddress}
        candidates={candidates}
        approvals={approvals}
      />
    </>
  );
}
