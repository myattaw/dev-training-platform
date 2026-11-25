/**
 * AWS Lambda entry point (bundled by scripts/build-lambda.ts).
 *
 * Runs only the API logic: progress, scoring and question serving. It never
 * executes learner code or SQL itself: those go to the isolated runner
 * functions (services/runners), named by RUNNER_*_FUNCTION. Without them,
 * those requests return 503.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApi } from '../app';
import { VerifiedJwtAuthenticator } from '../auth';
import { loadContentSource } from '../content/content-source';
import { DynamoRateLimiter } from '../store/dynamo-rate-limit';
import { DynamoAccountStore } from '../store/dynamo-account';
import { DynamoWebStore } from '../store/dynamo-web';
import { DynamoProgressStore } from '../store/dynamo-store';
import { createLambdaHandler } from './adapter';
import { GloballyLimitedCodeRunner, GloballyLimitedSqlEngine } from './global-limit';
import { lambdaInvoke } from './invoke';
import { InvokedCodeRunner } from '@pracstack/code-runner';
import { InvokedSqlEngine } from '@pracstack/sql-engine';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}

const tableName = env('TABLE_NAME');
const limiter = (name: string, limit: number) =>
  new DynamoRateLimiter({ tableName, name, limit, windowMs: 60_000 });

const runnerFunctions = {
  typescript: process.env['RUNNER_TYPESCRIPT_FUNCTION'],
  java: process.env['RUNNER_JAVA_FUNCTION'],
  csharp: process.env['RUNNER_CSHARP_FUNCTION'],
  sql: process.env['RUNNER_SQL_FUNCTION'],
};
const invoke = lambdaInvoke();
/** Runs per minute across all users: bounds runner cost (see docs/aws.md). */
export const GLOBAL_RUNS_PER_MINUTE = { code: 30, sql: 60 };
const codeRunner =
  runnerFunctions.typescript && runnerFunctions.java
    ? new GloballyLimitedCodeRunner(
        new InvokedCodeRunner(invoke, {
          typescript: runnerFunctions.typescript,
          java: runnerFunctions.java,
          // Optional: without it the API reports C# as not available.
          ...(runnerFunctions.csharp ? { csharp: runnerFunctions.csharp } : {}),
        }),
        limiter('code-global', GLOBAL_RUNS_PER_MINUTE.code),
      )
    : undefined;
const sqlEngine = runnerFunctions.sql
  ? new GloballyLimitedSqlEngine(
      new InvokedSqlEngine(invoke, runnerFunctions.sql),
      limiter('sql-global', GLOBAL_RUNS_PER_MINUTE.sql),
    )
  : undefined;

const api = createApi({
  ...(codeRunner ? { codeRunner } : {}),
  ...(sqlEngine ? { sqlEngine } : {}),
  auth: new VerifiedJwtAuthenticator({
    issuer: env('JWT_ISSUER'),
    audience: env('JWT_AUDIENCE'),
  }),
  // Content (public and private) is bundled next to this file at build time.
  content: loadContentSource(fileURLToPath(new URL('./content', import.meta.url))),
  store: new DynamoProgressStore({ tableName }),
  accounts: new DynamoAccountStore({ tableName }),
  // Web challenges are browse-only on AWS: no web runner is deployed (docs/execution-security.md).
  webStore: new DynamoWebStore({ tableName }),
  rateLimiter: limiter('api', 120),
  sqlRateLimiter: limiter('sql', 30),
  codeRateLimiter: limiter('code', 10),
  now: () => new Date(),
  random: Math.random,
  newId: randomUUID,
  logError: (err) => {
    // Structured, and never includes request bodies (which may contain learner code).
    console.error(
      JSON.stringify({
        level: 'error',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
  },
});

export const handler = createLambdaHandler(api);
