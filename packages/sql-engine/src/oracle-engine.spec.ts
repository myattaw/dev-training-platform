import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OracleContainer, oracleForTests } from './oracle-container';
import { dateValue, numberValue, OracleSqlEngine } from './oracle-engine';
import type { SqlRunRequest, SqlRunResult } from './types';

/*
 * Runs against a real Oracle Database Free in a throwaway Docker container
 * (about 20 s to start). Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

const schemaSql = `
CREATE TABLE employees (
  id NUMBER PRIMARY KEY,
  name VARCHAR2(50) NOT NULL,
  code VARCHAR2(10),
  salary NUMBER(15, 2),
  hired DATE,
  active BOOLEAN
);`;
const sample = `INSERT INTO employees (id, name, code, salary, hired, active) VALUES
  (1, 'Ada', '00123', 0.5, '2024-01-15', TRUE),
  (2, 'Grace', NULL, 98000.25, '2023-06-01', FALSE),
  (3, 'Linus; Torvalds', '', 1234567890123, NULL, NULL);`;
const hidden = `INSERT INTO employees (id, name, code, salary, hired, active) VALUES
  (10, 'SECRET-HIDDEN-ROW', 'X', 1, '2020-02-02', TRUE);`;

const req = (query: string, dataSql = sample, maxRows = 50): SqlRunRequest => ({
  database: { schemaSql, dataSql },
  query,
  maxRows,
});
const rowsOf = (r: SqlRunResult) => (r.kind === 'rows' ? r.rows : r);

describe('value conversion', () => {
  it('keeps numbers exact and formats dates without time zones', () => {
    expect(numberValue('0.5')).toBe(0.5);
    expect(numberValue('.5')).toBe(0.5);
    expect(numberValue('-12')).toBe(-12);
    expect(numberValue('12345678901234567890')).toBe('12345678901234567890');
    expect(dateValue(new Date(2024, 0, 15))).toBe('2024-01-15');
    expect(dateValue(new Date(2024, 0, 15, 13, 5, 9))).toBe('2024-01-15 13:05:09');
    expect(dateValue(null)).toBeNull();
  });
});

describe.skipIf(skip)(
  'OracleSqlEngine (Oracle Database Free in Docker)',
  { timeout: 60_000 },
  () => {
    let oracle: OracleContainer;
    let engine: OracleSqlEngine;

    beforeAll(async () => {
      oracle = await oracleForTests();
      engine = new OracleSqlEngine({ connection: oracle, limits: { timeoutMs: 3000 } });
    }, 300_000);
    afterAll(async () => {
      await engine?.close();
    });

    it('runs a query and returns faithful values', async () => {
      const result = await engine.run(
        req('SELECT id, name, code, salary, hired, active FROM employees ORDER BY id;'),
      );
      expect(result).toMatchObject({
        kind: 'rows',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'name', type: 'varchar2' },
          { name: 'code', type: 'varchar2' },
          { name: 'salary', type: 'number' },
          { name: 'hired', type: 'date' },
          { name: 'active', type: 'boolean' },
        ],
        truncated: false,
      });
      expect(rowsOf(result)).toEqual([
        [1, 'Ada', '00123', 0.5, '2024-01-15', true],
        [2, 'Grace', null, 98000.25, '2023-06-01', false],
        // Oracle stores '' as NULL; a ';' inside data is not a statement break.
        [3, 'Linus; Torvalds', null, 1234567890123, null, null],
      ]);
    });

    it('supports Oracle-specific SQL', async () => {
      const result = await engine.run(
        req(`SELECT NVL(code, '-') AS code, TO_CHAR(hired, 'YYYY') AS y, DECODE(active, TRUE, 'yes', 'no') AS a
           FROM employees WHERE ROWNUM <= 2 ORDER BY id`),
      );
      expect(rowsOf(result)).toEqual([
        ['00123', '2024', 'yes'],
        ['-', '2023', 'no'],
      ]);
      expect(rowsOf(await engine.run(req('SELECT 1 + 1 AS two FROM dual')))).toEqual([[2]]);
      expect(
        rowsOf(
          await engine.run(req('SELECT name FROM employees ORDER BY id FETCH FIRST 1 ROWS ONLY')),
        ),
      ).toEqual([['Ada']]);
    });

    it('truncates long results', async () => {
      const result = await engine.run(
        req('SELECT level FROM dual CONNECT BY level <= 30', sample, 10),
      );
      expect(result).toMatchObject({ kind: 'rows', truncated: true });
      expect(rowsOf(result)).toHaveLength(10);
    });

    it('reports SQL errors with the Oracle message', async () => {
      expect(await engine.run(req('SELECT nope FROM employees'))).toMatchObject({
        kind: 'error',
        message: expect.stringMatching(/^ORA-00904/),
      });
    });

    it('cannot read other datasets, including hidden data', async () => {
      // Prepare the hidden dataset as grading would.
      expect((await engine.run(req('SELECT count(*) FROM employees', hidden))).kind).toBe('rows');
      // A learner can list the schema names...
      const owners = rowsOf(
        await engine.run(req("SELECT username FROM all_users WHERE username LIKE 'PS_D_%'")),
      ) as string[][];
      expect(owners.length).toBeGreaterThanOrEqual(2);
      const own = rowsOf(
        await engine.run(req("SELECT sys_context('USERENV', 'CURRENT_SCHEMA') FROM dual")),
      ) as string[][];
      // ...but reading any other schema's table fails.
      for (const [owner] of owners) {
        const result = await engine.run(req(`SELECT name FROM ${owner}.employees`));
        if (owner === own[0]?.[0]) expect(result).toMatchObject({ kind: 'rows' });
        else
          expect(result, owner).toMatchObject({
            kind: 'error',
            message: expect.stringMatching(/ORA-00942/),
          });
      }
    });

    it('cannot write, even through Oracle features that run statements', async () => {
      expect((await engine.run(req('DELETE FROM employees'))).kind).toBe('rejected');
      expect(
        (
          await engine.run(
            req('WITH FUNCTION f RETURN NUMBER IS BEGIN RETURN 1; END; SELECT f() FROM dual'),
          )
        ).kind,
      ).toBe('rejected');
      expect((await engine.run(req('SELECT * FROM employees FOR UPDATE'))).kind).toBe('error');
      expect(rowsOf(await engine.run(req('SELECT count(*) FROM employees')))).toEqual([[3]]);
    });

    it('cannot use network or file packages', async () => {
      for (const query of [
        "SELECT utl_http.request('http://example.com') FROM dual",
        "SELECT utl_inaddr.get_host_address('example.com') FROM dual",
        "SELECT httpuritype('http://example.com').getclob() FROM dual",
      ]) {
        const result = await engine.run(req(query));
        expect(result, query).toMatchObject({ kind: 'error' });
      }
    });

    it('stops runaway queries, and the next query works', async () => {
      const started = Date.now();
      const result = await engine.run(
        req('SELECT count(*) FROM all_objects a, all_objects b, all_objects c'),
      );
      expect(['timeout', 'resource-limit']).toContain(result.kind);
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(rowsOf(await engine.run(req('SELECT 1 AS one FROM dual')))).toEqual([[1]]);
    });

    it('shares datasets safely between engines (processes) on the same database', async () => {
      // A dataset nobody has created yet, created by two engines at the same time.
      const fresh = req(
        'SELECT count(*) AS n FROM employees',
        `${sample}
-- ${Date.now()}`,
      );
      const other = new OracleSqlEngine({ connection: oracle, limits: { timeoutMs: 3000 } });
      const [a, b] = await Promise.all([engine.run(fresh), other.run(fresh)]);
      expect(rowsOf(a)).toEqual([[3]]);
      expect(rowsOf(b)).toEqual([[3]]);
      // A third engine (e.g. after a restart) reuses it without rebuilding.
      const third = new OracleSqlEngine({ connection: oracle, limits: { timeoutMs: 3000 } });
      const c = await third.run(fresh);
      expect(rowsOf(c), JSON.stringify(c)).toEqual([[3]]);
      // The first engine still works: nothing changed its credentials.
      expect(rowsOf(await engine.run(fresh))).toEqual([[3]]);
    });

    it('handles concurrent runs', async () => {
      const results = await Promise.all(
        [1, 2, 3, 4].map((n) => engine.run(req(`SELECT ${n} AS n FROM dual`))),
      );
      expect(results.map(rowsOf)).toEqual([[[1]], [[2]], [[3]], [[4]]]);
    });
  },
);
