import type { SqlEngine, SqlRunRequest, SqlRunResult } from '@pracstack/sql-engine';
import { describe, expect, it } from 'vitest';
import { SqlCheckPool } from './sql-check-pool';

const request = (query: string): SqlRunRequest => ({
  database: { schemaSql: 'CREATE TABLE t (a int);', dataSql: '' },
  query,
  maxRows: 10,
});
const rows: SqlRunResult = { kind: 'rows', columns: [], rows: [], truncated: false, durationMs: 1 };

/** A fake engine that records its calls and resolves when told to. */
function fakeEngines(result: (query: string) => SqlRunResult = () => rows) {
  const calls: { engine: number; query: string }[] = [];
  let running = 0;
  let maxRunning = 0;
  let n = 0;
  const create = (): SqlEngine => {
    const engine = n++;
    return {
      async run(r) {
        calls.push({ engine, query: r.query });
        maxRunning = Math.max(maxRunning, ++running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return result(r.query);
      },
      close: async () => undefined,
    };
  };
  return { calls, create, maxRunning: () => maxRunning };
}

describe('SqlCheckPool', () => {
  it('spreads queries over its engines', async () => {
    const fake = fakeEngines();
    const pool = new SqlCheckPool(3, fake.create);
    await Promise.all(['q1', 'q2', 'q3'].map((q) => pool.run(request(q))));
    expect(new Set(fake.calls.map((c) => c.engine))).toEqual(new Set([0, 1, 2]));
    expect(fake.maxRunning()).toBe(3);
  });

  it('runs an identical query on identical data only once', async () => {
    const fake = fakeEngines();
    const pool = new SqlCheckPool(2, fake.create);
    await Promise.all([pool.run(request('q')), pool.run(request('q'))]);
    await pool.run(request('q'));
    expect(fake.calls).toHaveLength(1);
  });

  it('runs again after a time-out instead of remembering it', async () => {
    const fake = fakeEngines(() => ({ kind: 'timeout', timeoutMs: 5000 }));
    const pool = new SqlCheckPool(1, fake.create);
    await pool.run(request('q'));
    await pool.run(request('q'));
    expect(fake.calls).toHaveLength(2);
  });
});
