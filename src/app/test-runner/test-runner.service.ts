import { Injectable } from '@angular/core';
import type { TestCase } from '../models/exercise';
import type { RunOutcome, SandboxRequest, SandboxResponse } from './test-runner.models';

const TIMEOUT_MS = 5000;

/** Runs compiled learner code against an exercise's tests in a throwaway Web Worker. */
@Injectable({ providedIn: 'root' })
export class TestRunnerService {
  run(code: string, entryPoint: string, tests: readonly TestCase[]): Promise<RunOutcome> {
    const started = performance.now();
    // A fresh worker per run: no state leaks between runs, and it is easy to kill.
    const worker = new Worker(new URL('./sandbox.worker', import.meta.url), { type: 'module' });

    return new Promise<RunOutcome>((resolve) => {
      const finish = (outcome: RunOutcome): void => {
        clearTimeout(timer);
        worker.terminate();
        resolve(outcome);
      };

      const timer = setTimeout(() => finish({ status: 'timeout', timeoutMs: TIMEOUT_MS }), TIMEOUT_MS);

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
        finish({ status: 'load-error', message: event.message || 'The test sandbox crashed.', logs: [] });
      };

      const request: SandboxRequest = { code, entryPoint, tests };
      worker.postMessage(request);
    });
  }
}
