/**
 * In-process test running: execute + grade in one place. Used by the
 * browser's Web Worker (visible tests in the learner's own browser) and by
 * the content build (reference solutions). Pure: no DOM, Angular or Node APIs.
 *
 * This module is NOT a security boundary. Isolation must come from where it
 * runs. Server-side grading splits execute (in a container) from grade (in
 * the API); see execute.ts.
 */
import type { ChallengeTest } from '@pracstack/content-model';
import { errorMessage, executeTests, toTestInput } from './execute';
import { gradeOutcomes, type TestResult } from './grade';
import { formatValue } from './values';

export type RunResponse =
  | {
      readonly kind: 'completed';
      readonly results: readonly TestResult[];
      readonly logs: readonly string[];
    }
  | { readonly kind: 'load-error'; readonly message: string; readonly logs: readonly string[] };

export interface SandboxConsole {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export const MAX_LOG_LINES = 200;
const MAX_LOG_LINE_LENGTH = 2000;

/** Loads CommonJS code (as emitted by the TypeScript compiler) and runs the tests. */
export function runInSandbox(
  code: string,
  entryPoint: string,
  tests: readonly ChallengeTest[],
): RunResponse {
  const logs: string[] = [];
  let moduleExports: Record<string, unknown>;
  try {
    moduleExports = loadCommonJsModule(code, createConsole(logs));
  } catch (err) {
    return {
      kind: 'load-error',
      message: `Error while loading your code: ${errorMessage(err)}`,
      logs,
    };
  }
  const outcome = runTests(moduleExports, entryPoint, tests);
  return outcome.kind === 'load-error'
    ? { kind: 'load-error', message: outcome.message, logs }
    : { kind: 'completed', results: outcome.results, logs };
}

/** Runs tests against an already-loaded module (e.g. a reference solution). */
export function runTests(
  moduleExports: Readonly<Record<string, unknown>>,
  entryPoint: string,
  tests: readonly ChallengeTest[],
):
  | { readonly kind: 'completed'; readonly results: TestResult[] }
  | { readonly kind: 'load-error'; readonly message: string } {
  const executed = executeTests(moduleExports, entryPoint, tests.map(toTestInput));
  return executed.kind === 'load-error'
    ? executed
    : { kind: 'completed', results: gradeOutcomes(tests, executed.outcomes, entryPoint) };
}

/** Evaluates CommonJS output from the TypeScript compiler and returns its exports. */
export function loadCommonJsModule(
  code: string,
  sandboxConsole: SandboxConsole,
): Record<string, unknown> {
  const module = { exports: {} as Record<string, unknown> };
  // `new Function` gives the code its own scope; we hand it only what it needs.
  // This is scoping, not isolation: see the note at the top of this file.
  const factory = new Function('module', 'exports', 'console', `"use strict";\n${code}`);
  factory(module, module.exports, sandboxConsole);
  return module.exports;
}

export function createConsole(logs: string[]): SandboxConsole {
  const write =
    (prefix: string) =>
    (...args: unknown[]): void => {
      if (logs.length >= MAX_LOG_LINES) return;
      const line = args.map((a) => (typeof a === 'string' ? a : formatValue(a))).join(' ');
      logs.push(prefix + line.slice(0, MAX_LOG_LINE_LENGTH));
    };
  return {
    log: write(''),
    info: write(''),
    debug: write(''),
    warn: write('⚠ '),
    error: write('✖ '),
  };
}
