import { availableParallelism } from 'node:os';
import {
  ChildProcessSqlEngine,
  type SqlEngine,
  type SqlRunRequest,
  type SqlRunResult,
} from '@pracstack/sql-engine';

/** Several isolated PostgreSQL runner processes: enough to use the machine, few enough to stay light. */
export function defaultPoolSize(): number {
  return Math.max(1, Math.min(4, availableParallelism() - 1));
}

/**
 * Build-time SQL engine for checking authored reference queries; never used
 * for learner queries. It spreads queries over several `ChildProcessSqlEngine`
 * processes (each one runs a single query at a time) and remembers results, so
 * building the same content again in one process (the content tests build it
 * about ten times) does not run the same queries again.
 *
 * Only completed results (`rows`, or a SQL error in the authored query) are
 * remembered; time-outs and resource limits are retried on the next request.
 */
export class SqlCheckPool implements SqlEngine {
  /** How many queries can run at once; `checkSqlQuestions` uses this. */
  readonly concurrency: number;
  private readonly engines: SqlEngine[];
  private readonly busy: number[];
  private readonly results = new Map<string, Promise<SqlRunResult>>();

  constructor(
    size = defaultPoolSize(),
    create: () => SqlEngine = () => new ChildProcessSqlEngine(),
  ) {
    this.concurrency = Math.max(1, size);
    this.engines = Array.from({ length: this.concurrency }, create);
    this.busy = this.engines.map(() => 0);
  }

  run(request: SqlRunRequest): Promise<SqlRunResult> {
    const key = JSON.stringify([
      request.database.schemaSql,
      request.database.dataSql,
      request.query,
      request.maxRows,
    ]);
    let result = this.results.get(key);
    if (!result) {
      result = this.dispatch(request);
      this.results.set(key, result);
      result.then(
        (r) => {
          if (r.kind !== 'rows' && r.kind !== 'error') this.results.delete(key);
        },
        () => this.results.delete(key),
      );
    }
    return result;
  }

  async close(): Promise<void> {
    await Promise.all(this.engines.map((e) => e.close()));
  }

  private async dispatch(request: SqlRunRequest): Promise<SqlRunResult> {
    // The least busy process; ties go to the lowest index.
    const i = this.busy.indexOf(Math.min(...this.busy));
    this.busy[i]!++;
    try {
      return await this.engines[i]!.run(request);
    } finally {
      this.busy[i]!--;
    }
  }
}
