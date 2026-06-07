/**
 * RFC 4180-ish CSV parser used by the /clients /vendors /projects
 * import server actions.
 *
 * Handles quoted cells (with `""` for escaped quotes), commas inside
 * quoted cells, and CRLF line endings. No streaming — parses the
 * whole string in memory, which is fine for the human-scale
 * spreadsheets these importers target.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (ch === '\r') {
        // ignored — handled by \n
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Strip a leading UTF-8 BOM and trim whitespace. */
export function stripBomAndTrim(input: string): string {
  return input.replace(/^﻿/, '').trim();
}

/**
 * Verify the header row exactly matches the expected schema. Returns
 * null on success, or a human-readable error message on mismatch.
 * Case-insensitive on header text since spreadsheet apps sometimes
 * normalise case.
 */
export function validateHeaders(
  actual: string[],
  expected: readonly string[]
): string | null {
  const a = actual.map((c) => (c ?? '').trim().toLowerCase());
  const e = expected.map((c) => c.toLowerCase());
  for (let i = 0; i < e.length; i++) {
    if (a[i] !== e[i]) {
      return `Header row should be: ${expected.join(', ')}`;
    }
  }
  return null;
}
