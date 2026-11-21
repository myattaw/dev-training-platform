import type { FileSet } from './build';

/**
 * Finds private content inside a browser bundle.
 *
 * "Sensitive" strings are the string values in private files that never
 * appear in public files (so shared text such as a challenge title is not
 * flagged), and that are long enough to be distinctive. Each one is searched
 * for in every bundle file, both raw and JSON-escaped.
 */
export const MIN_SENSITIVE_LENGTH = 12;

export interface Leak {
  readonly file: string;
  readonly value: string;
}

export function sensitiveStrings(privateFiles: FileSet, publicFiles: FileSet): string[] {
  const publicValues = new Set<string>();
  for (const value of publicFiles.values()) collectStrings(value, (s) => publicValues.add(s));

  const sensitive = new Set<string>();
  for (const value of privateFiles.values()) {
    collectStrings(value, (s) => {
      if (s.length >= MIN_SENSITIVE_LENGTH && !publicValues.has(s)) sensitive.add(s);
    });
  }
  return [...sensitive];
}

/** `bundle` maps bundle file paths to their text content. */
export function findLeaks(
  sensitive: readonly string[],
  bundle: ReadonlyMap<string, string>,
): Leak[] {
  const leaks: Leak[] = [];
  for (const [file, text] of bundle) {
    if (/\.(grading|questions)\.json$/.test(file)) {
      leaks.push({ file, value: '(private file copied into the bundle)' });
      continue;
    }
    for (const value of sensitive) {
      if (containsStringLiteral(text, value)) leaks.push({ file, value });
    }
  }
  return leaks;
}

/**
 * Content can only reach a bundle as a complete string value (JSON or a JS
 * string literal), so look for the value wrapped in matching quotes, raw or
 * JSON-escaped. Matching bare substrings would flag ordinary phrases that
 * happen to appear inside third-party code (e.g. compiler error messages).
 */
function containsStringLiteral(text: string, value: string): boolean {
  const forms = new Set([value, JSON.stringify(value).slice(1, -1)]);
  for (const form of forms) {
    for (const quote of ['"', "'", '`']) {
      if (text.includes(quote + form + quote)) return true;
    }
  }
  return false;
}

function collectStrings(value: unknown, add: (s: string) => void): void {
  if (typeof value === 'string') add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, add));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((v) => collectStrings(v, add));
  }
}
