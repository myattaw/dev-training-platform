/**
 * Pure functions that load learner code and evaluate tests.
 * No DOM or Angular dependencies, so they run inside a Web Worker and in unit tests.
 */
import type { TestCase } from '../models/challenge';
import type { SandboxResponse, TestResult } from './runner.models';

export interface SandboxConsole {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

const MAX_LOG_LINES = 200;

export function runInSandbox(
  code: string,
  entryPoint: string,
  tests: readonly TestCase[],
): SandboxResponse {
  const logs: string[] = [];
  const sandboxConsole = createConsole(logs);

  let moduleExports: Record<string, unknown>;
  try {
    moduleExports = loadCommonJsModule(code, sandboxConsole);
  } catch (err) {
    return {
      kind: 'load-error',
      message: `Error while loading your code: ${errorMessage(err)}`,
      logs,
    };
  }

  const fn = moduleExports[entryPoint];
  if (typeof fn !== 'function') {
    return {
      kind: 'load-error',
      message: `Expected your code to export a function named "${entryPoint}". Did you remove the "export" keyword or rename it?`,
      logs,
    };
  }

  const results = tests.map((test) => runTest(fn as (...args: unknown[]) => unknown, test));
  return { kind: 'completed', results, logs };
}

/** Evaluates CommonJS output from the TypeScript compiler and returns its exports. */
export function loadCommonJsModule(
  code: string,
  sandboxConsole: SandboxConsole,
): Record<string, unknown> {
  const module = { exports: {} as Record<string, unknown> };
  // `new Function` gives the code its own scope; we hand it only what it needs.
  const factory = new Function('module', 'exports', 'console', `"use strict";\n${code}`);
  factory(module, module.exports, sandboxConsole);
  return module.exports;
}

function runTest(fn: (...args: unknown[]) => unknown, test: TestCase): TestResult {
  const base = {
    description: test.description,
    input: test.input.map(formatValue).join(', '),
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

function createConsole(logs: string[]): SandboxConsole {
  const write =
    (prefix: string) =>
    (...args: unknown[]): void => {
      if (logs.length >= MAX_LOG_LINES) return;
      const line = args.map((a) => (typeof a === 'string' ? a : formatValue(a))).join(' ');
      logs.push(prefix + line);
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
