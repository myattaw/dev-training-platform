/**
 * RFC 4180 CSV parser: quoted fields, escaped quotes (`""`), commas and line
 * breaks inside quotes, CRLF or LF line endings, and a leading byte-order mark.
 *
 * Strict: an unterminated quote or text after a closing quote is an error
 * (with its line number) instead of a silently wrong row.
 */

export interface CsvRecord {
  /** 1-based line on which the record starts. */
  readonly line: number;
  readonly fields: readonly string[];
}

export class CsvSyntaxError extends Error {
  override readonly name = 'CsvSyntaxError';
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`line ${line}: ${message}`);
  }
}

/** Parses CSV text into records. Blank lines are skipped. */
export function parseCsv(text: string): CsvRecord[] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let recordLine = 1;
  let i = 0;
  let quoted = false;
  /** The current field was quoted and its closing quote has been read. */
  let closed = false;

  const endField = (): void => {
    fields.push(field);
    field = '';
    closed = false;
  };
  const endRecord = (): void => {
    endField();
    // A line holding nothing at all is skipped, not read as one empty field.
    if (!(fields.length === 1 && fields[0] === '')) records.push({ line: recordLine, fields });
    fields = [];
  };

  while (i < input.length) {
    const ch = input[i] ?? '';
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        closed = true;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (field !== '' || closed) throw new CsvSyntaxError(line, 'unexpected quote inside a field');
      quoted = true;
      i++;
      continue;
    }
    if (ch === ',') {
      endField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && input[i + 1] === '\n' ? 2 : 1;
      line++;
      recordLine = line;
      continue;
    }
    if (closed) throw new CsvSyntaxError(line, 'text after a closing quote');
    field += ch;
    i++;
  }
  if (quoted) throw new CsvSyntaxError(recordLine, 'unterminated quoted field');
  if (field !== '' || fields.length > 0 || closed) endRecord();
  return records;
}
