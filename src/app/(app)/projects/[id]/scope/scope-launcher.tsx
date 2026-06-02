'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ScopeWizard } from '@/components/wizard/scope-wizard';

/** Client-side launcher for the Scope wizard. */
export function ScopeLauncher({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        {t('action.new_scope_version')}
      </button>
      <ScopeWizard open={open} onClose={() => setOpen(false)} projectId={projectId} />
    </>
  );
}
