/**
 * `localStorage` wrapper that never throws. Storage can be unavailable
 * (privacy modes, disabled cookies) or full; losing a preference or draft is
 * never worth crashing the page over.
 *
 * All PracStack keys share the `pracstack:` prefix.
 */
export const STORAGE_PREFIX = 'pracstack:';

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    /* quota exceeded or storage disabled */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* storage disabled */
  }
}

/**
 * Reads and parses JSON, returning `undefined` if the value is missing, is not
 * valid JSON, or fails the `isValid` guard (e.g. written by an older version).
 */
export function readJson<T>(key: string, isValid: (value: unknown) => value is T): T | undefined {
  const raw = readString(key);
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}
