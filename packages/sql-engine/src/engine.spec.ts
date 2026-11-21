import { afterAll, describe, expect, it } from 'vitest';
import { ChildProcessSqlEngine } from './child-process-engine';
import type { SqlDatabaseSpec, SqlRunResult } from './types';

/*
 * Integration tests against the real runner process and PGlite. These are the
 * security tests for SQL practice: every attack below must be refused by the
 * database or contained by the runner.
 */

const db: SqlDatabaseSpec = {
  schemaSql: `
    CREATE TABLE departments (id int PRIMARY KEY, name text NOT NULL);
    CREATE TABLE employees (
      id int PRIMARY KEY, name text NOT NULL, department_id int REFERENCES departments,
      salary numeric(10, 2), hired_on date
    );`,
  dataSql: `
    INSERT INTO departments VALUES (1, 'Engineering'), (2, 'Sales');
    INSERT INTO employees VALUES
      (1, 'Ann', 1, 120000.00, '2021-03-01'),
      (2, 'Bob', 2, 80000.50, '2022-07-15'),
      (3, 'Cleo', 1, 95000.00, NULL);`,
};

const engine = new ChildProcessSqlEngine({ limits: { timeoutMs: 3000, maxQueryMemoryMb: 400 } });
afterAll(() => engine.close());

const run = (query: string, maxRows = 100): Promise<SqlRunResult> =>
  engine.run({ database: db, query, maxRows });

const expectError = async (query: string, fragment: string) => {
  const result = await run(query);
  expect(result.kind === 'error' || result.kind === 'rejected', JSON.stringify(result)).toBe(true);
  expect('message' in result ? result.message : '').toContain(fragment);
};

describe('running queries', { timeout: 30_000 }, () => {
  it('returns typed columns and JSON-safe values', async () => {
    const result = await run(
      'SELECT name, salary, hired_on, department_id FROM employees ORDER BY id',
    );
    expect(result).toMatchObject({
      kind: 'rows',
      truncated: false,
      columns: [
        { name: 'name', type: 'text' },
        { name: 'salary', type: 'numeric' },
        { name: 'hired_on', type: 'date' },
        { name: 'department_id', type: 'int4' },
      ],
      rows: [
        ['Ann', '120000.00', '2021-03-01', 1],
        ['Bob', '80000.50', '2022-07-15', 2],
        ['Cleo', '95000.00', null, 1],
      ],
    });
  });

  it('truncates large results and reports it', async () => {
    const result = await run('SELECT g FROM generate_series(1, 1000) g', 10);
    expect(result).toMatchObject({ kind: 'rows', truncated: true });
    expect(result.kind === 'rows' && result.rows).toHaveLength(10);
  });

  it('reports SQL errors from PostgreSQL', async () => {
    await expectError('SELECT nope FROM employees', 'column "nope" does not exist');
  });
});

describe('isolation and permissions', { timeout: 60_000 }, () => {
  it.each([
    ['DELETE FROM employees', 'Only queries that read data'],
    ['UPDATE employees SET salary = 0', 'Only queries that read data'],
    ['CREATE TABLE x (a int)', 'Only queries that read data'],
    ['SELECT 1; DROP TABLE employees', 'cannot insert multiple commands'],
    ['WITH d AS (DELETE FROM employees RETURNING *) SELECT * FROM d', 'data-modifying'],
    ['SELECT * INTO copy FROM employees', 'SELECT ... INTO is not allowed here'],
    ["SELECT set_config('role', 'none', false)", 'permission denied for function set_config'],
    ["SELECT pg_read_file('/etc/passwd')", 'permission denied for function pg_read_file'],
    ["SELECT pg_ls_dir('/')", 'permission denied for function pg_ls_dir'],
    [
      "SELECT query_to_xml('SET ROLE NONE', true, false, '')",
      'SET is not allowed in a non-volatile function',
    ],
    ['SELECT lo_create(0)', 'read-only transaction'],
    ["SELECT nextval('x')", 'does not exist'],
  ])('refuses %j', async (query, fragment) => {
    await expectError(query, fragment);
  });

  it('runs as the non-superuser learner role', async () => {
    const result = await run(
      'SELECT current_user, session_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)',
    );
    expect(result).toMatchObject({ kind: 'rows', rows: [['learner', 'learner', false]] });
  });

  it('gives each database spec its own data', async () => {
    const other = await engine.run({
      database: { schemaSql: 'CREATE TABLE t (v int);', dataSql: 'INSERT INTO t VALUES (42);' },
      query: 'SELECT v FROM t',
      maxRows: 10,
    });
    expect(other).toMatchObject({ kind: 'rows', rows: [[42]] });
    await expectError('SELECT v FROM t', 'relation "t" does not exist');
  });
});

describe('resource limits', { timeout: 60_000 }, () => {
  it('stops an infinite query at the time limit and keeps working afterwards', async () => {
    const started = Date.now();
    const result = await run(
      'WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT count(*) FROM r',
    );
    expect(result).toEqual({ kind: 'timeout', timeoutMs: 3000 });
    expect(Date.now() - started).toBeLessThan(8000);
    expect(await run('SELECT count(*) FROM employees')).toMatchObject({
      kind: 'rows',
      rows: [[3]],
    });
  });

  it('stops a memory bomb (memory or time limit) and keeps working afterwards', async () => {
    const result = await run("SELECT length(repeat('x', 900000000))");
    expect(['resource-limit', 'timeout']).toContain(result.kind);
    expect(await run('SELECT 1 AS ok')).toMatchObject({ kind: 'rows', rows: [[1]] });
  });

  it('refuses work beyond the queue limit instead of piling it up', async () => {
    const small = new ChildProcessSqlEngine({ maxQueue: 1 });
    try {
      const [first, second] = await Promise.all([
        small.run({ database: db, query: 'SELECT 1', maxRows: 1 }),
        small.run({ database: db, query: 'SELECT 2', maxRows: 1 }),
      ]);
      expect(first.kind).toBe('rows');
      expect(second).toEqual({
        kind: 'rejected',
        message: 'The SQL service is busy. Try again in a moment.',
      });
    } finally {
      await small.close();
    }
  });
});
