import { describe, expect, it } from 'vitest';
import { compareResults, type ResultSet, valuesEqual } from './compare';
import { precheckQuery, stripComments } from './statement';

const col = (name: string, type = 'text') => ({ name, type });
const set = (names: string[], rows: (string | number | null)[][]): ResultSet => ({
  columns: names.map((n) => col(n)),
  rows,
});
const unordered = { ordered: false, checkColumnNames: false };

describe('valuesEqual', () => {
  it('compares numbers numerically, including numeric strings', () => {
    expect(valuesEqual('2.50', 2.5)).toBe(true);
    expect(valuesEqual('100', 100)).toBe(true);
    expect(valuesEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(valuesEqual('2.5', 2.6)).toBe(false);
  });

  it('treats null as equal only to null, and compares text exactly', () => {
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(null, 0)).toBe(false);
    expect(valuesEqual('Ann', 'ann')).toBe(false);
  });
});

describe('compareResults', () => {
  const expected = set(
    ['name', 'total'],
    [
      ['Ann', 10],
      ['Bob', 20],
    ],
  );

  it('accepts the same rows in any order when order is not required', () => {
    expect(
      compareResults(
        expected,
        set(
          ['n', 't'],
          [
            ['Bob', '20'],
            ['Ann', '10.00'],
          ],
        ),
        unordered,
      ),
    ).toEqual({
      verdict: 'equal',
    });
  });

  it('flags wrong order as close when order is required', () => {
    const result = compareResults(
      expected,
      set(
        ['n', 't'],
        [
          ['Bob', 20],
          ['Ann', 10],
        ],
      ),
      {
        ordered: true,
        checkColumnNames: false,
      },
    );
    expect(result).toEqual({
      verdict: 'close',
      reason: 'Right data, but the rows are not in the requested order.',
    });
  });

  it('flags reordered columns as close', () => {
    const result = compareResults(
      expected,
      set(
        ['total', 'name'],
        [
          [10, 'Ann'],
          [20, 'Bob'],
        ],
      ),
      unordered,
    );
    expect(result).toEqual({
      verdict: 'close',
      reason: 'Right data, but the columns are in a different order.',
    });
  });

  it('checks column names only when asked', () => {
    const actual = set(
      ['name', 'sum'],
      [
        ['Ann', 10],
        ['Bob', 20],
      ],
    );
    expect(compareResults(expected, actual, unordered).verdict).toBe('equal');
    expect(compareResults(expected, actual, { ordered: false, checkColumnNames: true })).toEqual({
      verdict: 'close',
      reason: 'Right data, but column names differ (expected "total", got "sum").',
    });
  });

  it('explains differences in shape and values', () => {
    expect(compareResults(expected, set(['name'], [['Ann'], ['Bob']]), unordered)).toEqual({
      verdict: 'different',
      reason: 'Expected 2 columns, but your query returns 1.',
    });
    expect(compareResults(expected, set(['n', 't'], [['Ann', 10]]), unordered)).toEqual({
      verdict: 'different',
      reason: 'Expected 2 rows, but your query returns 1.',
    });
    expect(
      compareResults(
        expected,
        set(
          ['n', 't'],
          [
            ['Ann', 10],
            ['Bob', 21],
          ],
        ),
        unordered,
      ).verdict,
    ).toBe('different');
  });

  it('respects duplicate rows (multiset, not set)', () => {
    const dupes = set(['x'], [[1], [1], [2]]);
    expect(compareResults(dupes, set(['x'], [[1], [2], [2]]), unordered).verdict).toBe('different');
    expect(compareResults(dupes, set(['x'], [[2], [1], [1]]), unordered).verdict).toBe('equal');
  });
});

describe('precheckQuery', () => {
  it.each([
    ['SELECT 1'],
    ['  select name from employees;  '],
    ['WITH x AS (SELECT 1) SELECT * FROM x'],
    ['-- comment\nSELECT 1'],
    ['/* note */ VALUES (1)'],
    ['(SELECT 1) UNION (SELECT 2)'],
  ])('allows %j', (sql) => {
    expect(precheckQuery(sql, 5000)).toBeUndefined();
  });

  it.each([
    ['', 'Write a query first.'],
    ['-- only a comment', 'Write a query first.'],
    ['DELETE FROM employees', 'Only queries that read data (SELECT, WITH, VALUES) can run here.'],
    ['DROP TABLE x', 'Only queries that read data (SELECT, WITH, VALUES) can run here.'],
  ])('refuses %j', (sql, message) => {
    expect(precheckQuery(sql, 5000)).toBe(message);
  });

  it('limits query length', () => {
    expect(precheckQuery(`SELECT '${'x'.repeat(100)}'`, 50)).toBe(
      'Queries can be at most 50 characters long.',
    );
  });
});

describe('stripComments', () => {
  it('keeps comment-like text inside strings', () => {
    expect(stripComments("SELECT '--not a comment' -- real\n, 1")).toBe(
      "SELECT '--not a comment' \n, 1",
    );
  });
});
