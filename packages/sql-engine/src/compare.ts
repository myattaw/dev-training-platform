import type { SqlColumn, SqlValue } from './types';

export interface ResultSet {
  readonly columns: readonly SqlColumn[];
  readonly rows: readonly (readonly SqlValue[])[];
}

export interface CompareOptions {
  /** The task requires a particular row order (it asks for ORDER BY). */
  readonly ordered: boolean;
  /** Column names must match (case-insensitively), e.g. when the task names an alias. */
  readonly checkColumnNames: boolean;
}

export type Comparison =
  | { readonly verdict: 'equal' }
  /** Same data with a minor difference: row order, column order or column names. */
  | { readonly verdict: 'close'; readonly reason: string }
  | { readonly verdict: 'different'; readonly reason: string };

const NUMERIC_TOLERANCE = 1e-9;

/**
 * Compares query results by behaviour, not SQL text. Numbers compare
 * numerically (so `2.50` from a `numeric` column equals `2.5`), and rows are
 * compared as a multiset unless order is required.
 */
export function compareResults(
  expected: ResultSet,
  actual: ResultSet,
  options: CompareOptions,
): Comparison {
  if (actual.columns.length !== expected.columns.length) {
    return {
      verdict: 'different',
      reason: `Expected ${count(expected.columns.length, 'column')}, but your query returns ${actual.columns.length}.`,
    };
  }
  if (actual.rows.length !== expected.rows.length) {
    return {
      verdict: 'different',
      reason: `Expected ${count(expected.rows.length, 'row')}, but your query returns ${actual.rows.length}.`,
    };
  }

  const sameData = (rows: readonly (readonly SqlValue[])[]): 'ordered' | 'unordered' | false => {
    if (rowsEqualInOrder(expected.rows, rows)) return 'ordered';
    return multisetEqual(expected.rows, rows) ? 'unordered' : false;
  };

  let match = sameData(actual.rows);
  let columnsReordered = false;
  if (!match) {
    const permuted = findColumnPermutation(expected, actual);
    if (permuted) {
      match = sameData(permuted);
      columnsReordered = match !== false;
    }
  }
  if (!match) {
    return { verdict: 'different', reason: 'Your query returns different values.' };
  }

  const problems: string[] = [];
  if (options.ordered && match === 'unordered')
    problems.push('the rows are not in the requested order');
  if (columnsReordered) problems.push('the columns are in a different order');
  if (options.checkColumnNames && !columnsReordered) {
    const wrong = expected.columns
      .map((c, i) => [c.name, actual.columns[i]?.name ?? ''] as const)
      .filter(([want, got]) => want.toLowerCase() !== got.toLowerCase());
    if (wrong.length > 0) {
      problems.push(
        `column names differ (${wrong.map(([w, g]) => `expected "${w}", got "${g}"`).join('; ')})`,
      );
    }
  }
  if (problems.length === 0) return { verdict: 'equal' };
  return { verdict: 'close', reason: `Right data, but ${problems.join(' and ')}.` };
}

export function valuesEqual(a: SqlValue, b: SqlValue): boolean {
  if (a === null || b === null) return a === b;
  const x = toNumber(a);
  const y = toNumber(b);
  if (x !== undefined && y !== undefined) {
    return Math.abs(x - y) <= NUMERIC_TOLERANCE * Math.max(1, Math.abs(x), Math.abs(y));
  }
  return String(a) === String(b);
}

function toNumber(value: SqlValue): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(value.trim()))
    return Number(value);
  return undefined;
}

function rowsEqualInOrder(
  a: readonly (readonly SqlValue[])[],
  b: readonly (readonly SqlValue[])[],
): boolean {
  return a.length === b.length && a.every((row, i) => rowEqual(row, b[i] ?? []));
}

function rowEqual(a: readonly SqlValue[], b: readonly SqlValue[]): boolean {
  return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i] ?? null));
}

function multisetEqual(
  a: readonly (readonly SqlValue[])[],
  b: readonly (readonly SqlValue[])[],
): boolean {
  const remaining = [...b];
  for (const row of a) {
    const index = remaining.findIndex((candidate) => rowEqual(row, candidate));
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

/**
 * If the learner's columns are a reordering of the expected ones, returns
 * their rows rearranged into the expected order. Matches by column name
 * first; otherwise tries every permutation (only for ≤ 6 columns).
 */
function findColumnPermutation(
  expected: ResultSet,
  actual: ResultSet,
): (readonly SqlValue[])[] | undefined {
  const n = expected.columns.length;
  if (n < 2) return undefined;
  const reorder = (perm: readonly number[]) =>
    actual.rows.map((row) => perm.map((i) => row[i] ?? null));

  const byName = expected.columns.map((c) =>
    actual.columns.findIndex((a) => a.name.toLowerCase() === c.name.toLowerCase()),
  );
  if (byName.every((i) => i >= 0) && new Set(byName).size === n && byName.some((v, i) => v !== i)) {
    return reorder(byName);
  }
  // Brute force is bounded: at most 6! = 720 permutations of at most 200 rows.
  if (n > 6 || actual.rows.length > 200) return undefined;
  for (const perm of permutations(n)) {
    if (perm.every((v, i) => v === i)) continue;
    const rows = reorder(perm);
    if (multisetEqual(expected.rows, rows)) return rows;
  }
  return undefined;
}

function* permutations(n: number): Generator<number[]> {
  const items = Array.from({ length: n }, (_, i) => i);
  function* go(prefix: number[], rest: number[]): Generator<number[]> {
    if (rest.length === 0) yield prefix;
    for (let i = 0; i < rest.length; i++) {
      yield* go([...prefix, rest[i]!], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  }
  yield* go([], items);
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
