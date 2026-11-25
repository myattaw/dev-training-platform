import { describe, expect, it } from 'vitest';
import { InvokedSqlEngine, parseSqlBatchRequest, parseSqlRunRequest } from './invoked-engine';
import type { SqlBatchRequest, SqlRunRequest } from './types';

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

describe('InvokedSqlEngine: batches', () => {
  const rows = (a: number) => ({
    kind: 'rows',
    columns: [{ name: 'a', type: 'int4' }],
    rows: [[a]],
    truncated: false,
    durationMs: 1,
  });
  const batch: SqlBatchRequest = {
    databases: [request.database, request.database],
    query: request.query,
    maxRows: 2,
  };

  it('sends all datasets in one invocation', async () => {
    const sent: unknown[] = [];
    const engine = new InvokedSqlEngine((_, payload) => {
      sent.push(payload);
      return Promise.resolve({ kind: 'returned', payload: { results: [rows(1), rows(2)] } });
    }, 'sql-fn');
    expect(await engine.runEach(batch)).toEqual([rows(1), rows(2)]);
    expect(sent).toEqual([{ batch }]);
  });

  it('distrusts malformed batch results, and stops at the first failure', async () => {
    const unreadable = { kind: 'error', message: 'The SQL engine produced an unreadable result.' };
    for (const payload of [null, { results: [] }, { results: [rows(1), rows(2), rows(3)] }])
      expect(await engine(payload).runEach(batch)).toEqual([unreadable]);
    expect(await engine({ results: [rows(1), { kind: 'nope' }] }).runEach(batch)).toEqual([
      rows(1),
      unreadable,
    ]);
    // Nothing after a result that is not rows, even if the runner sent more.
    const error = { kind: 'error', message: 'boom' };
    expect(await engine({ results: [error, rows(2)] }).runEach(batch)).toEqual([error]);
  });

  it('maps a refused batch to one busy result', async () => {
    const refused = new InvokedSqlEngine(
      () => Promise.resolve({ kind: 'refused', message: 'throttled' }),
      'sql-fn',
    );
    expect(await refused.runEach(batch)).toEqual([
      { kind: 'rejected', message: 'The SQL service is busy. Try again in a moment.' },
    ]);
  });

  it('validates incoming batch requests', () => {
    expect(parseSqlBatchRequest({ batch })).toEqual(batch);
    expect(parseSqlBatchRequest(batch)).toBeUndefined();
    expect(parseSqlBatchRequest({ batch: { ...batch, databases: [] } })).toBeUndefined();
    expect(
      parseSqlBatchRequest({ batch: { ...batch, databases: Array(11).fill(request.database) } }),
    ).toBeUndefined();
    expect(
      parseSqlBatchRequest({ batch: { ...batch, databases: [request.database, null] } }),
    ).toBeUndefined();
    // A single-run request is not a batch, and a batch is not a single run.
    expect(parseSqlBatchRequest(request)).toBeUndefined();
    expect(parseSqlRunRequest({ batch })).toBeUndefined();
  });
});
