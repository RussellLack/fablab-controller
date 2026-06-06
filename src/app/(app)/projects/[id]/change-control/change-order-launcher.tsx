'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChangeOrderWizard } from '@/components/wizard/change-order-wizard';

/** Client-side launcher for the Change Order creation wizard. */
export function ChangeOrderLauncher({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        {t('change_order.new_cta')}
      </button>
      <ChangeOrderWizard
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
      />
    </>
  );
}
