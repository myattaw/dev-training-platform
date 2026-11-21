/**
 * Executes tests WITHOUT knowing their expected values.
 *
 * This is the half of test running that may happen in an untrusted place
 * (the learner's browser, a runner container). It receives only inputs and
 * reports what the code returned or threw. Comparing with expected values
 * happens in `grade.ts`, on the trusted side, so code under test cannot make
 * a hidden test pass by tampering with the comparison.
 */
import type { ChallengeTest } from '@pracstack/content-model';
import { type EncodedValue, encodeValue } from './values';

export type TestInput =
  | { readonly kind: 'call'; readonly input: readonly unknown[] }
  | {
      readonly kind: 'operations';
      readonly constructorArgs: readonly unknown[];
      readonly steps: readonly { readonly call: string; readonly args: readonly unknown[] }[];
    };

/** What happened when one test input was executed. */
export type RawOutcome =
  | { readonly kind: 'call'; readonly value?: EncodedValue; readonly error?: string }
  | {
      readonly kind: 'operations';
      /** Return values of the steps that completed, in order. */
      readonly values: readonly EncodedValue[];
      /** Set when the constructor (step -1) or a step threw or did not exist. */
      readonly error?: { readonly step: number; readonly message: string };
    };

export type ExecuteResult =
  | { readonly kind: 'completed'; readonly outcomes: readonly RawOutcome[] }
  | { readonly kind: 'load-error'; readonly message: string };

/** Strips descriptions and expected values: the only test data sent to untrusted code. */
export function toTestInput(test: ChallengeTest): TestInput {
  return test.kind === 'call'
    ? { kind: 'call', input: test.input }
    : {
        kind: 'operations',
        constructorArgs: test.constructorArgs,
        steps: test.steps.map((s) => ({ call: s.call, args: s.args })),
      };
}

type Callable = (...args: unknown[]) => unknown;
type Constructable = new (...args: unknown[]) => Record<string, unknown>;

export function executeTests(
  moduleExports: Readonly<Record<string, unknown>>,
  entryPoint: string,
  inputs: readonly TestInput[],
): ExecuteResult {
  const entry = moduleExports[entryPoint];
  const wantsClass = inputs.some((t) => t.kind === 'operations');
  if (typeof entry !== 'function') {
    return {
      kind: 'load-error',
      message: `Expected your code to export a ${wantsClass ? 'class' : 'function'} named "${entryPoint}". Did you remove the "export" keyword or rename it?`,
    };
  }
  return {
    kind: 'completed',
    outcomes: inputs.map((input) =>
      input.kind === 'call'
        ? executeCall(entry as Callable, input)
        : executeOperations(entry as Constructable, entryPoint, input),
    ),
  };
}

function executeCall(fn: Callable, test: Extract<TestInput, { kind: 'call' }>): RawOutcome {
  try {
    // Clone inputs so code that mutates its arguments can't affect other tests.
    return { kind: 'call', value: encodeValue(fn(...structuredClone([...test.input]))) };
  } catch (err) {
    return { kind: 'call', error: errorMessage(err) };
  }
}

function executeOperations(
  Cls: Constructable,
  entryPoint: string,
  test: Extract<TestInput, { kind: 'operations' }>,
): RawOutcome {
  let instance: Record<string, unknown>;
  try {
    instance = new Cls(...structuredClone([...test.constructorArgs]));
  } catch (err) {
    return { kind: 'operations', values: [], error: { step: -1, message: errorMessage(err) } };
  }
  const values: EncodedValue[] = [];
  for (const [i, step] of test.steps.entries()) {
    const method = instance[step.call];
    if (typeof method !== 'function') {
      return {
        kind: 'operations',
        values,
        error: { step: i, message: `${entryPoint} has no method named "${step.call}"` },
      };
    }
    try {
      values.push(
        encodeValue((method as Callable).apply(instance, structuredClone([...step.args]))),
      );
    } catch (err) {
      return { kind: 'operations', values, error: { step: i, message: errorMessage(err) } };
    }
  }
  return { kind: 'operations', values };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
