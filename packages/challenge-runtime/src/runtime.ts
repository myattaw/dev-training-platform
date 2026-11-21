/**
 * Runs challenge tests against a solution. Pure: no DOM, Angular or Node APIs,
 * so the same code runs in the browser's Web Worker, in the content build's
 * reference-solution check, and (later) inside the server-side runner.
 *
 * This module is NOT a security boundary. Isolation must come from wherever
 * it runs (a Worker in the learner's own browser, a sandboxed process on the
 * server).
 */
import type { CallTest, ChallengeTest, OperationsTest } from '@pracstack/content-model';

export interface TestResult {
  readonly description: string;
  readonly passed: boolean;
  /** Human-readable input: call arguments, or the sequence of operations. */
  readonly input: string;
  /** Expected value (for operations tests: of the step that failed). */
  readonly expected: string;
  /** Formatted actual value, when the code returned. */
  readonly actual?: string;
  /** Error message, when the code threw. */
  readonly error?: string;
}

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

const MAX_LOG_LINES = 200;
const MAX_LOG_LINE_LENGTH = 2000;

type Callable = (...args: unknown[]) => unknown;
type Constructable = new (...args: unknown[]) => Record<string, unknown>;

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
  const entry = moduleExports[entryPoint];
  const wantsClass = tests.some((t) => t.kind === 'operations');
  if (typeof entry !== 'function') {
    return {
      kind: 'load-error',
      message: `Expected your code to export a ${wantsClass ? 'class' : 'function'} named "${entryPoint}". Did you remove the "export" keyword or rename it?`,
    };
  }
  return {
    kind: 'completed',
    results: tests.map((test) =>
      test.kind === 'call'
        ? runCallTest(entry as Callable, test)
        : runOperationsTest(entry as Constructable, entryPoint, test),
    ),
  };
}

function runCallTest(fn: Callable, test: CallTest): TestResult {
  const base = {
    description: test.description,
    input: formatArgs(test.input),
    expected: formatValue(test.expected),
  };
  try {
    // Clone inputs so a solution that mutates its arguments can't corrupt later tests.
    const actual = fn(...structuredClone(test.input));
    return { ...base, passed: deepEqual(actual, test.expected), actual: formatValue(actual) };
  } catch (err) {
    return { ...base, passed: false, error: errorMessage(err) };
  }
}

function runOperationsTest(
  Cls: Constructable,
  entryPoint: string,
  test: OperationsTest,
): TestResult {
  const lines = [`new ${entryPoint}(${formatArgs(test.constructorArgs)})`];
  const fail = (expected: string, extra: { actual?: string; error?: string }): TestResult => ({
    description: test.description,
    passed: false,
    input: lines.join('\n'),
    expected,
    ...extra,
  });

  let instance: Record<string, unknown>;
  try {
    instance = new Cls(...structuredClone(test.constructorArgs));
  } catch (err) {
    return fail('a new instance', { error: errorMessage(err) });
  }

  let checked = 0;
  for (const step of test.steps) {
    const call = `${step.call}(${formatArgs(step.args)})`;
    const method = instance[step.call];
    if (typeof method !== 'function') {
      lines.push(call);
      return fail(formatStepExpectation(step), {
        error: `${entryPoint} has no method named "${step.call}"`,
      });
    }
    let actual: unknown;
    try {
      actual = (method as Callable).apply(instance, [...structuredClone(step.args)]);
    } catch (err) {
      lines.push(call);
      return fail(formatStepExpectation(step), { error: errorMessage(err) });
    }
    if ('expected' in step) {
      checked++;
      lines.push(`${call} → ${formatValue(actual)}`);
      if (!deepEqual(actual, step.expected)) {
        return fail(formatValue(step.expected), { actual: formatValue(actual) });
      }
    } else {
      lines.push(call);
    }
  }

  const summary = `${checked} return ${checked === 1 ? 'value' : 'values'} as specified`;
  return {
    description: test.description,
    passed: true,
    input: lines.join('\n'),
    expected: summary,
    actual: summary,
  };
}

function formatStepExpectation(step: OperationsTest['steps'][number]): string {
  return 'expected' in step ? formatValue(step.expected) : 'no error';
}

/** Display form of a test before it runs, e.g. for the "Visible tests" list. */
export function describeTest(
  test: ChallengeTest,
  entryPoint: string,
): { readonly input: string; readonly expected?: string } {
  if (test.kind === 'call') {
    return { input: formatArgs(test.input), expected: formatValue(test.expected) };
  }
  const lines = [`new ${entryPoint}(${formatArgs(test.constructorArgs)})`];
  for (const step of test.steps) {
    const call = `${step.call}(${formatArgs(step.args)})`;
    lines.push('expected' in step ? `${call} → ${formatValue(step.expected)}` : call);
  }
  return { input: lines.join('\n') };
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

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

export function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatArgs(args: readonly unknown[]): string {
  return args.map(formatValue).join(', ');
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
