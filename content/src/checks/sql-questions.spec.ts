import type { QuestionSource, SqlDatabase, TrackSource } from '@pracstack/content-model';
import { ChildProcessSqlEngine } from '@pracstack/sql-engine';
import { afterAll, describe, expect, it } from 'vitest';
import { checkSqlQuestions } from './sql-questions';

const engine = new ChildProcessSqlEngine();
afterAll(() => engine.close());

const db: SqlDatabase = {
  id: 'tiny',
  schema: 'CREATE TABLE items (id int, name text);',
  sample: [
    {
      table: 'items',
      columns: ['id', 'name'],
      rows: [
        [1, 'a'],
        [2, 'b'],
      ],
    },
  ],
  hidden: [[{ table: 'items', columns: ['id', 'name'], rows: [[3, 'c']] }]],
};

const question = (
  overrides: Partial<Extract<QuestionSource, { format: 'sql-query' }>> = {},
): QuestionSource => ({
  id: 'q',
  version: 1,
  difficulty: 1,
  format: 'sql-query',
  dialect: 'postgresql',
  prompt: [{ kind: 'paragraph', text: 'List names.' }],
  ordered: false,
  database: db,
  answer: { referenceQuery: 'SELECT name FROM items' },
  hints: [],
  explanation: [{ kind: 'paragraph', text: 'Select names.' }],
  ...overrides,
});

const check = (q: QuestionSource) => {
  const track: TrackSource = {
    id: 'pg',
    name: 'PG',
    description: 'PG.',
    topics: [
      {
        id: 't',
        name: 'T',
        description: 'T.',
        skills: [{ id: 's', name: 'S', description: 'S.', questions: [q] }],
      },
    ],
  };
  return checkSqlQuestions([track], { postgresql: engine }).then((issues) =>
    issues.map((i) => `${i.severity}: ${i.message}`),
  );
};

describe('checkSqlQuestions', { timeout: 60_000 }, () => {
  it('accepts a working reference query', async () => {
    expect(await check(question())).toEqual([]);
  });

  it('fails when the reference query has an error', async () => {
    expect(await check(question({ answer: { referenceQuery: 'SELECT nam FROM items' } }))).toEqual([
      'error: reference query fails on sample data: column "nam" does not exist',
      'error: reference query fails on hidden dataset 1: column "nam" does not exist',
    ]);
  });

  it('fails when the database setup is broken', async () => {
    const broken = { ...db, schema: 'CREATE TABLE items (id int);' };
    const issues = await check(question({ database: broken }));
    expect(issues[0]).toContain('The exercise database could not be created');
  });

  it('requires ORDER BY for ordered questions', async () => {
    expect(await check(question({ ordered: true }))).toContain(
      'error: ordered questions need ORDER BY in the reference query',
    );
  });

  it('warns when hidden data cannot tell a hard-coded answer apart', async () => {
    const same = { ...db, hidden: [db.sample] };
    expect(await check(question({ database: same }))).toEqual([
      'warning: every hidden dataset gives the same result as the sample, so hard-coded answers would pass',
    ]);
  });
});
