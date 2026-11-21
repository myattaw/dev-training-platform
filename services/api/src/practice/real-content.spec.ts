import type { AnswerPayload } from '@pracstack/api-contracts';
import { buildContent } from '@pracstack/content';
import type { QuestionAnswer, SplitQuestion } from '@pracstack/content-model';
import { ChildProcessSqlEngine } from '@pracstack/sql-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gradeAnswer } from './grading';
import { SqlGrader } from './sql-grading';

/** The answer a learner would give if they knew the key. */
function answerFromKey(key: QuestionAnswer): AnswerPayload {
  switch (key.format) {
    case 'multiple-choice':
      return { format: key.format, selected: key.correct };
    case 'predict-output':
      return { format: key.format, output: key.output };
    case 'fill-in-blank':
      return {
        format: key.format,
        blanks: Object.fromEntries(
          Object.entries(key.blanks).map(([id, b]) => [id, b.accepted[0] ?? '']),
        ),
      };
    case 'sql-query':
      return { format: key.format, query: key.referenceQuery };
  }
}

const engine = new ChildProcessSqlEngine();
const sql = new SqlGrader(engine);
let questions: SplitQuestion[] = [];

beforeAll(async () => {
  const build = await buildContent({ sqlEngine: engine });
  questions = [...build.privateFiles]
    .filter(([path]) => path.endsWith('.questions.json'))
    .flatMap(([, value]) => value as SplitQuestion[]);
}, 120_000);
afterAll(() => engine.close());

describe('grading the real question bank', { timeout: 120_000 }, () => {
  it('every question is graded correct when answered with its own key', async () => {
    expect(questions.length).toBeGreaterThanOrEqual(40);
    const failures: string[] = [];
    for (const q of questions) {
      const answer = answerFromKey(q.grading.answer);
      const grade =
        q.question.format === 'sql-query' &&
        q.grading.answer.format === 'sql-query' &&
        answer.format === 'sql-query'
          ? await sql.grade(q.question, q.grading.answer, answer.query)
          : gradeAnswer(q.question, q.grading.answer, answer);
      if (grade.result !== 'correct')
        failures.push(`${q.question.id}: ${grade.result} ${grade.note ?? ''}`);
    }
    expect(failures).toEqual([]);
  });
});
