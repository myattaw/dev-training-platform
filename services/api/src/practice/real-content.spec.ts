import type { AnswerPayload } from '@pracstack/api-contracts';
import { buildContent, TRACKS } from '@pracstack/content';
import {
  type QuestionAnswer,
  type SplitQuestion,
  type SqlDialect,
  splitTrack,
} from '@pracstack/content-model';
import {
  ChildProcessSqlEngine,
  type OracleContainer,
  OracleSqlEngine,
  oracleForTests,
  type SqlServerContainer,
  SqlServerSqlEngine,
  sqlServerForTests,
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
const graders: Partial<Record<SqlDialect, SqlGrader>> = {
  postgresql: new SqlGrader(engine),
};
const questionsByFile = new Map<string, SplitQuestion[]>();
let oracle: OracleContainer | undefined;
let sqlServer: SqlServerContainer | undefined;
const skipDocker = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

beforeAll(async () => {
  // Oracle questions need a real Oracle (Docker); see docs/sql.md.
  if (!skipDocker) {
    oracle = await oracleForTests();
    graders.oracle = new SqlGrader(new OracleSqlEngine({ connection: oracle }));
    sqlServer = await sqlServerForTests();
    graders.sqlserver = new SqlGrader(new SqlServerSqlEngine({ connection: sqlServer }));
  }
  const build = await buildContent({
    sqlEngine: engine,
    sqlEngines: {
      ...(oracle ? { oracle: new OracleSqlEngine({ connection: oracle }) } : {}),
      ...(sqlServer ? { sqlserver: new SqlServerSqlEngine({ connection: sqlServer }) } : {}),
    },
  });
  for (const [path, value] of build.privateFiles)
    if (path.endsWith('.questions.json')) questionsByFile.set(path, value as SplitQuestion[]);
}, 400_000);
afterAll(async () => {
  await engine.close();
});

/*
 * One test per skill file rather than one for the whole bank: every Oracle
 * query runs against a real Oracle, and grading everything inside a single
 * 120 s test started timing out as the bank grew. Each file now has its own
 * budget, and a failure names the skill.
 */
const SKILL_FILES = TRACKS.flatMap((track) =>
  Object.keys(splitTrack(track).questionsBySkill).map(
    (skillId) => `skill-mastery/${track.id}/${skillId}.questions.json`,
  ),
);

describe('grading the real question bank', { timeout: 120_000 }, () => {
  it('builds a question file for every skill, and nothing else', () => {
    expect([...questionsByFile.keys()].sort()).toEqual([...SKILL_FILES].sort());
    const total = [...questionsByFile.values()].reduce((n, qs) => n + qs.length, 0);
    expect(total).toBeGreaterThanOrEqual(70);
  });

  it.each(SKILL_FILES)('%s: every question is graded correct with its own key', async (file) => {
    const questions = questionsByFile.get(file) ?? [];
    expect(questions.length).toBeGreaterThan(0);
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
