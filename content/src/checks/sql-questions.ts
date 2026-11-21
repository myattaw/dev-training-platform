import {
  SQL_DIALECT_LABELS,
  type SqlDialect,
  type SqlQuestionSource,
  type SqlTable,
  tablesToSql,
  type TrackSource,
  type ValidationIssue,
} from '@pracstack/content-model';
import { compareResults, type SqlEngine, type SqlRunResult } from '@pracstack/sql-engine';

const MAX_REFERENCE_ROWS = 1000;

/**
 * Runs every SQL question's reference query against the sample data and
 * each hidden dataset, using the same isolated engine learners use:
 *
 * - the database setup and the reference query must succeed everywhere;
 * - `ordered` questions must actually sort (`ORDER BY` in the reference);
 * - warns when the hidden datasets give the same result as the sample,
 *   because then they cannot catch answers hard-coded from the sample.
 */
export async function checkSqlQuestions(
  tracks: readonly TrackSource[],
  engines: Partial<Record<SqlDialect, SqlEngine>>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const unchecked = new Map<SqlDialect, number>();
  for (const track of tracks) {
    for (const topic of track.topics) {
      for (const skill of topic.skills) {
        for (const q of skill.questions) {
          if (q.format !== 'sql-query') continue;
          const path = `track:${track.id}/${topic.id}/${skill.id}/${q.id}`;
          const engine = engines[q.dialect];
          if (!engine) {
            unchecked.set(q.dialect, (unchecked.get(q.dialect) ?? 0) + 1);
            continue;
          }
          issues.push(...(await checkQuestion(path, q, engine)));
        }
      }
    }
  }
  for (const [dialect, count] of unchecked) {
    const label = SQL_DIALECT_LABELS[dialect];
    issues.push({
      severity: 'warning',
      path: `sql:${dialect}`,
      message:
        `${count} ${label} reference queries were NOT run (no ${label} engine). ` +
        (dialect === 'oracle'
          ? 'Start Oracle with "npm run oracle:start", or run the content tests, which do.'
          : ''),
    });
  }
  return issues;
}

async function checkQuestion(
  path: string,
  q: SqlQuestionSource,
  engine: SqlEngine,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', path, message });
  const warning = (message: string) => issues.push({ severity: 'warning', path, message });

  if (q.ordered && !/\border\s+by\b/i.test(q.answer.referenceQuery)) {
    error('ordered questions need ORDER BY in the reference query');
  }

  const datasets: [string, readonly SqlTable[]][] = [
    ['sample data', q.database.sample],
    ...q.database.hidden.map((d, i): [string, readonly SqlTable[]] => [
      `hidden dataset ${i + 1}`,
      d,
    ]),
  ];
  const results: SqlRunResult[] = [];
  for (const [label, tables] of datasets) {
    const result = await engine.run({
      database: { schemaSql: q.database.schema, dataSql: tablesToSql(tables) },
      query: q.answer.referenceQuery,
      maxRows: MAX_REFERENCE_ROWS,
    });
    results.push(result);
    if (result.kind !== 'rows') {
      error(
        `reference query fails on ${label}: ${'message' in result ? result.message : result.kind}`,
      );
    } else if (result.truncated) {
      error(`reference query returns more than ${MAX_REFERENCE_ROWS} rows on ${label}`);
    }
  }
  if (issues.some((i) => i.severity === 'error')) return issues;

  const [sample, ...hidden] = results.filter((r) => r.kind === 'rows');
  if (sample && sample.rows.length === 0)
    warning('reference query returns no rows on the sample data');
  if (
    sample &&
    hidden.length > 0 &&
    hidden.every(
      (h) =>
        compareResults(sample, h, { ordered: q.ordered, checkColumnNames: false }).verdict ===
        'equal',
    )
  ) {
    warning(
      'every hidden dataset gives the same result as the sample, so hard-coded answers would pass',
    );
  }
  return issues;
}
