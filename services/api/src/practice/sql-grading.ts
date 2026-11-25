import type { RevealedAnswer, RunSqlResponse } from '@pracstack/api-contracts';
import {
  type QuestionAnswer,
  type SqlQueryQuestion,
  type SqlTable,
  tablesToSql,
} from '@pracstack/content-model';
import {
  compareResults,
  type ResultSet,
  runEach,
  type SqlEngine,
  type SqlRunResult,
} from '@pracstack/sql-engine';
import { ApiError, badRequest } from '../http';
import type { Grade } from './grading';

type SqlKey = Extract<QuestionAnswer, { format: 'sql-query' }>;

/** Rows returned to the learner by "Run query". */
export const PREVIEW_ROWS = 100;
/** Rows compared when grading (reference results are far smaller). */
const GRADING_ROWS = 1000;

/**
 * Grades SQL by behavior: the learner's query and the reference query run
 * on the sample data and on every hidden dataset, and their results are
 * compared. SQL text is never compared.
 *
 * Only results and errors from the *sample* data are described to the
 * learner. For hidden datasets the learner only learns that the query was
 * wrong there, so hidden data cannot be read out through error messages or
 * result details.
 *
 * Speed: the reference results usually come with the content (recorded by the
 * content build), and the learner's query runs on all datasets in one batch,
 * which is a single runner invocation on AWS.
 */
export class SqlGrader {
  /** Reference results never change for a question version, so compute them once. */
  private readonly referenceCache = new Map<string, Promise<readonly ResultSet[]>>();

  constructor(private readonly engine: SqlEngine) {}

  async grade(question: SqlQueryQuestion, key: SqlKey, query: string): Promise<Grade> {
    const revealed: RevealedAnswer = { format: 'sql-query', referenceQuery: key.referenceQuery };
    const datasets = [question.sampleTables, ...key.hiddenData];
    const references = await this.references(question, key, datasets);
    // Stops at the first dataset where the query fails, so a slow query is stopped once.
    const results = await runEach(this.engine, {
      databases: datasets.map((tables) => database(question, tables)),
      query,
      maxRows: GRADING_ROWS,
    });
    let close: string | undefined;

    for (const [i, expected] of references.entries()) {
      const isSample = i === 0;
      const actual = results[i];
      if (!actual) {
        // Only possible if the engine broke its contract (all results until a failure).
        throw new ApiError('internal', 'This question could not be graded right now. Try again.');
      }

      if (actual.kind === 'rejected') {
        // Not a query at all (empty, too long, not SELECT): a usage error, not a wrong answer.
        throw badRequest(actual.message);
      }
      if (actual.kind !== 'rows') {
        const note = isSample
          ? failureMessage(actual)
          : 'Your query fails on other data than the sample. Make sure it works for any rows in these tables.';
        return { result: 'incorrect', note, revealed };
      }

      const comparison = compareResults(expected, actual, {
        ordered: question.ordered,
        checkColumnNames: key.checkColumnNames,
      });
      if (comparison.verdict === 'different') {
        const note = isSample
          ? comparison.reason
          : 'Your query gives the right result for the sample data, but not for other data. Make sure it does not depend on specific values in the sample.';
        return { result: 'incorrect', note, revealed };
      }
      if (comparison.verdict === 'close') close ??= comparison.reason;
    }

    return close ? { result: 'partial', note: close, revealed } : { result: 'correct', revealed };
  }

  /** Runs a learner query against the sample data only, for "Run query". */
  async preview(question: SqlQueryQuestion, query: string): Promise<RunSqlResponse> {
    const result = await this.engine.run({
      database: database(question, question.sampleTables),
      query,
      maxRows: PREVIEW_ROWS,
    });
    if (result.kind !== 'rows') return { kind: 'error', message: failureMessage(result) };
    return {
      kind: 'rows',
      table: { columns: result.columns, rows: result.rows, truncated: result.truncated },
      durationMs: result.durationMs,
    };
  }

  /** The reference query's results on each dataset: recorded with the content, or run once. */
  private async references(
    question: SqlQueryQuestion,
    key: SqlKey,
    datasets: readonly (readonly SqlTable[])[],
  ): Promise<readonly ResultSet[]> {
    if (key.expected?.length === datasets.length) return key.expected;
    const cacheKey = `${question.id}@${question.version}`;
    let run = this.referenceCache.get(cacheKey);
    if (!run) {
      run = runEach(this.engine, {
        databases: datasets.map((tables) => database(question, tables)),
        query: key.referenceQuery,
        maxRows: GRADING_ROWS,
      }).then((results) => {
        const rows = results.filter((r) => r.kind === 'rows');
        if (rows.length !== datasets.length) throw new Error('reference query failed');
        return rows;
      });
      // Temporary failures (busy, restarted engine) should not stick in the cache.
      run.catch(() => this.referenceCache.delete(cacheKey));
      this.referenceCache.set(cacheKey, run);
    }
    try {
      return await run;
    } catch {
      throw new ApiError('internal', 'This question could not be graded right now. Try again.');
    }
  }
}

function database(question: SqlQueryQuestion, tables: readonly SqlTable[]) {
  return { schemaSql: question.schema, dataSql: tablesToSql(tables) };
}

function failureMessage(result: Exclude<SqlRunResult, { kind: 'rows' }>): string {
  switch (result.kind) {
    case 'timeout':
      return `Your query took longer than ${result.timeoutMs / 1000} seconds and was stopped.`;
    case 'resource-limit':
    case 'rejected':
    case 'error':
      return result.message;
  }
}
