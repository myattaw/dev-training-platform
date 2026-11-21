import { describe, expect, it } from 'vitest';
import { InvokedSqlEngine, parseSqlRunRequest } from './invoked-engine';
import type { SqlRunRequest } from './types';

const request: SqlRunRequest = {
  database: { schemaSql: 'CREATE TABLE t (a int);', dataSql: 'INSERT INTO t VALUES (1);' },
  query: 'SELECT a FROM t',
  maxRows: 2,
};
const engine = (payload: unknown) =>
  new InvokedSqlEngine(() => Promise.resolve({ kind: 'returned', payload }), 'sql-fn');

describe('InvokedSqlEngine', () => {
  it('returns valid results from the runner function', async () => {
    const rows = {
      kind: 'rows',
      columns: [{ name: 'a', type: 'int4' }],
      rows: [[1]],
      truncated: false,
      durationMs: 3,
    };
    expect(await engine(rows).run(request)).toEqual(rows);
  });

  it('rejects malformed, oversized or inconsistent results', async () => {
    for (const payload of [
      null,
      {
        kind: 'rows',
        columns: [{ name: 'a', type: 'int4' }],
        rows: [[1, 2]],
        truncated: false,
        durationMs: 1,
      },
      { kind: 'rows', columns: [], rows: [[], [], [], [], []], truncated: false, durationMs: 1 },
      {
        kind: 'rows',
        columns: [{ name: 'a', type: 'int4' }],
        rows: [[{}]],
        truncated: false,
        durationMs: 1,
      },
      { kind: 'error', message: 7 },
      { kind: 'nope' },
    ]) {
      expect((await engine(payload).run(request)).kind, JSON.stringify(payload)).toBe('error');
    }
  });

  it('maps refusals and function failures', async () => {
    const refused = new InvokedSqlEngine(
      () => Promise.resolve({ kind: 'refused', message: 'throttled' }),
      'f',
    );
    expect((await refused.run(request)).kind).toBe('rejected');
    const timedOut = new InvokedSqlEngine(
      () => Promise.resolve({ kind: 'function-error', error: 'Task timed out' }),
      'f',
    );
    expect((await timedOut.run(request)).kind).toBe('timeout');
  });

  it('validates incoming requests', () => {
    expect(parseSqlRunRequest(request)).toEqual(request);
    expect(parseSqlRunRequest({ ...request, maxRows: -1 })).toBeUndefined();
    expect(parseSqlRunRequest({ ...request, database: null })).toBeUndefined();
  });
});
