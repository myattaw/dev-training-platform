import { Injectable } from '@angular/core';
import type { ChallengeTest } from '@pracstack/content-model';
import type { RunOutcome, SandboxRequest, SandboxResponse } from './runner.models';

const TIMEOUT_MS = 5000;

/**
 * Runs compiled learner code against a challenge's *visible* tests in a
 * throwaway Web Worker, inside the learner's own browser.
 *
 * This is a convenience for fast feedback, not a security boundary and not a
 * source of truth: results never count toward progress on the server. Hidden
 * tests and official submissions will run in an isolated server-side runner.
 */
@Injectable({ providedIn: 'root' })
export class LocalRunnerService {
  run(code: string, entryPoint: string, tests: readonly ChallengeTest[]): Promise<RunOutcome> {
    const started = performance.now();
    // A fresh worker per run: no state leaks between runs, and it is easy to kill.
    const worker = new Worker(new URL('./sandbox.worker', import.meta.url), { type: 'module' });

    return new Promise<RunOutcome>((resolve) => {
      const finish = (outcome: RunOutcome): void => {
        clearTimeout(timer);
        worker.terminate();
        resolve(outcome);
      };

      const timer = setTimeout(
        () => finish({ status: 'timeout', timeoutMs: TIMEOUT_MS }),
        TIMEOUT_MS,
      );

      worker.onmessage = ({ data }: MessageEvent<SandboxResponse>) => {
        if (data.kind === 'load-error') {
          finish({ status: 'load-error', message: data.message, logs: data.logs });
          return;
        }
        finish({
          status: data.results.every((r) => r.passed) ? 'passed' : 'failed',
          results: data.results,
          logs: data.logs,
          durationMs: Math.round(performance.now() - started),
        });
      };

      worker.onerror = (event) => {
        event.preventDefault();
        finish({
          status: 'load-error',
          message: event.message || 'The test sandbox crashed.',
          logs: [],
        });
      };

      const request: SandboxRequest = { code, entryPoint, tests };
      worker.postMessage(request);
    });
  }
}
