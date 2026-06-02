'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

/**
 * Single-file download trigger for the staff Customer Uploads card.
 * Generates a 60s signed URL from the browser session and opens it
 * in a new tab. Kept tiny so the parent server component can stay
 * server-side.
 */
export function StaffCustomerUploadDownload({
  storagePath,
  filename
}: {
  storagePath: string;
  filename: string;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: signErr } = await supabase.storage
      .from('customer-uploads')
      .createSignedUrl(storagePath, 60);
    if (signErr || !data?.signedUrl) {
      setError(t('customer_uploads_staff.download_failed'));
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <div className="flex-1 min-w-0">
      <button
        onClick={onClick}
        className="text-ink hover:underline truncate text-left block max-w-full"
        title={filename}
      >
        {filename}
      </button>
      {error && <div className="text-[10px] text-warn">{error}</div>}
    </div>
  );
}
