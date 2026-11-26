import { randomUUID } from 'node:crypto';
import { batchBodyToRun, newBatchKey, verifyBatch, type WebBatchEvent } from './batch';
import type { WebExecutor } from './executor';
import type { ProbeRequest, WebProject, WebRunnerFramework } from './protocol';
import { tarProject } from './files';
import type { BatchPhase, BatchRun } from './run-tests';

/**
 * Result of invoking a function synchronously (e.g. AWS Lambda `Invoke`);
 * the same shape as @pracstack/code-runner's `InvokeOutcome`.
 */
export type WebInvokeOutcome =
  /** The function returned; `payload` is its parsed JSON response (untrusted). */
  | { readonly kind: 'returned'; readonly payload: unknown }
  /** The function itself failed (crashed, ran out of memory, timed out). */
  | { readonly kind: 'function-error'; readonly error: string }
  /** The service refused the call (throttled, not found, no permission, network). */
  | { readonly kind: 'refused'; readonly message: string };

export type WebInvoke = (functionName: string, payload: unknown) => Promise<WebInvokeOutcome>;

/**
 * Runs batches on the web runner functions (services/runners, web-handler.ts):
 * one synchronous invocation per batch, with a new key per run. Only a
 * response signed with that key and naming the run is believed; anything else
 * (for example a response learner code posted to Lambda's runtime API) is an
 * infrastructure error. See docs/lambda-web-runner.md.
 */
export class LambdaWebExecutor implements WebExecutor {
  constructor(
    private readonly invoke: WebInvoke,
    /** Function per framework. A framework without one is reported unavailable. */
    private readonly functions: Readonly<Partial<Record<WebRunnerFramework, string>>>,
    private readonly options: {
      readonly newRunId?: () => string;
      /** Called when a response fails verification (an alarm-worthy event). */
      readonly onRejected?: (framework: WebRunnerFramework) => void;
    } = {},
  ) {}

  async runBatch(
    project: WebProject,
    sequences: readonly (readonly ProbeRequest[])[],
    onPhase?: (phase: BatchPhase) => void,
  ): Promise<BatchRun> {
    const functionName = this.functions[project.framework];
    if (!functionName) {
      return { kind: 'unavailable', message: 'This framework is not available on this server.' };
    }
    const runId = (this.options.newRunId ?? randomUUID)();
    const key = newBatchKey();
    const event: WebBatchEvent = {
      runId,
      key,
      framework: project.framework,
      tar: tarProject(project.files).toString('base64'),
      ...(project.spring ? { spring: project.spring } : {}),
      sequences,
    };
    onPhase?.('building');
    const outcome = await this.invoke(functionName, event);
    switch (outcome.kind) {
      case 'refused':
        return {
          kind: 'unavailable',
          message: 'The application runner is busy. Try again in a moment.',
        };
      case 'function-error':
        // The function died mid-run: out of memory, past its timeout, or the
        // application killed the supervisor (it runs as the same OS user).
        if (/timed out/i.test(outcome.error)) {
          return {
            kind: 'time-limit',
            message: 'The run took longer than its time limit.',
            logs: [],
          };
        }
        if (/memory|signal: killed/i.test(outcome.error)) {
          return {
            kind: 'resource-limit',
            message: 'The application used too much memory and was stopped.',
            logs: [],
          };
        }
        return {
          kind: 'startup-failed',
          message: 'The application stopped the runner before it reported any results.',
          logs: [],
        };
      case 'returned': {
        const body = verifyBatch(key, runId, outcome.payload);
        if (!body) {
          this.options.onRejected?.(project.framework);
          return {
            kind: 'unavailable',
            message: 'The application runner returned a result that could not be verified.',
          };
        }
        return batchBodyToRun(project.framework, body);
      }
    }
  }
}
