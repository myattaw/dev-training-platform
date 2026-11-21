import type { AnswerPayload } from '@pracstack/api-contracts';
import { buildContent } from '@pracstack/content';
import type { QuestionAnswer, SplitQuestion } from '@pracstack/content-model';
import {
  ChildProcessSqlEngine,
  type OracleContainer,
  OracleSqlEngine,
  oracleForTests,
} from '@pracstack/sql-engine';
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
const graders: Partial<Record<'postgresql' | 'oracle', SqlGrader>> = {
  postgresql: new SqlGrader(engine),
};
let questions: SplitQuestion[] = [];
let oracle: OracleContainer | undefined;
const skipDocker = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

beforeAll(async () => {
  // Oracle questions need a real Oracle (Docker); see docs/sql.md.
  if (!skipDocker) {
    oracle = await oracleForTests();
    graders.oracle = new SqlGrader(new OracleSqlEngine({ connection: oracle }));
  }
  const build = await buildContent({
    sqlEngine: engine,
    ...(graders.oracle && oracle
      ? { sqlEngines: { oracle: new OracleSqlEngine({ connection: oracle }) } }
      : {}),
  });
  questions = [...build.privateFiles]
    .filter(([path]) => path.endsWith('.questions.json'))
    .flatMap(([, value]) => value as SplitQuestion[]);
}, 400_000);
afterAll(async () => {
  await engine.close();
});

describe('grading the real question bank', { timeout: 120_000 }, () => {
  it('every question is graded correct when answered with its own key', async () => {
    expect(questions.length).toBeGreaterThanOrEqual(70);
    const failures: string[] = [];
    for (const q of questions) {
      if (q.question.format === 'sql-query' && !graders[q.question.dialect]) continue;
      const answer = answerFromKey(q.grading.answer);
      const grade =
        q.question.format === 'sql-query' &&
        q.grading.answer.format === 'sql-query' &&
        answer.format === 'sql-query'
          ? await graders[q.question.dialect]!.grade(q.question, q.grading.answer, answer.query)
          : gradeAnswer(q.question, q.grading.answer, answer);
      if (grade.result !== 'correct')
        failures.push(`${q.question.id}: ${grade.result} ${grade.note ?? ''}`);
    }
    expect(failures).toEqual([]);
  });
});
