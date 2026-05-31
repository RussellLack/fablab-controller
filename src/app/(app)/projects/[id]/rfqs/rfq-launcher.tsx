'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RfqWizard, type WizardItem, type WizardVendor } from '@/components/wizard/rfq-wizard';

/** Client-side launcher for the RFQ wizard. */
export function RfqLauncher({
  projectId,
  projectRef,
  items,
  vendors
}: {
  projectId: string;
  projectRef: string;
  items: WizardItem[];
  vendors: WizardVendor[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        {t('action.new_rfq_guided')}
      </button>
      <RfqWizard
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        projectRef={projectRef}
        items={items}
        vendors={vendors}
      />
    </>
  );
}
