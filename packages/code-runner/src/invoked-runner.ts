import type { CodeRunner, CodeRunRequest, CodeRunResult, RunnerLanguage } from './protocol';
import { parseCodeRunResult } from './validate';

/** Result of invoking a remote function (e.g. AWS Lambda `Invoke`). */
export type InvokeOutcome =
  /** The function returned; `payload` is its parsed JSON response (untrusted). */
  | { readonly kind: 'returned'; readonly payload: unknown }
  /** The function itself failed (crashed, ran out of memory, timed out). */
  | { readonly kind: 'function-error'; readonly error: string }
  /** The service refused the call (throttled, not found, no permission, network). */
  | { readonly kind: 'refused'; readonly message: string };

export type Invoke = (functionName: string, payload: unknown) => Promise<InvokeOutcome>;

/**
 * Runs submissions by invoking one isolated runner function per language
 * (on AWS: container-image Lambda functions in a VPC without network access;
 * see services/runners). Transport-neutral: `invoke` is injected.
 */
export class InvokedCodeRunner implements CodeRunner {
  constructor(
    private readonly invoke: Invoke,
    /** Function per language. A language without one (not deployed) is reported unavailable. */
    private readonly functions: Readonly<Partial<Record<RunnerLanguage, string>>>,
  ) {}

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    const functionName = this.functions[request.language];
    if (!functionName) {
      return {
        kind: 'unavailable',
        message: 'This language is not available on this server yet.',
      };
    }
    const outcome = await this.invoke(functionName, request);
    switch (outcome.kind) {
      case 'refused':
        return { kind: 'unavailable', message: 'The code runner is busy. Try again in a moment.' };
      case 'function-error':
        // The runner died mid-run (e.g. the code killed it, or it ran out of memory).
        return /timed out/i.test(outcome.error)
          ? { kind: 'timeout', timeoutMs: 0 }
          : /memory/i.test(outcome.error)
            ? {
                kind: 'resource-limit',
                message: 'Your program used too much memory and was stopped.',
              }
            : {
                kind: 'load-error',
                message: 'Your program stopped the runner before reporting any results.',
                logs: [],
              };
      case 'returned':
        return (
          parseCodeRunResult(outcome.payload, request.tests.length) ?? {
            kind: 'load-error',
            message: 'The runner produced an unreadable result.',
            logs: [],
          }
        );
    }
  }
}
