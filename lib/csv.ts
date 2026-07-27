/**
 * RFC 4180 CSV parsing, plus tolerant header matching.
 *
 * Generic and domain-free — it knows about quoting and headers, not about
 * people. The People-specific field mapping lives in lib/people.ts.
 *
 * Hand-written rather than pulled from a package: the grammar is small, and a
 * dependency for it would have to be audited and carried forever.
 */

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse CSV text into rows of raw cells.
 *
 * Handles the parts of RFC 4180 that real exports actually produce:
 *   - quoted fields containing commas, quotes (`""`), and newlines
 *   - CRLF, LF, and CR line endings
 *   - a UTF-8 BOM, which Excel adds and which would otherwise corrupt the
 *     first header
 *   - a trailing newline, which must not produce a phantom final row
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === '') {
      // Only opens a quoted field at the start of one; a stray quote mid-field
      // is data, not syntax.
      field = '';
      inQuotes = true;
      fieldWasQuoted = true;
      continue;
    }

    if (char === ',') {
      endField();
      continue;
    }

    if (char === '\r') {
      if (input[i + 1] === '\n') i++;
      endRow();
      continue;
    }

    if (char === '\n') {
      endRow();
      continue;
    }

    field += char;
  }

  // Flush the last field unless the input ended on a line break.
  if (field !== '' || fieldWasQuoted || row.length > 0) endRow();

  // Drop rows that are entirely empty — a trailing blank line, typically.
  return rows.filter(r => r.some(cell => cell !== ''));
}

// ─── Header matching ─────────────────────────────────────────────────────────

/**
 * Reduce a header to a comparison key: lowercase, and every run of spaces,
 * underscores, hyphens, or dots collapsed to a single space. This is what makes
 * `first_name`, `First Name`, and `first-name` the same header.
 */
export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_\-.]+/g, ' ').trim();
}

export interface HeaderMatch<TField extends string> {
  /** Canonical field name → the index of the column it was found in. */
  columns: Partial<Record<TField, number>>;
  /** Headers present in the file that matched no known field. */
  unrecognized: string[];
}

/**
 * Map a file's header row onto canonical field names.
 *
 * The first column matching a field wins; a duplicated header is ignored rather
 * than silently overriding the earlier one.
 */
export function matchHeaders<TField extends string>(
  headerRow: string[],
  aliases: Record<TField, readonly string[]>,
): HeaderMatch<TField> {
  const lookup = new Map<string, TField>();
  for (const field of Object.keys(aliases) as TField[]) {
    for (const alias of aliases[field]) {
      lookup.set(normalizeHeader(alias), field);
    }
  }

  const columns: Partial<Record<TField, number>> = {};
  const unrecognized: string[] = [];

  headerRow.forEach((header, index) => {
    const field = lookup.get(normalizeHeader(header));
    if (field === undefined) {
      if (header.trim() !== '') unrecognized.push(header.trim());
      return;
    }
    if (columns[field] === undefined) columns[field] = index;
  });

  return { columns, unrecognized };
}

// ─── Serialization ───────────────────────────────────────────────────────────

/** Quote a cell only when it needs it, per RFC 4180. */
export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}
