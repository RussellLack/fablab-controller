/**
 * Filename builder for generated documents.
 *
 * Every document (PDF, Excel, CSV, snapshot) auto-includes the date of
 * production in **Norwegian everyday format `DD.MM.YYYY`** — matching the
 * date format on every other Fablab document (invoices, contracts).
 *
 * Pattern: `{docRef}-{date}-{description}.{ext}`
 *
 * Examples:
 *   PO-2026-014-002-31.05.2026-Vitra-AS.pdf
 *   ELS-014-008-31.05.2026-Customer.pdf
 *   IO-2026-014-001-12.06.2026-Bjornsen-Snekkeri.pdf  (note ø → oe)
 *
 * Spec: 18-data-model-v7.md § Document filename convention
 */

import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const OSLO = 'Europe/Oslo';

/**
 * Format a date as Norwegian everyday DD.MM.YYYY, in Europe/Oslo timezone.
 */
export function norwegianDate(date: Date = new Date()): string {
  return format(toZonedTime(date, OSLO), 'dd.MM.yyyy');
}

/**
 * Romanise Norwegian characters and normalise for filesystem safety.
 *
 * æ → ae, ø → oe, å → aa (case-preserving)
 * Other diacritics → ASCII equivalents
 * Spaces → hyphens
 * Apostrophes, slashes, control chars → stripped
 * Multiple hyphens → single hyphen
 * Leading/trailing hyphens → stripped
 */
export function slugify(input: string): string {
  if (!input) return '';

  // 1) Norwegian-specific letter replacements (preserve case)
  let s = input
    .replace(/Æ/g, 'Ae').replace(/æ/g, 'ae')
    .replace(/Ø/g, 'Oe').replace(/ø/g, 'oe')
    .replace(/Å/g, 'Aa').replace(/å/g, 'aa');

  // 2) Strip remaining diacritics (é → e, ñ → n, etc.)
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');

  // 3) Strip apostrophes, slashes, quotes, control chars
  s = s.replace(/['"`/\\<>:?*|]/g, '');

  // 4) Spaces / underscores / commas → hyphens
  s = s.replace(/[\s_,]+/g, '-');

  // 5) Strip anything not alphanumeric, hyphen, or dot
  s = s.replace(/[^a-zA-Z0-9\-.]/g, '');

  // 6) Collapse multiple hyphens, trim
  s = s.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

  return s;
}

export type DocFilenameInput = {
  docRef: string;          // e.g. "PO-2026-014-002", "ELS-014-008"
  description: string;     // e.g. "Vitra AS", "Customer", "Lighting package"
  ext: 'pdf' | 'xlsx' | 'csv' | 'docx' | string;
  date?: Date;             // defaults to "now"
  sequence?: number;       // same-day re-export: appended as -v2, -v3, etc.
};

/**
 * Build the canonical filename for a generated document.
 *
 * Returns the filename WITHOUT path — the caller decides where it lives.
 */
export function buildDocumentFilename(input: DocFilenameInput): string {
  const date = norwegianDate(input.date);
  const desc = slugify(input.description);
  const seq = input.sequence && input.sequence > 1 ? `-v${input.sequence}` : '';
  return `${input.docRef}-${date}-${desc}${seq}.${input.ext}`;
}

/**
 * Build the canonical Supabase Storage path for a generated document.
 *
 * Pattern: projects/{projectId}/documents/{filename}
 */
export function buildDocumentStoragePath(input: DocFilenameInput & { projectId: string }): string {
  return `projects/${input.projectId}/documents/${buildDocumentFilename(input)}`;
}

/**
 * Build the canonical Supabase Storage path for an Element List snapshot.
 *
 * Pattern: projects/{projectId}/snapshots/{filename}
 */
export function buildSnapshotStoragePath(input: DocFilenameInput & { projectId: string }): string {
  return `projects/${input.projectId}/snapshots/${buildDocumentFilename(input)}`;
}
