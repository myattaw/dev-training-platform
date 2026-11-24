import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type SqlServerContainer, sqlServerForTests } from './sqlserver-container';
import {
  classifySqlServerError,
  SqlServerSqlEngine,
  sqlServerValue,
  typeName,
} from './sqlserver-engine';
import type { SqlRunRequest, SqlRunResult } from './types';

/*
 * Runs against the local SQL Server 2022 Developer edition container (started
 * if needed; about 10 s). Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

const schemaSql = `
CREATE TABLE employees (
  id INT PRIMARY KEY,
  name NVARCHAR(50) NOT NULL,
  code VARCHAR(10),
  salary DECIMAL(15, 2),
  hired DATE,
  active BIT,
  badge BIGINT,
  updated DATETIME2(3)
);`;
const sample = `INSERT INTO employees (id, name, code, salary, hired, active, badge, updated) VALUES
  (1, 'Ada', '00123', 0.5, '2024-01-15', 1, 9007199254740993, '2024-01-15 13:05:09.250'),
  (2, 'Grace', NULL, 98000.25, '2023-06-01', 0, 42, '2023-06-01'),
  (3, 'Linus; Torvalds', '', 1234567890123, NULL, NULL, NULL, NULL);`;
const hidden = `INSERT INTO employees (id, name, code, salary, hired, active) VALUES
  (10, 'SECRET-HIDDEN-ROW', 'X', 1, '2020-02-02', 1);`;

const req = (query: string, dataSql = sample, maxRows = 50): SqlRunRequest => ({
  database: { schemaSql, dataSql },
  query,
  maxRows,
});
const rowsOf = (r: SqlRunResult) => (r.kind === 'rows' ? r.rows : r);

describe('SQL Server value conversion', () => {
  it('names nullable column types by their T-SQL name', () => {
    expect(typeName({ type: { name: 'IntN' }, dataLength: 8 })).toBe('bigint');
    expect(typeName({ type: { name: 'IntN' }, dataLength: 1 })).toBe('tinyint');
    expect(typeName({ type: { name: 'DateTimeN' }, dataLength: 4 })).toBe('smalldatetime');
    expect(typeName({ type: { name: 'NVarChar' }, dataLength: 100 })).toBe('nvarchar');
  });

  it('formats dates without time zones and keeps big integers exact', () => {
    const d = new Date(Date.UTC(2024, 0, 15));
    expect(sqlServerValue(d, 'date')).toBe('2024-01-15');
    expect(sqlServerValue(d, 'datetime2')).toBe('2024-01-15');
    expect(sqlServerValue(new Date(Date.UTC(2024, 0, 15, 13, 5, 9, 250)), 'datetime')).toBe(
      '2024-01-15 13:05:09.250',
    );
    expect(sqlServerValue('42', 'bigint')).toBe(42);
    expect(sqlServerValue('9007199254740993', 'bigint')).toBe('9007199254740993');
    expect(sqlServerValue(null, 'int')).toBeNull();
  });

  it('classifies errors', () => {
    const sqlError = Object.assign(new Error("Invalid column name 'nope'."), {
      name: 'RequestError',
      number: 207,
      class: 16,
      lineNumber: 1,
    });
    expect(classifySqlServerError(sqlError, 3000)).toEqual({
      kind: 'error',
      message: "Msg 207, Level 16, Line 1: Invalid column name 'nope'.",
    });
    expect(classifySqlServerError({ code: 'ETIMEOUT' }, 3000)).toEqual({
      kind: 'timeout',
      timeoutMs: 3000,
    });
    expect(
      classifySqlServerError(
        Object.assign(new Error('x'), { name: 'ConnectionError', code: 'ESOCKET' }),
        1,
      ),
    ).toMatchObject({ kind: 'error', message: expect.stringMatching(/not available/) });
  });
});

describe.skipIf(skip)('SqlServerSqlEngine (SQL Server in Docker)', { timeout: 60_000 }, () => {
  let server: SqlServerContainer;
  let engine: SqlServerSqlEngine;

  beforeAll(async () => {
    server = await sqlServerForTests();
    engine = new SqlServerSqlEngine({ connection: server, limits: { timeoutMs: 3000 } });
  }, 300_000);
  afterAll(async () => {
    await engine?.close();
  });

  it('runs a query and returns faithful values', async () => {
    const result = await engine.run(
      req(
        'SELECT id, name, code, salary, hired, active, badge, updated FROM employees ORDER BY id;',
      ),
    );
    expect(result).toMatchObject({
      kind: 'rows',
      columns: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'nvarchar' },
        { name: 'code', type: 'varchar' },
        { name: 'salary', type: 'decimal' },
        { name: 'hired', type: 'date' },
        { name: 'active', type: 'bit' },
        { name: 'badge', type: 'bigint' },
        { name: 'updated', type: 'datetime2' },
      ],
      truncated: false,
    });
    expect(rowsOf(result)).toEqual([
      [1, 'Ada', '00123', 0.5, '2024-01-15', true, '9007199254740993', '2024-01-15 13:05:09.250'],
      [2, 'Grace', null, 98000.25, '2023-06-01', false, 42, '2023-06-01'],
      // Unlike Oracle, '' is not NULL; a ';' inside data is not a statement break.
      [3, 'Linus; Torvalds', '', 1234567890123, null, null, null, null],
    ]);
  });

  it('supports T-SQL', async () => {
    const result = await engine.run(
      req(`SELECT TOP (2) ISNULL(code, '-') AS code, YEAR(hired) AS y, IIF(active = 1, 'yes', 'no') AS a,
             DATEADD(day, 1, hired) AS next_day, CONCAT(name, '!') AS shout
           FROM employees ORDER BY id`),
    );
    expect(rowsOf(result)).toEqual([
      ['00123', 2024, 'yes', '2024-01-16', 'Ada!'],
      ['-', 2023, 'no', '2023-06-02', 'Grace!'],
    ]);
    expect(rowsOf(await engine.run(req('SELECT 1 + 1 AS two')))).toEqual([[2]]);
    expect(
      rowsOf(
        await engine.run(
          req('SELECT name FROM dbo.employees ORDER BY id OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY'),
        ),
      ),
    ).toEqual([['Grace']]);
    expect(
      rowsOf(
        await engine.run(
          req(
            "WITH n AS (SELECT name, ROW_NUMBER() OVER (ORDER BY id DESC) AS rn FROM employees) SELECT STRING_AGG(name, ', ') WITHIN GROUP (ORDER BY rn) FROM n",
          ),
        ),
      ),
    ).toEqual([['Linus; Torvalds, Grace, Ada']]);
  });

  it('truncates long results and stops fetching', async () => {
    const result = await engine.run(
      req(
        'SELECT TOP (100000) a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b',
        sample,
        10,
      ),
    );
    expect(result).toMatchObject({ kind: 'rows', truncated: true });
    expect(rowsOf(result)).toHaveLength(10);
  });

  it('reports SQL errors with the SQL Server message', async () => {
    expect(await engine.run(req('SELECT nope FROM employees'))).toMatchObject({
      kind: 'error',
      message: "Msg 207, Level 16, Line 1: Invalid column name 'nope'.",
    });
  });

  it('rejects batches with more than one result set', async () => {
    expect(await engine.run(req('SELECT 1 AS a; SELECT name FROM employees'))).toMatchObject({
      kind: 'rejected',
    });
  });

  it('cannot read other datasets, including hidden data', async () => {
    // Prepare the hidden dataset as grading would.
    expect((await engine.run(req('SELECT count(*) FROM employees', hidden))).kind).toBe('rows');
    const own = rowsOf(await engine.run(req('SELECT DB_NAME()'))) as string[][];
    // Other datasets are not even listed...
    const listed = rowsOf(
      await engine.run(req("SELECT name FROM sys.databases WHERE name LIKE 'ps[_]d[_]%'")),
    ) as string[][];
    expect(listed).toEqual(own);
    // ...and reading them fails, however they are named.
    const result = await engine.run(
      req(
        "SELECT name FROM sys.databases WHERE name LIKE 'ps[_]d[_]%' AND name <> DB_NAME()",
        sample,
      ),
    );
    expect(rowsOf(result)).toEqual([]);
    const admin = new SqlServerSqlEngine({ connection: server });
    // The hidden dataset's database name is derived from its content; try it directly.
    const hiddenDb = rowsOf(await admin.run(req('SELECT DB_NAME()', hidden))) as string[][];
    const cross = await engine.run(req(`SELECT name FROM ${hiddenDb[0]?.[0]}.dbo.employees`));
    expect(cross).toMatchObject({ kind: 'error', message: expect.stringMatching(/Msg 916/) });
  });

  it('cannot write or change anything', async () => {
    expect((await engine.run(req('DELETE FROM employees'))).kind).toBe('rejected');
    for (const query of [
      "SELECT 1 AS x; UPDATE employees SET name = 'x'",
      "SELECT 1 AS x; INSERT INTO employees (id, name) VALUES (99, 'x')",
      'SELECT 1 AS x; CREATE TABLE t (id INT)',
      'SELECT 1 AS x; DROP TABLE employees',
      "SELECT 1 AS x; EXEC('DELETE FROM employees')",
      'SELECT * INTO copy FROM employees',
    ]) {
      const result = await engine.run(req(query));
      expect(result.kind, query).not.toBe('rows');
    }
    expect(rowsOf(await engine.run(req('SELECT count(*) FROM employees')))).toEqual([[3]]);
  });

  it('cannot reach the file system, registry or shell', async () => {
    for (const query of [
      "SELECT 1 AS x; EXEC xp_cmdshell 'whoami'",
      "SELECT 1 AS x; EXEC xp_dirtree '/'",
      "SELECT 1 AS x; EXEC master..xp_fileexist '/etc/passwd'",
      "SELECT * FROM OPENROWSET(BULK '/etc/passwd', SINGLE_CLOB) AS f",
      "SELECT 1 AS x; EXEC sp_configure 'xp_cmdshell', 1",
    ]) {
      const result = await engine.run(req(query));
      expect(result.kind, `${query}: ${JSON.stringify(result)}`).not.toBe('rows');
    }
  });

  it('stops runaway queries, and the next query works', async () => {
    const started = Date.now();
    const result = await engine.run(
      req(
        'SELECT count_big(*) FROM sys.all_objects a CROSS JOIN sys.all_objects b CROSS JOIN sys.all_objects c WHERE CHECKSUM(a.name, b.name, c.name) = 7',
      ),
    );
    expect(result.kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(10_000);
    expect((await engine.run(req("SELECT 1 AS x; WAITFOR DELAY '00:00:10'"))).kind).toBe('timeout');
    expect(rowsOf(await engine.run(req('SELECT 1 AS one')))).toEqual([[1]]);
  });

  it('shares datasets safely between engines (processes) on the same server', async () => {
    const fresh = req(
      'SELECT count(*) AS n FROM employees',
      `${sample}
-- ${Date.now()}`,
    );
    const other = new SqlServerSqlEngine({ connection: server, limits: { timeoutMs: 3000 } });
    const [a, b] = await Promise.all([engine.run(fresh), other.run(fresh)]);
    expect(rowsOf(a), JSON.stringify(a)).toEqual([[3]]);
    expect(rowsOf(b), JSON.stringify(b)).toEqual([[3]]);
    const third = new SqlServerSqlEngine({ connection: server, limits: { timeoutMs: 3000 } });
    expect(rowsOf(await third.run(fresh))).toEqual([[3]]);
    expect(rowsOf(await engine.run(fresh))).toEqual([[3]]);
  });

  it('handles concurrent runs', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => engine.run(req(`SELECT ${n} AS n`))),
    );
    expect(results.map(rowsOf)).toEqual([[[1]], [[2]], [[3]], [[4]], [[5]], [[6]]]);
  });
});
