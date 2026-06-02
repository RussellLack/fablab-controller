'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

/**
 * Customer-facing uploads on /portal/projects/[id].
 *
 * Mirrors the rfq-attachments pipeline:
 *   1. Browser uploads directly to Supabase Storage bucket
 *      `customer-uploads` at path
 *      `projects/{projectId}/customer/{uuid}-{filename}`
 *   2. POST /api/portal/projects/[id]/uploads with metadata creates the
 *      `project_customer_uploads` row. The API also verifies the caller
 *      has an active invitation for the project.
 *
 * Customers can only delete files they themselves uploaded — enforced
 * server-side. The X button is hidden on rows owned by someone else.
 */

export type CustomerUpload = {
  id: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  isMine: boolean;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches every other attachment surface.
const BUCKET = 'customer-uploads';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFilename(name: string): string {
  return name.replace(/[^\w\d.\-_]/g, '_').slice(0, 200);
}

export function CustomerUploads({
  projectId,
  initial
}: {
  projectId: string;
  initial: CustomerUpload[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          setError(t('portal_uploads.too_large', { name: file.name, max: '5 MB' }));
          continue;
        }
        const uuid =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const cleanName = safeFilename(file.name);
        const path = `projects/${projectId}/customer/${uuid}-${cleanName}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(`${file.name}: ${upErr.message}`);
          continue;
        }

        const res = await fetch(`/api/portal/projects/${projectId}/uploads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            storagePath: path,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size
          })
        });
        if (!res.ok) {
          const detail = await res.text();
          setError(`${file.name}: ${detail || 'metadata write failed'}`);
        }
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm(t('portal_uploads.confirm_delete'))) return;
    const res = await fetch(
      `/api/portal/projects/${projectId}/uploads?uploadId=${id}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      setError(t('portal_uploads.delete_failed'));
      return;
    }
    router.refresh();
  };

  const onDownload = async (att: CustomerUpload) => {
    const supabase = createClient();
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(att.storagePath, 60);
    if (signErr || !data?.signedUrl) {
      setError(t('portal_uploads.download_failed'));
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="card-title">{t('portal_uploads.title')}</h3>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="btn btn-ghost text-[12px]"
        >
          {uploading ? t('portal_uploads.uploading') : t('portal_uploads.attach')}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="hidden"
        />
      </div>

      <p className="text-[12px] text-ink-2 mb-3 leading-snug">
        {t('portal_uploads.help')}
      </p>

      {error && <div className="text-[12px] text-warn mb-2">{error}</div>}

      {initial.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic">
          {t('portal_uploads.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {initial.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 text-[13px] py-1.5 border-b border-line last:border-0"
            >
              <button
                onClick={() => onDownload(att)}
                className="text-ink hover:underline truncate flex-1 text-left"
                title={att.filename}
              >
                {att.filename}
              </button>
              <span className="text-[11px] text-ink-3">
                {formatBytes(att.sizeBytes)}
              </span>
              {att.isMine && (
                <button
                  onClick={() => onDelete(att.id)}
                  className="text-[11px] text-ink-3 hover:text-warn px-1.5 py-0.5"
                  title={t('portal_uploads.delete')}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
