'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cx } from '@/lib/utils';

/**
 * RFQ attachments — list, upload, delete.
 *
 * Upload pipeline mirrors the Wave 5 item-image pattern:
 *   1. Browser uploads the file directly to Supabase Storage bucket
 *      `rfq-attachments` at path
 *      `projects/{projectId}/rfqs/{rfqId}/{uuid}-{filename}`
 *   2. POST /api/rfqs/[rfqId]/attachments with metadata to create the DB row
 *
 * Files appear in the list with a download link (signed URL) and a delete
 * button. The same list feeds the Gmail send action — at send time the
 * server fetches each storage object and embeds it as a multipart/mixed
 * part.
 */

export type RfqAttachment = {
  id: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file
const BUCKET = 'rfq-attachments';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFilename(name: string): string {
  return name.replace(/[^\w\d.\-_]/g, '_').slice(0, 200);
}

export function RfqAttachments({
  projectId,
  rfqId,
  initial,
  canEdit
}: {
  projectId: string;
  rfqId: string;
  initial: RfqAttachment[];
  /** False once the RFQ is past draft state — attachments become read-only. */
  canEdit: boolean;
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
          setError(t('rfq_attachments.too_large', { name: file.name, max: '5 MB' }));
          continue;
        }
        const uuid =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const cleanName = safeFilename(file.name);
        const path = `projects/${projectId}/rfqs/${rfqId}/${uuid}-${cleanName}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(`${file.name}: ${upErr.message}`);
          continue;
        }

        const res = await fetch(`/api/rfqs/${rfqId}/attachments`, {
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
    if (!confirm(t('rfq_attachments.confirm_delete'))) return;
    const res = await fetch(`/api/rfqs/${rfqId}/attachments?attachmentId=${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      setError(t('rfq_attachments.delete_failed'));
      return;
    }
    router.refresh();
  };

  const onDownload = async (att: RfqAttachment) => {
    const supabase = createClient();
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(att.storagePath, 60); // 60s — just enough for the click
    if (signErr || !data?.signedUrl) {
      setError(t('rfq_attachments.download_failed'));
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="card-title">{t('rfq_attachments.title')}</h3>
        {canEdit && (
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="btn btn-ghost text-[12px]"
          >
            {uploading ? t('rfq_attachments.uploading') : t('rfq_attachments.attach')}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {error && (
        <div className="text-[12px] text-danger mb-2">{error}</div>
      )}

      {initial.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic">
          {t('rfq_attachments.empty')}
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
              {canEdit && (
                <button
                  onClick={() => onDelete(att.id)}
                  className={cx(
                    'text-[11px] text-ink-3 hover:text-danger px-1.5 py-0.5'
                  )}
                  title={t('rfq_attachments.delete')}
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
