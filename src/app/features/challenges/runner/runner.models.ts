import type { CompileDiagnostic } from '../../../shared/editor/compile.models';
import type { TestCase } from '../models/challenge';

/** Message sent from the page to the sandbox worker. */
export interface SandboxRequest {
  /** Learner code, already transpiled to CommonJS JavaScript. */
  readonly code: string;
  readonly entryPoint: string;
  readonly tests: readonly TestCase[];
}

export interface TestResult {
  readonly description: string;
  readonly passed: boolean;
  readonly input: string;
  readonly expected: string;
  /** Formatted return value, when the function returned. */
  readonly actual?: string;
  /** Error message, when the function threw. */
  readonly error?: string;
}

/** Message sent back from the sandbox worker. */
export type SandboxResponse =
  | {
      readonly kind: 'completed';
      readonly results: readonly TestResult[];
      readonly logs: readonly string[];
    }
  | { readonly kind: 'load-error'; readonly message: string; readonly logs: readonly string[] };

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
  | { readonly status: 'timeout'; readonly timeoutMs: number };
