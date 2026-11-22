import {
  type Company,
  type CompanyQuestionAssociation,
  type Competency,
  companySlug,
  type DataSource,
  type Difficulty,
  type ExternalProblemReference,
  ID_PATTERN,
  type ObservationWindow,
} from '@pracstack/content-model';
import { CsvSyntaxError, parseCsv } from './csv';

/*
 * Reads one company file in the format of the "company-wise interview
 * questions" datasets: a folder per company, one CSV per time window, with
 * the columns ID, URL, Title, Difficulty, Acceptance %, Frequency %.
 *
 * Only facts are imported (title, difficulty, link, the source's numbers),
 * with provenance. Problem statements, tests and solutions are never read.
 */

export const REQUIRED_COLUMNS = [
  'ID',
  'URL',
  'Title',
  'Difficulty',
  'Acceptance %',
  'Frequency %',
] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

/** File name (without folder) → observation window. */
export const WINDOW_FILES: Readonly<Record<string, ObservationWindow>> = {
  'thirty-days.csv': 'thirty-days',
  'three-months.csv': 'three-months',
  'six-months.csv': 'six-months',
  'more-than-six-months.csv': 'more-than-six-months',
  'all.csv': 'all',
};

/** Hosts a problem URL may point to, per provider. Anything else is rejected. */
const PROBLEM_URL = /^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
const ALLOWED_HOSTS = new Set(['leetcode.com']);
const MAX_TITLE_LENGTH = 200;

export interface RejectedRow {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

/** The whole file was unusable (wrong columns, unknown file name, bad CSV). */
export class CompanyFileError extends Error {
  override readonly name = 'CompanyFileError';
}

export interface CompanyFileInput {
  readonly source: DataSource;
  /** Folder name in the source, e.g. `liberty-mutual`. */
  readonly companyFolder: string;
  readonly fileName: string;
  readonly text: string;
  /** ISO timestamp recorded on every association from this import. */
  readonly importedAt: string;
  /** Display name override; otherwise derived from the folder name. */
  readonly displayName?: string;
  /** Editorial competency tags by external problem id. */
  readonly editorialTags?: Readonly<Record<string, readonly Competency[]>>;
}

export interface ParsedCompanyFile {
  readonly company: Company;
  readonly window: ObservationWindow;
  readonly references: readonly ExternalProblemReference[];
  readonly associations: readonly CompanyQuestionAssociation[];
  readonly rejected: readonly RejectedRow[];
  /** Extra columns that were ignored. */
  readonly ignoredColumns: readonly string[];
}

/** Turns `liberty-mutual` into "Liberty Mutual". Use `displayName` for brand casing (PayPal). */
export function displayNameFromFolder(folder: string): string {
  return folder
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Removes control characters and normalises whitespace. */
export function sanitizeText(value: string): string {
  return (
    value
      .normalize('NFC')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** `51.1%` → 51.1. Empty → undefined. Throws on anything outside 0–100. */
export function parsePercent(value: string): number | undefined {
  const text = value.trim();
  if (text === '') return undefined;
  const match = /^(\d{1,3}(?:\.\d{1,4})?)\s*%?$/.exec(text);
  const n = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`"${value}" is not a percentage`);
  return n;
}

export function parseDifficulty(value: string): Difficulty {
  const d = value.trim().toLowerCase();
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  throw new Error(`unknown difficulty "${value}"`);
}

/** Validates a problem URL; returns it normalised (https, no query, no trailing slash). */
export function parseProblemUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`"${value}" is not a URL`);
  }
  if (url.protocol !== 'https:') throw new Error('URL must use https');
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`URL host ${url.hostname} is not allowed`);
  if (url.username || url.password || url.port) throw new Error('URL must not contain credentials');
  const match = PROBLEM_URL.exec(url.pathname);
  if (!match) throw new Error('URL is not a problem page');
  return `https://${url.hostname}/problems/${match[1]}`;
}

export function parseCompanyFile(input: CompanyFileInput): ParsedCompanyFile {
  const where = `${input.companyFolder}/${input.fileName}`;
  const window = WINDOW_FILES[input.fileName];
  if (!window) throw new CompanyFileError(`${where}: unknown file name (no time window)`);
  if (!ID_PATTERN.test(input.companyFolder)) {
    throw new CompanyFileError(`${where}: company folder must be lowercase kebab-case`);
  }

  let records;
  try {
    records = parseCsv(input.text);
  } catch (err) {
    if (err instanceof CsvSyntaxError) throw new CompanyFileError(`${where}: ${err.message}`);
    throw err;
  }
  const [header, ...rows] = records;
  if (!header) throw new CompanyFileError(`${where}: empty file`);

  const names = header.fields.map((f) => f.trim().toLowerCase());
  const index = {} as Record<Column, number>;
  for (const column of REQUIRED_COLUMNS) {
    const i = names.indexOf(column.toLowerCase());
    if (i < 0) throw new CompanyFileError(`${where}: missing column "${column}"`);
    if (names.indexOf(column.toLowerCase(), i + 1) >= 0) {
      throw new CompanyFileError(`${where}: duplicate column "${column}"`);
    }
    index[column] = i;
  }
  const known = new Set(REQUIRED_COLUMNS.map((c) => c.toLowerCase()));
  const ignoredColumns = header.fields.filter((f) => !known.has(f.trim().toLowerCase()));

  const displayName = sanitizeText(input.displayName ?? displayNameFromFolder(input.companyFolder));
  const company: Company = { id: input.companyFolder, displayName, aliases: [] };
  if (companySlug(displayName) !== company.id && input.displayName === undefined) {
    throw new CompanyFileError(`${where}: folder name does not produce a stable slug`);
  }

  const references: ExternalProblemReference[] = [];
  const associations: CompanyQuestionAssociation[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Map<string, string>();

  for (const row of rows) {
    const reject = (reason: string) => rejected.push({ file: where, line: row.line, reason });
    if (row.fields.length !== header.fields.length) {
      reject(`expected ${header.fields.length} fields, found ${row.fields.length}`);
      continue;
    }
    const get = (c: Column): string => row.fields[index[c]] ?? '';
    try {
      const externalId = get('ID').trim();
      if (!/^[1-9]\d{0,5}$/.test(externalId)) throw new Error(`invalid ID "${get('ID')}"`);
      const title = sanitizeText(get('Title'));
      if (title === '' || title.length > MAX_TITLE_LENGTH) throw new Error('invalid title');
      const externalUrl = parseProblemUrl(get('URL'));
      const difficulty = parseDifficulty(get('Difficulty'));
      const acceptanceRate = parsePercent(get('Acceptance %'));
      const reportedFrequency = parsePercent(get('Frequency %'));

      const fingerprint = JSON.stringify([title, externalUrl, difficulty, reportedFrequency]);
      const previous = seen.get(externalId);
      if (previous !== undefined) {
        throw new Error(
          previous === fingerprint
            ? `duplicate of an earlier row for problem ${externalId}`
            : `conflicts with an earlier row for problem ${externalId}`,
        );
      }
      seen.set(externalId, fingerprint);

      const problemId = `${input.source.id}:${externalId}`;
      references.push({
        id: problemId,
        sourceId: input.source.id,
        externalId,
        title,
        externalUrl,
        difficulty,
        ...(acceptanceRate !== undefined ? { acceptanceRate } : {}),
        editorialTags: [...(input.editorialTags?.[externalId] ?? [])],
      });
      associations.push({
        companyId: company.id,
        problemId,
        sourceId: input.source.id,
        window,
        ...(reportedFrequency !== undefined ? { reportedFrequency } : {}),
        sourceSnapshotDate: input.source.snapshotDate,
        importedAt: input.importedAt,
      });
    } catch (err) {
      reject(err instanceof Error ? err.message : String(err));
    }
  }
  return { company, window, references, associations, rejected, ignoredColumns };
}
