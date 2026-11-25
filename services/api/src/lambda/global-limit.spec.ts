import type { CodeRunner } from '@pracstack/code-runner';
import type { SqlEngine } from '@pracstack/sql-engine';
import { describe, expect, it } from 'vitest';
import { SlidingWindowRateLimiter } from '../rate-limit';
import { GloballyLimitedCodeRunner, GloballyLimitedSqlEngine } from './global-limit';

describe('global runner limits', () => {
  it('lets a fixed number of runs through per window, whoever asks', async () => {
    let runs = 0;
    const inner: CodeRunner = {
      run: () => {
        runs++;
        return Promise.resolve({ kind: 'completed', outcomes: [], logs: [] });
      },
    };
    const runner = new GloballyLimitedCodeRunner(
      inner,
      new SlidingWindowRateLimiter(2, 60_000),
      () => 0,
    );
    const req = { language: 'typescript', code: 'x', entryPoint: 'f', tests: [] } as const;
    expect((await runner.run(req)).kind).toBe('completed');
    expect((await runner.run(req)).kind).toBe('completed');
    expect(await runner.run(req)).toMatchObject({ kind: 'unavailable' });
    expect(runs).toBe(2);
  });

  it('applies to SQL too', async () => {
    const inner: SqlEngine = {
      run: () => Promise.resolve({ kind: 'rejected', message: 'inner' }),
      close: () => Promise.resolve(),
    };
    const engine = new GloballyLimitedSqlEngine(
      inner,
      new SlidingWindowRateLimiter(1, 60_000),
      () => 0,
    );
    const req = { database: { schemaSql: '', dataSql: '' }, query: 'SELECT 1', maxRows: 1 };
    expect(await engine.run(req)).toEqual({ kind: 'rejected', message: 'inner' });
    expect(await engine.run(req)).toMatchObject({
      kind: 'rejected',
      message: expect.stringContaining('busy'),
    });
  });

  it('counts a SQL grading batch once (one runner invocation)', async () => {
    const batches: number[] = [];
    const inner: SqlEngine = {
      run: () => Promise.reject(new Error('batches must not be split up')),
      runEach: (request) => {
        batches.push(request.databases.length);
        return Promise.resolve(
          request.databases.map(() => ({ kind: 'rejected' as const, message: 'inner' })),
        );
      },
      close: () => Promise.resolve(),
    };
    const engine = new GloballyLimitedSqlEngine(
      inner,
      new SlidingWindowRateLimiter(1, 60_000),
      () => 0,
    );
    const database = { schemaSql: '', dataSql: '' };
    const batch = { databases: [database, database, database], query: 'SELECT 1', maxRows: 1 };
    expect(await engine.runEach(batch)).toHaveLength(3);
    expect(batches).toEqual([3]);
    expect(await engine.runEach(batch)).toEqual([
      { kind: 'rejected', message: expect.stringContaining('busy') },
    ]);
  });
});
