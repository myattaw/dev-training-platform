import { describe, expect, it } from 'vitest';
import type { QuestionSource, TrackSource } from './skill';
import { splitQuestion } from './split';
import { type SqlDatabase, sqlLiteral, tablesToSql } from './sql';
import { validateTracks } from './validate';

const db: SqlDatabase = {
  id: 'shop',
  schema: 'CREATE TABLE items (id int, name text, price numeric);',
  sample: [{ table: 'items', columns: ['id', 'name', 'price'], rows: [[1, 'Tea', 3.5]] }],
  hidden: [[{ table: 'items', columns: ['id', 'name', 'price'], rows: [[2, 'Hidden coffee', 4]] }]],
};

const question = (database: SqlDatabase = db): QuestionSource => ({
  id: 'sql-q',
  version: 1,
  difficulty: 1,
  format: 'sql-query',
  dialect: 'postgresql',
  prompt: [{ kind: 'paragraph', text: 'List all items.' }],
  ordered: false,
  database,
  answer: { referenceQuery: 'SELECT * FROM items' },
  hints: [],
  explanation: [{ kind: 'paragraph', text: 'Select everything.' }],
});

const track = (q: QuestionSource): TrackSource => ({
  id: 'pg',
  name: 'PostgreSQL',
  category: 'languages',
  description: 'SQL.',
  topics: [
    {
      id: 'basics',
      name: 'Basics',
      description: 'Basics.',
      skills: [
        {
          id: 'select',
          name: 'Select',
          description: 'Select.',
          questions: [
            q,
            { ...q, id: 'sql-q2', prompt: [{ kind: 'paragraph', text: 'A second task.' }] },
            { ...q, id: 'sql-q3', prompt: [{ kind: 'paragraph', text: 'Another task.' }] },
          ],
        },
      ],
    },
  ],
});

const errors = (q: QuestionSource) =>
  validateTracks([track(q)])
    .filter((i) => i.severity === 'error')
    .map((i) => i.message);

describe('tablesToSql', () => {
  it('generates quoted INSERT statements', () => {
    expect(
      tablesToSql([
        { table: 't', columns: ['a', 'b', 'c', 'd'], rows: [["O'Brien", 1.5, true, null]] },
      ]),
    ).toBe("INSERT INTO t (a, b, c, d) VALUES\n  ('O''Brien', 1.5, TRUE, NULL);");
  });

  it('neutralizes SQL in values and rejects unsafe identifiers', () => {
    expect(sqlLiteral("x'); DROP TABLE t; --")).toBe("'x''); DROP TABLE t; --'");
    expect(() => tablesToSql([{ table: 't; DROP', columns: ['a'], rows: [[1]] }])).toThrow(
      'Invalid SQL identifier',
    );
  });
});

describe('validating SQL questions', () => {
  it('accepts a valid question', () => {
    expect(errors(question())).toEqual([]);
  });

  it('requires hidden datasets with the same shape as the sample', () => {
    expect(errors(question({ ...db, hidden: [] }))).toContain(
      'at least one hidden dataset is required, so hard-coded answers fail',
    );
    const wrongShape = {
      ...db,
      hidden: [[{ table: 'items', columns: ['id', 'name'], rows: [[2, 'x']] }]],
    };
    expect(errors(question(wrongShape))).toContain(
      'must have the same tables and columns as the sample data',
    );
  });

  it('checks identifiers and row lengths', () => {
    const bad = {
      ...db,
      sample: [{ table: 'Items', columns: ['id', 'name', 'price'], rows: [[1, 'Tea']] }],
    };
    const messages = errors(question(bad));
    expect(messages).toContain('invalid SQL identifier "Items"');
    expect(messages).toContain('Items row 1 has 2 values for 3 columns');
  });
});

describe('splitting SQL questions', () => {
  it('publishes schema and sample data, and keeps the reference query and hidden data private', () => {
    const { question: pub, grading } = splitQuestion(question(), 'select');
    expect(pub).toMatchObject({ format: 'sql-query', schema: db.schema, sampleTables: db.sample });
    const json = JSON.stringify(pub);
    expect(json).not.toContain('SELECT * FROM items');
    expect(json).not.toContain('Hidden coffee');
    expect(grading.answer).toEqual({
      format: 'sql-query',
      referenceQuery: 'SELECT * FROM items',
      checkColumnNames: false,
      hiddenData: db.hidden,
    });
  });
});
