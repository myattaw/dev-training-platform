/**
 * Lambda handler of the SQL runner function. Runs learner SQL with the same
 * engine as local development (PGlite in a supervised child process; see
 * docs/sql.md), started with a minimal environment so the function role's
 * credentials never reach it. Invoked only by the API function.
 */
import {
  ChildProcessSqlEngine,
  parseSqlBatchRequest,
  parseSqlRunRequest,
  runEach,
  type SqlRunResult,
} from '@pracstack/sql-engine';

const TASK_ROOT = process.env['LAMBDA_TASK_ROOT'] ?? '/var/task';

// Kept warm between invocations: PGlite startup is the slow part. Each query
// still gets a fresh database (see packages/sql-engine).
const engine = new ChildProcessSqlEngine({
  runner: { path: `${TASK_ROOT}/sql-runner.mjs`, execArgv: [] },
  env: {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: '/tmp',
    PRACSTACK_SQL_WORKER: `${TASK_ROOT}/sql-worker.mjs`,
    // An empty cluster made when the image was built: runs never wait for initdb.
    PRACSTACK_SQL_BASE: `${TASK_ROOT}/sql-base.tar`,
  },
  maxQueue: 1,
  // The function has 1536 MB: keep the process well inside it.
  limits: { maxRssMb: 1300, maxQueryMemoryMb: 400 },
});
// Start the runner process during the cold start, alongside the runtime's own startup.
engine.warm();

/** `{ batch }` (the grader: one query on every dataset) or a single run ("Run query"). */
export async function handler(event: unknown): Promise<SqlRunResult | { results: SqlRunResult[] }> {
  const batch = parseSqlBatchRequest(event);
  if (batch) return { results: await runEach(engine, batch) };
  const request = parseSqlRunRequest(event);
  if (!request) return { kind: 'rejected', message: 'The SQL runner received an invalid request.' };
  return engine.run(request);
}
