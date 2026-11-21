import { type ChildProcess, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { RunnerRequest, RunnerResponse } from './runtime/runner';
import {
  DEFAULT_SQL_LIMITS,
  type SqlEngine,
  type SqlLimits,
  type SqlRunRequest,
  type SqlRunResult,
} from './types';

export interface ChildProcessEngineOptions {
  readonly limits?: Partial<SqlLimits>;
  /** Queued jobs beyond this are refused as busy (protects the runner from floods). */
  readonly maxQueue?: number;
}

interface Pending {
  readonly resolve: (result: SqlRunResult) => void;
  readonly timer: NodeJS.Timeout;
}

/** Extra time beyond the runner's own limit before the whole runner is presumed stuck. */
const SAFETY_MARGIN_MS = 10_000;

/**
 * Runs SQL in a separate Node process (`runtime/runner.ts`), which runs
 * PGlite in a worker thread with time and memory limits. If the runner dies
 * or hangs, it is killed and restarted on the next request; the calling
 * process is never affected.
 */
export class ChildProcessSqlEngine implements SqlEngine {
  private child: ChildProcess | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly limits: SqlLimits;
  private readonly maxQueue: number;

  constructor(options: ChildProcessEngineOptions = {}) {
    this.limits = { ...DEFAULT_SQL_LIMITS, ...options.limits };
    this.maxQueue = options.maxQueue ?? 20;
  }

  run(request: SqlRunRequest): Promise<SqlRunResult> {
    if (this.pending.size >= this.maxQueue) {
      return Promise.resolve({
        kind: 'rejected',
        message: 'The SQL service is busy. Try again in a moment.',
      });
    }
    const child = this.ensureChild();
    const id = this.nextId++;
    return new Promise<SqlRunResult>((resolve) => {
      // Queued jobs wait for earlier ones, so allow for the whole queue ahead.
      const budget = (this.pending.size + 1) * this.limits.timeoutMs + SAFETY_MARGIN_MS;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ kind: 'timeout', timeoutMs: this.limits.timeoutMs });
        this.restart();
      }, budget);
      this.pending.set(id, { resolve, timer });
      child.send({ id, request } satisfies RunnerRequest);
    });
  }

  close(): Promise<void> {
    this.failAll('The SQL service was stopped.');
    this.child?.kill();
    this.child = undefined;
    return Promise.resolve();
  }

  private ensureChild(): ChildProcess {
    if (this.child && this.child.connected) return this.child;
    const runner = fileURLToPath(new URL('./runtime/runner.ts', import.meta.url));
    const child = fork(runner, [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, PRACSTACK_SQL_LIMITS: JSON.stringify(this.limits) },
      serialization: 'advanced',
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.on('message', (message: RunnerResponse) => {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(message.id);
      entry.resolve(message.result);
    });
    child.on('exit', () => {
      if (this.child === child) {
        this.child = undefined;
        this.failAll('The SQL engine stopped unexpectedly. Try again.');
      }
    });
    // Never keep the parent process alive just for the runner.
    child.unref();
    child.channel?.unref();
    this.child = child;
    return child;
  }

  private restart(): void {
    const child = this.child;
    this.child = undefined;
    this.failAll('The SQL engine was restarted. Try again.');
    child?.kill();
  }

  private failAll(message: string): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve({ kind: 'error', message });
      this.pending.delete(id);
    }
  }
}
