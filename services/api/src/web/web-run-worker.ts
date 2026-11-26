import type { WebChallengeProgress } from '@pracstack/api-contracts';
import type { WebTest } from '@pracstack/content-model';
import {
  type BatchRun,
  gradeBatch,
  toProbeRequests,
  type WebExecutor,
} from '@pracstack/web-runner';
import type { WebRunRecord, WebStore, WebSubmissionRecord } from '../store/web-store';
import { RUN_LEASE_MS, userRunLease } from './web-challenge-service';
import {
  prepareProject,
  publicProgress,
  recordTimedSubmission,
  toRunResult,
  type WebChallengeContent,
} from './web-shared';

export const GLOBAL_RUN_LEASE = 'web-runs';

export interface WebRunWorkerDeps {
  readonly findChallenge: (id: string) => WebChallengeContent | undefined;
  readonly store: WebStore;
  readonly executor: WebExecutor;
  /** Runs building or running at once across all users. */
  readonly concurrentGlobal: number;
  /** How long a run may wait for a free slot before it ends as "busy". */
  readonly queueWaitMs: number;
  readonly pollMs?: number;
  readonly now: () => Date;
  readonly logError?: (err: unknown) => void;
}

/**
 * Runs one stored, queued test run to completion (trusted side). The API
 * creates the run and dispatches it here: locally in-process, on AWS through
 * an asynchronous invocation of the web worker function.
 *
 * 1. Claims the run (queued → building), so a repeated dispatch does nothing.
 * 2. Waits for one of the global slots (at most `concurrentGlobal` at once).
 * 3. Rebuilds the project from trusted content and the stored editable files,
 *    has the executor run the tests' requests, and grades the responses here:
 *    expected values never leave this side.
 * 4. Records graded submissions (progress, timed sessions) and completes the run.
 * 5. Always frees the global slot and the user's run slot.
 */
export class WebRunWorker {
  constructor(private readonly deps: WebRunWorkerDeps) {}

  async process(userId: string, runId: string): Promise<void> {
    const queued = await this.deps.store.getWebRun(userId, runId);
    if (!queued || queued.status !== 'queued') return;
    let run: WebRunRecord = queued;
    // Phase updates are best-effort; only the claim and completion must win.
    const advance = async (status: WebRunRecord['status']) => {
      const next = { ...run, status };
      if (await this.deps.store.updateWebRun(next, run.status)) run = next;
    };
    let holdsGlobal = false;
    // Only the worker that claims (or ends) the run frees the user's slot: a
    // repeated dispatch of the same run must not free it while the first runs.
    let owned = false;
    try {
      holdsGlobal = await this.waitForSlot(runId);
      if (!holdsGlobal) {
        owned = await this.complete(run, 'queued', {
          kind: 'unavailable',
          message: 'The application runners are busy.',
        });
        return;
      }
      const claimed: WebRunRecord = { ...run, status: 'building' };
      if (!(await this.deps.store.updateWebRun(claimed, 'queued'))) return;
      owned = true;
      run = claimed;
      const content = this.deps.findChallenge(run.challengeId);
      if (!content) {
        await this.complete(run, run.status, {
          kind: 'unavailable',
          message: 'This challenge is no longer available.',
        });
        return;
      }
      const visible = content.challenge.visibleTests;
      const hidden = run.mode === 'submit' ? content.grading.hiddenTests : [];
      const tests: readonly WebTest[] = [...visible, ...hidden];
      const { project } = prepareProject(content, run.framework, run.files);
      let outcome: BatchRun;
      try {
        outcome = await this.deps.executor.runBatch(
          project,
          tests.map(toProbeRequests),
          (phase) => void advance(phase === 'testing' ? 'testing' : phase).catch(() => undefined),
        );
      } catch (err) {
        this.deps.logError?.(err);
        outcome = { kind: 'unavailable', message: 'The application runner failed.' };
      }
      await this.complete(run, undefined, outcome, content, tests, visible.length, hidden);
    } catch (err) {
      this.deps.logError?.(err);
      // Never end a run another worker owns: unless claimed here, only a still-queued one.
      const ended = await this.complete(run, owned ? undefined : 'queued', {
        kind: 'unavailable',
        message: 'The run failed on the server.',
      }).catch((e: unknown) => {
        this.deps.logError?.(e);
        return false;
      });
      owned ||= ended;
    } finally {
      if (holdsGlobal) await this.release(GLOBAL_RUN_LEASE, runId);
      if (owned) await this.release(userRunLease(userId), runId);
    }
  }

  /** Polls for a global slot until `queueWaitMs` has passed. */
  private async waitForSlot(runId: string): Promise<boolean> {
    const deadline = Date.now() + this.deps.queueWaitMs;
    for (;;) {
      const nowMs = this.deps.now().getTime();
      const taken = await this.deps.store.acquireWebLease(
        GLOBAL_RUN_LEASE,
        runId,
        this.deps.concurrentGlobal,
        nowMs,
        nowMs + RUN_LEASE_MS,
      );
      if (taken) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, this.deps.pollMs ?? 1_000));
    }
  }

  /**
   * Grades the outcome, records a graded submission, and completes the run.
   * `expected`: the status the stored run must still have (default: whatever
   * this worker last wrote, re-read so best-effort phase updates don't block it).
   */
  private async complete(
    run: WebRunRecord,
    expected: WebRunRecord['status'] | undefined,
    outcome: BatchRun,
    content?: WebChallengeContent,
    tests: readonly WebTest[] = [],
    visibleCount = 0,
    hidden: readonly WebTest[] = [],
  ): Promise<boolean> {
    const result = toRunResult(gradeBatch(outcome, tests), visibleCount, hidden, run.mode);
    let progress: WebChallengeProgress | undefined;
    if (content && run.mode === 'submit' && result.verdict !== 'infrastructure-error') {
      const record: WebSubmissionRecord = {
        id: run.id,
        userId: run.userId,
        challengeId: content.challenge.id,
        challengeVersion: content.challenge.version,
        framework: run.framework,
        verdict: result.verdict,
        visiblePassed: result.visible.filter((t) => t.passed).length,
        visibleTotal: visibleCount,
        hiddenPassed: result.hidden.filter((h) => h.passed).length,
        hiddenTotal: hidden.length,
        // The time the server accepted the submission: what timed sessions judge.
        submittedAt: run.acceptedAt,
        files: run.files,
        ...(run.timedSessionId ? { timedSessionId: run.timedSessionId } : {}),
      };
      try {
        progress = publicProgress(await this.deps.store.recordWebSubmission(record));
        if (run.timedSessionId) {
          await recordTimedSubmission(this.deps.store, run.userId, run.timedSessionId, record);
        }
      } catch (err) {
        this.deps.logError?.(err);
      }
    }
    const done: WebRunRecord = {
      ...run,
      status: 'completed',
      result,
      ...(progress ? { progress } : {}),
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = expected ?? (await this.deps.store.getWebRun(run.userId, run.id))?.status;
      if (!current || current === 'completed') return false;
      if (await this.deps.store.updateWebRun(done, current)) return true;
      // Only the first attempt may insist on `expected` (e.g. "still queued").
      if (expected === 'queued') return false;
      expected = undefined;
    }
    return false;
  }

  private async release(name: string, holder: string): Promise<void> {
    try {
      await this.deps.store.releaseWebLease(name, holder);
    } catch (err) {
      this.deps.logError?.(err);
    }
  }
}
