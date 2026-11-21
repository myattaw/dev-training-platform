import type { RunResponse, TestResult } from '@pracstack/challenge-runtime';
import type { ChallengeTest } from '@pracstack/content-model';
import type { CompileDiagnostic } from '../../../shared/editor/compile.models';

export type { TestResult };

/** Message sent from the page to the sandbox worker. */
export interface SandboxRequest {
  /** Learner code, already transpiled to CommonJS JavaScript. */
  readonly code: string;
  readonly entryPoint: string;
  readonly tests: readonly ChallengeTest[];
}

/** Message sent back from the sandbox worker. */
export type SandboxResponse = RunResponse;

/** Everything the results panel can show: a discriminated union on `status`. */
export type RunOutcome =
  | {
      readonly status: 'passed' | 'failed';
      readonly results: readonly TestResult[];
      readonly logs: readonly string[];
      readonly durationMs: number;
    }
  | { readonly status: 'compile-error'; readonly diagnostics: readonly CompileDiagnostic[] }
  | { readonly status: 'load-error'; readonly message: string; readonly logs: readonly string[] }
  | { readonly status: 'timeout'; readonly timeoutMs: number }
  | { readonly status: 'resource-limit'; readonly message: string };
