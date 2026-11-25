import type { CodeRunner, CodeRunRequest, CodeRunResult } from '@pracstack/code-runner';
import {
  runEach,
  type SqlBatchRequest,
  type SqlEngine,
  type SqlRunRequest,
  type SqlRunResult,
} from '@pracstack/sql-engine';
import type { RateLimiter } from '../rate-limit';

/**
 * Caps runner use across ALL users (per-user limits are enforced by the API).
 * Runner functions are billed by memory and run time, so this bounds the
 * worst-case cost, and keeps runners from using up the account's Lambda
 * concurrency that the API itself needs.
 */
const GLOBAL_KEY = 'all-users';

export class GloballyLimitedCodeRunner implements CodeRunner {
  constructor(
    private readonly inner: CodeRunner,
    private readonly limiter: RateLimiter,
    private readonly now: () => number = Date.now,
  ) {}

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    if ((await this.limiter.hit(GLOBAL_KEY, this.now())) > 0)
      return { kind: 'unavailable', message: 'The code runner is busy. Try again in a minute.' };
    return this.inner.run(request);
  }
}

export class GloballyLimitedSqlEngine implements SqlEngine {
  constructor(
    private readonly inner: SqlEngine,
    private readonly limiter: RateLimiter,
    private readonly now: () => number = Date.now,
  ) {}

  async run(request: SqlRunRequest): Promise<SqlRunResult> {
    if ((await this.limiter.hit(GLOBAL_KEY, this.now())) > 0)
      return { kind: 'rejected', message: 'The SQL service is busy. Try again in a minute.' };
    return this.inner.run(request);
  }

  /** One grading batch counts once: it is one runner invocation. */
  async runEach(request: SqlBatchRequest): Promise<SqlRunResult[]> {
    if ((await this.limiter.hit(GLOBAL_KEY, this.now())) > 0)
      return [{ kind: 'rejected', message: 'The SQL service is busy. Try again in a minute.' }];
    return runEach(this.inner, request);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
