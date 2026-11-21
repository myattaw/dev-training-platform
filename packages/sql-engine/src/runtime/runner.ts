/**
 * SQL runner process. Started by `ChildProcessSqlEngine` with `fork()`, so a
 * runaway query can never take the API process down with it.
 *
 * The main thread is a supervisor: it runs one job at a time in a worker
 * thread, and terminates the worker when the job exceeds its time limit or
 * the process exceeds its memory limit. WebAssembly execution is interrupted
 * by worker termination (verified), unlike PostgreSQL's statement_timeout,
 * which does not fire inside PGlite.
 */
import { Worker } from 'node:worker_threads';
import { precheckQuery } from '../statement';
import {
  DEFAULT_SQL_LIMITS,
  type SqlLimits,
  type SqlRunRequest,
  type SqlRunResult,
} from '../types';

export interface RunnerRequest {
  readonly id: number;
  readonly request: SqlRunRequest;
}

export interface RunnerResponse {
  readonly id: number;
  readonly result: SqlRunResult;
}

const MEMORY_POLL_MS = 25;

const limits: SqlLimits = {
  ...DEFAULT_SQL_LIMITS,
  ...(process.env['PRACSTACK_SQL_LIMITS']
    ? (JSON.parse(process.env['PRACSTACK_SQL_LIMITS']) as Partial<SqlLimits>)
    : {}),
};

let worker: Worker | undefined;
let workerReady: Promise<Worker> | undefined;

function getWorker(): Promise<Worker> {
  workerReady ??= new Promise<Worker>((resolve, reject) => {
    // Bundled deployments name a plain-JavaScript worker; source runs use the tsx boot file.
    const bundled = process.env['PRACSTACK_SQL_WORKER'];
    const w = new Worker(bundled ?? new URL('./sql-worker.boot.mjs', import.meta.url));
    w.once('message', (m) =>
      m === 'ready' ? resolve(w) : reject(new Error('Unexpected worker message')),
    );
    w.once('error', reject);
    worker = w;
  }).catch((err: unknown) => {
    discardWorker();
    throw err;
  });
  return workerReady;
}

function discardWorker(): void {
  void worker?.terminate();
  worker = undefined;
  workerReady = undefined;
}

async function execute(request: SqlRunRequest): Promise<SqlRunResult> {
  const problem = precheckQuery(request.query, limits.maxQueryLength);
  if (problem) return { kind: 'rejected', message: problem };

  let w: Worker;
  try {
    w = await getWorker();
  } catch {
    return { kind: 'error', message: 'The SQL engine could not start.' };
  }

  return new Promise<SqlRunResult>((resolve) => {
    const finish = (result: SqlRunResult, kill: boolean): void => {
      clearTimeout(timer);
      clearInterval(memory);
      w.off('message', onMessage);
      w.off('error', onError);
      w.off('exit', onExit);
      // A killed worker may be mid-query: never reuse it.
      if (kill) discardWorker();
      resolve(result);
    };
    const onMessage = (result: SqlRunResult): void => finish(result, false);
    const onError = (): void => finish({ kind: 'error', message: 'The SQL engine failed.' }, true);
    const onExit = (): void =>
      finish({ kind: 'error', message: 'The SQL engine stopped unexpectedly.' }, true);

    const timer = setTimeout(
      () => finish({ kind: 'timeout', timeoutMs: limits.timeoutMs }, true),
      limits.timeoutMs,
    );
    const memory = setInterval(() => {
      if (process.memoryUsage().rss > limits.maxRssMb * 1024 * 1024) {
        finish(
          { kind: 'resource-limit', message: 'The query used too much memory and was stopped.' },
          true,
        );
      }
    }, MEMORY_POLL_MS);

    w.on('message', onMessage);
    w.on('error', onError);
    w.on('exit', onExit);
    w.postMessage({ database: request.database, query: request.query, maxRows: request.maxRows });
  });
}

// Jobs arrive over IPC and are processed strictly one at a time.
let queue = Promise.resolve();
process.on('message', (message: RunnerRequest) => {
  queue = queue.then(async () => {
    const result = await execute(message.request);
    process.send?.({ id: message.id, result } satisfies RunnerResponse);
  });
});
process.on('disconnect', () => process.exit(0));
// Warm up so the first query does not pay the startup cost.
void getWorker().catch(() => undefined);
