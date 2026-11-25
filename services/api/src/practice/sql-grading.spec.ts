import { splitQuestion, type SqlDatabase, tablesToSql } from '@pracstack/content-model';
import { ChildProcessSqlEngine, runEachSequentially, type SqlEngine } from '@pracstack/sql-engine';
import { afterAll, describe, expect, it } from 'vitest';
import { ApiError } from '../http';
import { SqlGrader } from './sql-grading';

const db: SqlDatabase = {
  id: 'shop',
  schema:
    'CREATE TABLE items (id int PRIMARY KEY, name text NOT NULL, price numeric(6, 2) NOT NULL);',
  sample: [
    {
      table: 'items',
      columns: ['id', 'name', 'price'],
      rows: [
        [1, 'Tea', 3.5],
        [2, 'Coffee', 4.25],
        [3, 'Water', 1],
      ],
    },
  ],
  hidden: [
    [
      {
        table: 'items',
        columns: ['id', 'name', 'price'],
        rows: [
          [1, 'Juice', 4],
          [2, 'Soda', 2.75],
          [3, 'Milk', 3.1],
        ],
      },
    ],
  ],
};

const split = (ordered: boolean, referenceQuery: string, checkColumnNames = false) => {
  const { question, grading } = splitQuestion(
    {
      id: `q-${ordered}`,
      version: 1,
      difficulty: 1,
      format: 'sql-query',
      dialect: 'postgresql',
      prompt: [{ kind: 'paragraph', text: 'Prompt.' }],
      ordered,
      database: db,
      answer: { referenceQuery, checkColumnNames },
      hints: [],
      explanation: [{ kind: 'paragraph', text: 'Explanation.' }],
    },
    'skill',
  );
  if (question.format !== 'sql-query' || grading.answer.format !== 'sql-query')
    throw new Error('not sql');
  return { question, key: grading.answer };
};

const engine = new ChildProcessSqlEngine();
const grader = new SqlGrader(engine);
afterAll(() => engine.close());

const expensive = split(false, 'SELECT name FROM items WHERE price > 3');
const byPrice = split(true, 'SELECT name, price FROM items ORDER BY price DESC');

describe('SqlGrader', { timeout: 60_000 }, () => {
  it('accepts a differently written query with the same results', async () => {
    const grade = await grader.grade(
      expensive.question,
      expensive.key,
      'select i.name from items i where not (i.price <= 3)',
    );
    expect(grade).toEqual({
      result: 'correct',
      revealed: { format: 'sql-query', referenceQuery: 'SELECT name FROM items WHERE price > 3' },
    });
  });

  it('rejects answers hard-coded from the sample data, without revealing hidden rows', async () => {
    const grade = await grader.grade(
      expensive.question,
      expensive.key,
      "SELECT name FROM items WHERE name IN ('Tea', 'Coffee')",
    );
    expect(grade.result).toBe('incorrect');
    expect(grade.note).toContain('right result for the sample data, but not for other data');
    expect(grade.note).not.toMatch(/Juice|Milk/);
  });

  it('explains wrong results on the sample data', async () => {
    const grade = await grader.grade(expensive.question, expensive.key, 'SELECT name FROM items');
    expect(grade).toMatchObject({
      result: 'incorrect',
      note: 'Expected 2 rows, but your query returns 3.',
    });
  });

  it('reports SQL errors on the sample data', async () => {
    const grade = await grader.grade(expensive.question, expensive.key, 'SELECT nme FROM items');
    expect(grade).toMatchObject({ result: 'incorrect', note: 'column "nme" does not exist' });
  });

  it('does not leak error details that only occur on hidden data', async () => {
    // Division by zero happens only for the hidden row priced 4.00.
    const grade = await grader.grade(
      expensive.question,
      expensive.key,
      'SELECT name FROM items WHERE price > 3 AND 1 / (price - 4) IS NOT NULL',
    );
    expect(grade.result).toBe('incorrect');
    expect(grade.note).toBe(
      'Your query fails on other data than the sample. Make sure it works for any rows in these tables.',
    );
  });

  it('gives partial credit for the right rows in the wrong order', async () => {
    const grade = await grader.grade(
      byPrice.question,
      byPrice.key,
      'SELECT name, price FROM items ORDER BY price',
    );
    expect(grade).toMatchObject({
      result: 'partial',
      note: 'Right data, but the rows are not in the requested order.',
    });
  });

  it('refuses statements that are not queries, without grading them', async () => {
    await expect(
      grader.grade(expensive.question, expensive.key, 'DELETE FROM items'),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('previews results on the sample data only', async () => {
    const preview = await grader.preview(expensive.question, 'SELECT name FROM items ORDER BY id');
    expect(preview).toMatchObject({
      kind: 'rows',
      table: {
        columns: [{ name: 'name', type: 'text' }],
        rows: [['Tea'], ['Coffee'], ['Water']],
        truncated: false,
      },
    });
    expect(await grader.preview(expensive.question, 'SELECT nope')).toEqual({
      kind: 'error',
      message: 'column "nope" does not exist',
    });
  });
});

describe('SqlGrader: speed', { timeout: 60_000 }, () => {
  /** Counts what reaches the engine: batches, and single runs. */
  const counting = () => {
    const calls: { kind: 'batch' | 'run'; query: string; databases: number }[] = [];
    const counted: SqlEngine = {
      run: (request) => {
        calls.push({ kind: 'run', query: request.query, databases: 1 });
        return engine.run(request);
      },
      runEach: (request) => {
        calls.push({ kind: 'batch', query: request.query, databases: request.databases.length });
        return runEachSequentially(engine, request);
      },
      close: () => Promise.resolve(),
    };
    return { calls, grader: new SqlGrader(counted) };
  };

  it('grades against recorded reference results, in one batch for all datasets', async () => {
    const { calls, grader } = counting();
    const sample = await engine.run({
      database: { schemaSql: db.schema, dataSql: tablesToSql(db.sample) },
      query: 'SELECT name FROM items WHERE price > 3',
      maxRows: 1000,
    });
    const hidden = await engine.run({
      database: { schemaSql: db.schema, dataSql: tablesToSql(db.hidden[0]!) },
      query: 'SELECT name FROM items WHERE price > 3',
      maxRows: 1000,
    });
    if (sample.kind !== 'rows' || hidden.kind !== 'rows') throw new Error('reference failed');
    const key = { ...expensive.key, expected: [sample, hidden] };

    const grade = await grader.grade(
      expensive.question,
      key,
      'SELECT name FROM items WHERE price > 3',
    );
    expect(grade.result).toBe('correct');
    // The reference query never runs: only the learner's, once, on both datasets.
    expect(calls).toEqual([
      { kind: 'batch', query: 'SELECT name FROM items WHERE price > 3', databases: 2 },
    ]);
  });

  it('runs the reference query once per question when no results were recorded', async () => {
    const { calls, grader } = counting();
    const fresh = split(false, 'SELECT name FROM items WHERE price > 2');
    for (let i = 0; i < 2; i++) await grader.grade(fresh.question, fresh.key, 'SELECT 1');
    const references = calls.filter((c) => c.query === 'SELECT name FROM items WHERE price > 2');
    expect(references).toEqual([
      { kind: 'batch', query: 'SELECT name FROM items WHERE price > 2', databases: 2 },
    ]);
  });

  it('ignores recorded results that do not match the datasets', async () => {
    const { calls, grader } = counting();
    // A stale recording (wrong number of datasets) is ignored, not trusted.
    const key = { ...expensive.key, expected: [{ columns: [], rows: [] }] };
    const grade = await grader.grade(
      expensive.question,
      key,
      'SELECT name FROM items WHERE price > 3',
    );
    expect(grade.result).toBe('correct');
    expect(calls.some((c) => c.query === expensive.key.referenceQuery)).toBe(true);
  });
});
