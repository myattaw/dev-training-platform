/**
 * AWS Lambda entry point of the web worker (bundled by scripts/build-lambda.ts
 * next to the API, with the same content). Invoked only by the API function,
 * asynchronously, with `{ userId, runId }` of a stored, queued run. It never
 * runs learner code itself: it invokes the web runner function of the run's
 * framework (services/runners, web-handler.ts), named by WEB_RUNNER_*_FUNCTION,
 * verifies the signed response, grades it and stores the result.
 */
import { fileURLToPath } from 'node:url';
import { LambdaWebExecutor } from '@pracstack/web-runner';
import { loadContentSource } from '../content/content-source';
import { DynamoWebStore } from '../store/dynamo-web';
import { DEFAULT_WEB_POLICY } from '../web/web-challenge-service';
import { WebRunWorker } from '../web/web-run-worker';
import { lambdaInvoke } from './invoke';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}

const logError = (err: unknown) =>
  // Structured, and never includes learner code or application output.
  console.error(
    JSON.stringify({
      level: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

const content = loadContentSource(fileURLToPath(new URL('./content', import.meta.url)));
const executor = new LambdaWebExecutor(
  lambdaInvoke(),
  {
    ...(process.env['WEB_RUNNER_ASPNETCORE_FUNCTION']
      ? { aspnetcore: process.env['WEB_RUNNER_ASPNETCORE_FUNCTION'] }
      : {}),
    ...(process.env['WEB_RUNNER_SPRING_BOOT_FUNCTION']
      ? { 'spring-boot': process.env['WEB_RUNNER_SPRING_BOOT_FUNCTION'] }
      : {}),
    ...(process.env['WEB_RUNNER_DJANGO_FUNCTION']
      ? { django: process.env['WEB_RUNNER_DJANGO_FUNCTION'] }
      : {}),
  },
  {
    // A metric filter on this line raises the alarm (docs/lambda-web-runner.md).
    onRejected: (framework) =>
      console.error(JSON.stringify({ level: 'alarm', event: 'web-runner-unverified', framework })),
  },
);
const worker = new WebRunWorker({
  findChallenge: (id) => content.findWebChallenge(id),
  store: new DynamoWebStore({ tableName: env('TABLE_NAME') }),
  executor,
  concurrentGlobal: Number(
    process.env['WEB_CONCURRENT_GLOBAL'] ?? DEFAULT_WEB_POLICY.concurrentGlobal,
  ),
  // Must fit in the function timeout together with one run (see the CDK stack).
  queueWaitMs: Number(process.env['WEB_QUEUE_WAIT_MS'] ?? 120_000),
  pollMs: 2_000,
  now: () => new Date(),
  logError,
});

const ID = /^[0-9a-f-]{36}$/;
const USER = /^[\w:@.+-]{1,128}$/;

export async function handler(event: unknown): Promise<void> {
  const { userId, runId } = (event ?? {}) as { userId?: unknown; runId?: unknown };
  if (
    typeof userId !== 'string' ||
    !USER.test(userId) ||
    typeof runId !== 'string' ||
    !ID.test(runId)
  ) {
    logError(new Error('The web worker received an invalid event.'));
    return;
  }
  await worker.process(userId, runId);
}
