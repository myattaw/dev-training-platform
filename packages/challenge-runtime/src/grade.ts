/**
 * Compares raw outcomes with expected values. Runs on the trusted side only.
 */
import type { CallTest, ChallengeTest, OperationsTest } from '@pracstack/content-model';
import type { RawOutcome } from './execute';
import { decodeValue, deepEqual, formatValue } from './values';

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

/** Grades outcomes produced by `executeTests` for the same tests, in the same order. */
export function gradeOutcomes(
  tests: readonly ChallengeTest[],
  outcomes: readonly RawOutcome[],
  entryPoint: string,
): TestResult[] {
  return tests.map((test, i) => {
    const outcome = outcomes[i];
    if (test.kind === 'call') {
      return gradeCall(
        test,
        outcome?.kind === 'call' ? outcome : { kind: 'call', error: 'No result' },
      );
    }
    return gradeOperations(
      test,
      outcome?.kind === 'operations'
        ? outcome
        : { kind: 'operations', values: [], error: { step: -1, message: 'No result' } },
      entryPoint,
    );
  });
}

function gradeCall(test: CallTest, outcome: Extract<RawOutcome, { kind: 'call' }>): TestResult {
  const base = {
    description: test.description,
    input: formatArgs(test.input),
    expected: formatValue(test.expected),
  };
  if (outcome.error !== undefined || !('value' in outcome)) {
    return { ...base, passed: false, error: outcome.error ?? 'No value returned' };
  }
  const actual = decodeValue(outcome.value ?? null);
  return { ...base, passed: deepEqual(actual, test.expected), actual: formatValue(actual) };
}

function gradeOperations(
  test: OperationsTest,
  outcome: Extract<RawOutcome, { kind: 'operations' }>,
  entryPoint: string,
): TestResult {
  const lines = [`new ${entryPoint}(${formatArgs(test.constructorArgs)})`];
  const fail = (expected: string, extra: { actual?: string; error?: string }): TestResult => ({
    description: test.description,
    passed: false,
    input: lines.join('\n'),
    expected,
    ...extra,
  });
  if (outcome.error?.step === -1) return fail('a new instance', { error: outcome.error.message });

  let checked = 0;
  for (const [i, step] of test.steps.entries()) {
    const call = `${step.call}(${formatArgs(step.args)})`;
    const expectation = 'expected' in step ? formatValue(step.expected) : 'no error';
    if (outcome.error?.step === i || i >= outcome.values.length) {
      lines.push(call);
      return fail(expectation, { error: outcome.error?.message ?? 'Did not run' });
    }
    const actual = decodeValue(outcome.values[i] ?? null);
    if ('expected' in step) {
      checked++;
      lines.push(`${call} → ${formatValue(actual)}`);
      if (!deepEqual(actual, step.expected))
        return fail(formatValue(step.expected), { actual: formatValue(actual) });
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

function formatArgs(args: readonly unknown[]): string {
  return args.map(formatValue).join(', ');
}
