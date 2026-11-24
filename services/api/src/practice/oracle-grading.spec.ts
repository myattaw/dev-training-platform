import type { NextQuestionResponse, ProgressResponse } from '@pracstack/api-contracts';
import { TRACKS } from '@pracstack/content';
import { type SplitQuestion, splitTrack } from '@pracstack/content-model';
import { type OracleContainer, OracleSqlEngine, oracleForTests } from '@pracstack/sql-engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { createContentSource } from '../content/content-source';
import { testApi } from '../testing/fixtures';
import { SqlGrader } from './sql-grading';

/*
 * Oracle grading with the real track and a real Oracle Database Free:
 * answers hard-coded from the sample data, or with the classic NULL mistake,
 * fail on hidden data, and the feedback never reveals hidden rows.
 * Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const oracleTrack = TRACKS.find((t) => t.id === 'oracle-sql');
if (!oracleTrack) throw new Error('Oracle track missing');
const { catalog, questionsBySkill } = splitTrack(oracleTrack);
const question = (id: string): SplitQuestion => {
  const q = Object.values(questionsBySkill)
    .flat()
    .find((x) => x.question.id === id);
  if (!q) throw new Error(`No question ${id}`);
  return q;
};
/** Values that exist only in the hidden datasets. */
const HIDDEN_ONLY = ["O'Neil", 'Mae Jemison', 'Joan Clarke', 'Lisbon', 'Oslo'];

describe.skipIf(skip)('Oracle grading (real Oracle)', { timeout: 60_000 }, () => {
  let oracle: OracleContainer;
  let grader: SqlGrader;
  beforeAll(async () => {
    oracle = await oracleForTests();
    grader = new SqlGrader(new OracleSqlEngine({ connection: oracle }));
  }, 300_000);

  const grade = (id: string, query: string) => {
    const q = question(id);
    if (q.question.format !== 'sql-query' || q.grading.answer.format !== 'sql-query')
      throw new Error('not a SQL question');
    return grader.grade(q.question, q.grading.answer, query);
  };

  it('accepts a different but correct query', async () => {
    const result = await grade(
      'ora-nvl-total-pay',
      'SELECT name, COALESCE(commission, 0) + salary AS total_pay FROM employees',
    );
    expect(result.result).toBe('correct');
  });

  it('rejects the NVL(x, 0) = 0 mistake, which only hidden data exposes', async () => {
    const result = await grade(
      'ora-no-commission',
      'SELECT name FROM employees WHERE NVL(commission, 0) = 0',
    );
    expect(result.result).toBe('incorrect');
    expect(result.note).toMatch(/right result for the sample data, but not for other data/);
    for (const secret of HIDDEN_ONLY) expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('rejects answers hard-coded from the sample, without revealing hidden rows', async () => {
    const result = await grade(
      'ora-level-three',
      "SELECT name FROM employees WHERE name IN ('Alan Turing', 'Katherine Johnson', 'Ken Thompson', 'Hedy Lamarr', 'Linus Torvalds')",
    );
    expect(result.result).toBe('incorrect');
    for (const secret of HIDDEN_ONLY) expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('describes errors on the sample data, but not errors that only happen on hidden data', async () => {
    const sampleError = await grade('ora-hire-year', 'SELECT nme FROM employees');
    expect(sampleError.note).toMatch(/ORA-00904/);
    // Fails only where a hidden dataset has a commission of 0.
    const hiddenOnly = await grade(
      'ora-no-commission',
      // Right on the sample; divides by zero where a hidden row has commission 0 (CASE forces the order).
      'SELECT name FROM employees WHERE CASE WHEN 1 / NVL(commission, 1) > 0 THEN commission END IS NULL',
    );
    expect(hiddenOnly.result).toBe('incorrect');
    expect(hiddenOnly.note).not.toMatch(/ORA-/);
  });

  it('runs "Run query" on the sample data only', async () => {
    const q = question('ora-hierarchy-levels');
    if (q.question.format !== 'sql-query') throw new Error('not SQL');
    const preview = await grader.preview(q.question, 'SELECT name FROM employees ORDER BY name');
    expect(JSON.stringify(preview)).toContain('Rosalind Franklin');
    for (const secret of HIDDEN_ONLY) expect(JSON.stringify(preview)).not.toContain(secret);
  });
});

describe('Oracle track without an Oracle engine (e.g. on AWS)', () => {
  it('serves only the questions that need no database', async () => {
    const content = createContentSource('test', [catalog], questionsBySkill, []);
    const api = testApi({ content });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const res = await api.call('POST', '/api/skill-mastery/practice/next', {
        skillId: 'ora-nulls',
      });
      expect(res.status).toBe(200);
      const served = res.body as NextQuestionResponse;
      expect(served.question.format).not.toBe('sql-query');
      seen.add(served.question.id);
      await api.store.deleteToken(served.token);
    }
    // Seven of the skill's twenty questions need no database (concept and predict-output).
    const offline = questionsBySkill['ora-nulls']?.filter((q) => q.question.format !== 'sql-query');
    expect(offline).toHaveLength(7);
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  it('tells the track page that Oracle query writing is coming soon', async () => {
    const content = createContentSource('test', [catalog], questionsBySkill, []);
    const res = await testApi({ content }).call(
      'GET',
      '/api/skill-mastery/progress?technologyId=oracle-sql',
    );
    expect(res.status).toBe(200);
    expect((res.body as ProgressResponse).sqlComingSoon).toEqual(['Oracle']);
  });
});
