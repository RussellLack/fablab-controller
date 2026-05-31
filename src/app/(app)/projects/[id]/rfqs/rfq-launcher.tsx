'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RfqWizard, type WizardItem, type WizardVendor } from '@/components/wizard/rfq-wizard';

/** Client-side launcher for the RFQ wizard. */
export function RfqLauncher({
  projectId,
  projectRef,
  projectTitle,
  deliveryCountry,
  items,
  vendors
}: {
  projectId: string;
  projectRef: string;
  projectTitle: string;
  deliveryCountry: string | null;
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
        projectTitle={projectTitle}
        deliveryCountry={deliveryCountry}
        items={items}
        vendors={vendors}
      />
    </>
  );
}
