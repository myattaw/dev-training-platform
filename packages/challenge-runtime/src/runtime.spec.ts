import { callTests, type ChallengeTest, operationTests } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import {
  decodeValue,
  deepEqual,
  describeTest,
  encodeValue,
  executeTests,
  formatValue,
  gradeOutcomes,
  runInSandbox,
  runTests,
  toTestInput,
} from './index';

class Counter {
  private n: number;
  constructor(start: number) {
    this.n = start;
  }
  inc(): number {
    return ++this.n;
  }
  reset(): void {
    this.n = 0;
  }
}

const counterTests = operationTests<typeof Counter>([
  {
    description: 'counts up and resets',
    constructorArgs: [5],
    steps: [
      { call: 'inc', args: [], expected: 6 },
      { call: 'reset', args: [] },
      { call: 'inc', args: [], expected: 1 },
    ],
  },
]);

describe('runInSandbox (call tests)', () => {
  it('reports failing tests with expected and actual values', () => {
    const response = runInSandbox(
      'exports.isPangram = () => true;',
      'isPangram',
      callTests<(s: string) => boolean>([{ description: 'empty', input: [''], expected: false }]),
    );
    expect(response).toEqual({
      kind: 'completed',
      logs: [],
      results: [
        { description: 'empty', passed: false, input: '""', expected: 'false', actual: 'true' },
      ],
    });
  });

  it('captures errors thrown by the solution', () => {
    const response = runInSandbox('exports.f = () => { throw new Error("boom"); };', 'f', [
      { kind: 'call', description: 'throws', input: [], expected: 1 },
    ]);
    expect(response.kind === 'completed' && response.results[0]?.error).toBe('Error: boom');
  });

  it('isolates tests from argument mutation', () => {
    const tests: ChallengeTest[] = [
      { kind: 'call', description: 'first', input: [[1]], expected: 1 },
      { kind: 'call', description: 'second', input: [[1]], expected: 1 },
    ];
    // Mutates its argument; each test still receives a fresh copy.
    const response = runInSandbox(
      'exports.f = (a) => { a.push(9); return a.length; };',
      'f',
      tests,
    );
    expect(response.kind === 'completed' && response.results.map((r) => r.actual)).toEqual([
      '2',
      '2',
    ]);
  });

  it('reports a missing export', () => {
    const response = runInSandbox('function isPangram() { return true; }', 'isPangram', []);
    expect(response).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('a function named "isPangram"'),
    });
  });

  it('reports errors thrown while loading the module', () => {
    const response = runInSandbox('throw new TypeError("bad");', 'f', []);
    expect(response).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('TypeError: bad'),
    });
  });

  it('captures console output, with limits', () => {
    const response = runInSandbox(
      'console.log("hi", 42); for (let i = 0; i < 500; i++) console.log(i); exports.f = () => 1;',
      'f',
      [],
    );
    expect(response.logs[0]).toBe('hi 42');
    expect(response.logs).toHaveLength(200);
  });
});

describe('runTests (operations tests)', () => {
  it('passes a correct class and summarises the checked values', () => {
    const outcome = runTests({ Counter }, 'Counter', counterTests);
    expect(outcome).toEqual({
      kind: 'completed',
      results: [
        {
          description: 'counts up and resets',
          passed: true,
          input: 'new Counter(5)\ninc() → 6\nreset()\ninc() → 1',
          expected: '2 return values as specified',
          actual: '2 return values as specified',
        },
      ],
    });
  });

  it('stops at the first wrong step and shows the steps so far', () => {
    class Broken extends Counter {
      override reset(): void {
        /* forgets to reset */
      }
    }
    const outcome = runTests({ Counter: Broken }, 'Counter', counterTests);
    expect(outcome.kind === 'completed' && outcome.results[0]).toEqual({
      description: 'counts up and resets',
      passed: false,
      input: 'new Counter(5)\ninc() → 6\nreset()\ninc() → 7',
      expected: '1',
      actual: '7',
    });
  });

  it('reports a missing method', () => {
    class NoReset {
      inc(): number {
        return 6;
      }
    }
    const outcome = runTests({ Counter: NoReset }, 'Counter', counterTests);
    expect(outcome.kind === 'completed' && outcome.results[0]?.error).toBe(
      'Counter has no method named "reset"',
    );
  });

  it('asks for a class when operations tests are used', () => {
    expect(runTests({}, 'Counter', counterTests)).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('a class named "Counter"'),
    });
  });

  it('works through the CommonJS sandbox too', () => {
    const code = `
      class Counter { constructor(n) { this.n = n; } inc() { return ++this.n; } reset() { this.n = 0; } }
      exports.Counter = Counter;`;
    const response = runInSandbox(code, 'Counter', counterTests);
    expect(response.kind === 'completed' && response.results[0]?.passed).toBe(true);
  });
});

describe('describeTest', () => {
  it('formats call and operations tests for display', () => {
    expect(
      describeTest({ kind: 'call', description: 'x', input: ['a', 1], expected: [1] }, 'f'),
    ).toEqual({
      input: '"a", 1',
      expected: '[1]',
    });
    expect(describeTest(counterTests[0]!, 'Counter')).toEqual({
      input: 'new Counter(5)\ninc() → 6\nreset()\ninc() → 1',
    });
  });
});

describe('deepEqual', () => {
  it('compares primitives, arrays and objects structurally', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual([1, [2]], [1, [2]])).toBe(true);
    expect(deepEqual({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual('1', 1)).toBe(false);
  });
});

describe('formatValue', () => {
  it('formats values for display', () => {
    expect(formatValue('hi')).toBe('"hi"');
    expect(formatValue(undefined)).toBe('undefined');
    expect(formatValue([1, 'a'])).toBe('[1,"a"]');
    expect(formatValue(Infinity)).toBe('Infinity');
    expect(formatValue(10n)).toBe('10n');
  });
});

describe('encodeValue / decodeValue', () => {
  it('round-trips values JSON cannot represent', () => {
    const values = [
      undefined,
      NaN,
      Infinity,
      -Infinity,
      12n,
      [1, undefined],
      { a: NaN },
      'x',
      null,
      true,
    ];
    const restored = JSON.parse(JSON.stringify(values.map((v) => encodeValue(v)))).map(decodeValue);
    expect(restored[0]).toBeUndefined();
    expect(restored[1]).toBeNaN();
    expect(restored.slice(2)).toEqual([
      Infinity,
      -Infinity,
      12n,
      [1, undefined],
      { a: NaN },
      'x',
      null,
      true,
    ]);
  });
});

describe('executeTests + gradeOutcomes (the split used by server-side grading)', () => {
  const tests = callTests<(s: string) => string>([
    { description: 'reverses', input: ['ab'], expected: 'ba' },
  ]);

  it('executes with inputs only: expected values are not part of what is sent', () => {
    const inputs = tests.map(toTestInput);
    expect(JSON.stringify(inputs)).not.toContain('"ba"');
    expect(inputs).toEqual([{ kind: 'call', input: ['ab'] }]);
  });

  it('grades outcomes that crossed a process boundary as JSON', () => {
    const executed = executeTests(
      { f: (s: string) => [...s].reverse().join('') },
      'f',
      tests.map(toTestInput),
    );
    if (executed.kind !== 'completed') throw new Error('load error');
    const transported = JSON.parse(JSON.stringify(executed.outcomes)) as typeof executed.outcomes;
    expect(gradeOutcomes(tests, transported, 'f')).toEqual([
      { description: 'reverses', passed: true, input: '"ab"', expected: '"ba"', actual: '"ba"' },
    ]);
  });

  it('cannot be fooled by a forged outcome without the right value', () => {
    const forged = [{ kind: 'call' as const, value: 'anything' }];
    expect(gradeOutcomes(tests, forged, 'f')[0]?.passed).toBe(false);
  });
});
