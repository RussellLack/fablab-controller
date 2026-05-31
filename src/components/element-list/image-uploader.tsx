'use client';

/**
 * ImageUploader — client-side image pipeline for item product photos.
 *
 * Three steps, all in-browser, zero per-image cost:
 *   1. User drops / picks a file (5 MB hard limit, jpg/png/webp)
 *   2. @imgly/background-removal produces a transparent PNG (WASM, ~30 MB
 *      model cached after first use)
 *   3. Canvas generates a 250×250 square thumbnail
 *
 * All three blobs upload directly to Supabase Storage (bucket: item-images)
 * at `projects/{projectId}/items/{itemId}/{kind}.{ext}`. After upload, POST
 * to /api/items/[itemId]/images to create the DB row + set primary image.
 *
 * No server-side image processing — model runs locally, fits the cost rule.
 */

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Step = 'idle' | 'uploaded' | 'processing' | 'thumbnailing' | 'uploading' | 'done' | 'error';

const MAX_BYTES = 5 * 1024 * 1024;          // 5 MB (v7 spec)
const MAX_DIMENSION = 4000;                 // px, longest edge — auto-downscale beyond
const PROCESSED_MAX = 1500;                 // px, processed PNG max longest edge
const THUMB_SIZE = 250;                     // px square
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export function ImageUploader({
  projectId,
  itemId,
  hasExistingImage = false
}: {
  projectId: string;
  itemId: string;
  hasExistingImage?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [sizeKb, setSizeKb] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [skipBgRemoval, setSkipBgRemoval] = useState(false);

  function reset() {
    setStep('idle');
    setError(null);
    setFilename(null);
    setSizeKb(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(file: File) {
    reset();

    // 1) Validate
    if (!ACCEPTED_MIME.includes(file.type)) {
      setError(`Unsupported file type. Use ${ACCEPTED_MIME.map(m => m.split('/')[1]).join(', ')}.`);
      setStep('error');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File is ${Math.round(file.size / 1024 / 1024)} MB — max ${MAX_BYTES / 1024 / 1024} MB.`);
      setStep('error');
      return;
    }

    setFilename(file.name);
    setSizeKb(Math.round(file.size / 1024));
    setStep('uploaded');

    try {
      // 2) Background removal (in browser via @imgly/background-removal)
      let processedBlob: Blob | null = null;
      let backgroundRemoved = false;
      if (!skipBgRemoval) {
        setStep('processing');
        const { removeBackground } = await import('@imgly/background-removal');
        processedBlob = await removeBackground(file);
        backgroundRemoved = true;
      }

      // 3) Thumbnail (Canvas, 250×250 square crop)
      setStep('thumbnailing');
      const source = processedBlob ?? file;
      const thumbBlob = await makeSquareThumbnail(source, THUMB_SIZE);

      // Also enforce PROCESSED_MAX downscale if needed (when bg-removal isn't
      // applied OR when the model returned an image larger than our budget)
      const processedDownscaled = processedBlob
        ? await downscaleIfNeeded(processedBlob, PROCESSED_MAX)
        : null;

      // Original dimensions for metadata (read off a probe Image)
      const dims = await readDimensions(file);

      // 4) Upload three blobs to Supabase Storage
      setStep('uploading');
      const supabase = createClient();
      const basePath = `projects/${projectId}/items/${itemId}`;
      const extOriginal = mimeToExt(file.type);

      const originalPath = `${basePath}/original-${Date.now()}.${extOriginal}`;
      const { error: e1 } = await supabase.storage
        .from('item-images').upload(originalPath, file, { upsert: true, contentType: file.type });
      if (e1) throw e1;

      let processedPath: string | null = null;
      if (processedDownscaled) {
        processedPath = `${basePath}/processed-${Date.now()}.png`;
        const { error: e2 } = await supabase.storage
          .from('item-images').upload(processedPath, processedDownscaled, { upsert: true, contentType: 'image/png' });
        if (e2) throw e2;
      }

      const thumbPath = `${basePath}/thumb-${Date.now()}.png`;
      const { error: e3 } = await supabase.storage
        .from('item-images').upload(thumbPath, thumbBlob, { upsert: true, contentType: 'image/png' });
      if (e3) throw e3;

      // 5) Resolve public URLs (bucket is public-read)
      const originalUrl = supabase.storage.from('item-images').getPublicUrl(originalPath).data.publicUrl;
      const processedUrl = processedPath
        ? supabase.storage.from('item-images').getPublicUrl(processedPath).data.publicUrl
        : null;
      const thumbUrl = supabase.storage.from('item-images').getPublicUrl(thumbPath).data.publicUrl;

      // 6) POST to API to create DB row + set primary
      const res = await fetch(`/api/items/${itemId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalBlobUri: originalUrl,
          processedBlobUri: processedUrl,
          thumbnailBlobUri: thumbUrl,
          originalMime: file.type,
          originalBytes: file.size,
          processedBytes: processedDownscaled?.size ?? null,
          widthPx: dims?.width ?? null,
          heightPx: dims?.height ?? null,
          backgroundRemoved,
          setAsPrimary: true
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Upload API returned ${res.status}`);
      }

      setStep('done');
      router.refresh();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Upload failed');
      setStep('error');
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold">Product image</h3>
        <p className="text-[12px] text-ink-3 mt-0.5">
          Drag an image or click to pick. Max 5 MB, JPG/PNG/WebP. Background removal runs in your browser — no data leaves your device.
        </p>
      </div>

      {/* Drop zone */}
      <label
        htmlFor={`upload-${itemId}`}
        onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-accent bg-accent-soft' : 'border-line-strong bg-bg hover:bg-surface'
        }`}
      >
        <input
          ref={fileRef}
          id={`upload-${itemId}`}
          type="file"
          accept={ACCEPTED_MIME.join(',')}
          className="sr-only"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="text-[24px] mb-1">📷</div>
        <div className="text-[13px] font-semibold">
          {step === 'idle' ? (hasExistingImage ? 'Replace image' : 'Choose or drop an image') : (filename ?? '—')}
        </div>
        {sizeKb !== null && (
          <div className="text-[11px] text-ink-3 mt-0.5">{sizeKb.toLocaleString()} KB</div>
        )}
      </label>

      {/* Three-step strip */}
      {step !== 'idle' && step !== 'error' && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Step label="Uploaded" active={step === 'uploaded'} done={['processing','thumbnailing','uploading','done'].includes(step)} />
          <Step label={skipBgRemoval ? 'Skipped removal' : 'Removing background'} active={step === 'processing'} done={['thumbnailing','uploading','done'].includes(step)} />
          <Step label="Saved" active={step === 'uploading' || step === 'thumbnailing'} done={step === 'done'} />
        </div>
      )}

      {step === 'error' && error && (
        <div className="mt-4 rounded border border-danger/30 bg-danger-soft text-danger px-3 py-2 text-[12px]">
          {error}
        </div>
      )}

      {step === 'done' && (
        <div className="mt-4 rounded border border-ok/30 bg-ok-soft text-ok px-3 py-2 text-[12px]">
          Image saved. Will appear on the Element List shortly.
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-[12px]">
        <label className="inline-flex items-center gap-2 text-ink-2 cursor-pointer">
          <input
            type="checkbox"
            checked={skipBgRemoval}
            onChange={e => setSkipBgRemoval(e.target.checked)}
          />
          Skip background removal (faster, raw image)
        </label>
        {step !== 'idle' && (
          <button onClick={reset} className="ml-auto text-ink-3 hover:text-ink underline">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const color = done ? 'border-ok/30 bg-ok-soft text-ok' :
    active ? 'border-accent bg-accent-soft text-accent' :
    'border-line bg-bg text-ink-3';
  return (
    <div className={`rounded border ${color} px-3 py-2 text-[11px] font-semibold text-center`}>
      {done ? '✓ ' : active ? '⋯ ' : ''}{label}
    </div>
  );
}

/* ─────────── client-side image helpers ─────────── */

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/avif': return 'avif';
    default: return 'bin';
  }
}

async function readDimensions(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function makeSquareThumbnail(source: Blob, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('thumbnail failed')), 'image/png');
  });
}

async function downscaleIfNeeded(source: Blob, maxEdge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge) return source;
  const scale = maxEdge / longest;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('downscale failed')), 'image/png');
  });
}
