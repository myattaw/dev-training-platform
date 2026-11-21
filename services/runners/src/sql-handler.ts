/**
 * Lambda handler of the SQL runner function. Runs learner SQL with the same
 * engine as local development (PGlite in a supervised child process; see
 * docs/sql.md), started with a minimal environment so the function role's
 * credentials never reach it. Invoked only by the API function.
 */
import {
  ChildProcessSqlEngine,
  parseSqlRunRequest,
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
  },
  maxQueue: 1,
});

export async function handler(event: unknown): Promise<SqlRunResult> {
  const request = parseSqlRunRequest(event);
  if (!request) return { kind: 'rejected', message: 'The SQL runner received an invalid request.' };
  return engine.run(request);
}
