/**
 * Tiny client-side CSV download helper used by the bulk-action bars
 * on /clients /vendors /projects.
 *
 * RFC 4180-ish quoting: every field is wrapped in double-quotes and
 * any embedded double-quote is doubled. Newlines inside cells survive
 * the round-trip when opened in Excel / Numbers / Sheets.
 *
 * Filenames are slug-cased with the locale-free ISO date so they
 * sort sensibly in a Downloads folder.
 */

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  if (typeof window === 'undefined') return;
  const escape = (raw: unknown) => {
    const s = raw == null ? '' : String(raw);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(','))
  ].join('\r\n');
  // Prefix with BOM (U+FEFF) so Excel opens UTF-8 files correctly on Windows.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function csvFilename(prefix: string): string {
  const iso = new Date().toISOString().slice(0, 10);
  return `${prefix}-${iso}.csv`;
}
