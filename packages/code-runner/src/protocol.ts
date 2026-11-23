/**
 * The contract between the API (trusted) and a runner container (untrusted).
 *
 * The container receives code and test INPUTS only. Expected values never
 * enter it, so nothing the code does inside can make a test pass without
 * computing the right result. Grading happens in the API with
 * `gradeOutcomes` from @pracstack/challenge-runtime.
 */
import type { RawOutcome, TestInput } from '@pracstack/challenge-runtime';

export type RunnerLanguage = 'typescript' | 'java' | 'csharp';

/** Every runner language, in display order. */
export const RUNNER_LANGUAGES: readonly RunnerLanguage[] = ['typescript', 'java', 'csharp'];

/**
 * Joins the learner's code and a challenge's support code (a read-only test
 * driver). Runners that support it compile the part after the marker as a
 * separate source file (docker/csharp/Harness.cs).
 */
export const SUPPORT_FILE_MARKER = '\n// <pracstack:support-file>\n';

/** Joins learner code and support code for a runner. */
export function withSupportCode(code: string, supportCode: string | undefined): string {
  return supportCode === undefined ? code : `${code}${SUPPORT_FILE_MARKER}${supportCode}`;
}

/** Sent to the container on stdin as one JSON document. */
export interface RunnerInput {
  /**
   * Random marker the harness prefixes to its result line, so output printed
   * by the learner's code is never mistaken for the result.
   */
  readonly nonce: string;
  readonly code: string;
  /** Function/method name (call tests) or class name (operations tests). */
  readonly entryPoint: string;
  readonly tests: readonly TestInput[];
  readonly maxLogLines: number;
}

export interface CompileDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** Written by the harness as one line: `<nonce><json>`. */
export type RunnerOutput =
  | {
      readonly kind: 'completed';
      readonly outcomes: readonly RawOutcome[];
      readonly logs: readonly string[];
    }
  | { readonly kind: 'compile-error'; readonly diagnostics: readonly CompileDiagnostic[] }
  | { readonly kind: 'load-error'; readonly message: string; readonly logs: readonly string[] };

/** Everything a run can end with, including failures detected outside the container. */
export type CodeRunResult =
  | RunnerOutput
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  /** Out of memory, too much output, or killed for another resource reason. */
  | { readonly kind: 'resource-limit'; readonly message: string }
  /** The runner itself is not available (Docker not running, image missing, busy). */
  | { readonly kind: 'unavailable'; readonly message: string };

export interface CodeRunRequest {
  readonly language: RunnerLanguage;
  readonly code: string;
  readonly entryPoint: string;
  readonly tests: readonly TestInput[];
}

export interface CodeRunner {
  run(request: CodeRunRequest): Promise<CodeRunResult>;
}

/** Container image per language. Bump the tag when a harness changes. */
export const RUNNER_IMAGES: Readonly<Record<RunnerLanguage, string>> = {
  typescript: 'pracstack-runner-typescript:1',
  java: 'pracstack-runner-java:1',
  csharp: 'pracstack-runner-csharp:1',
};
