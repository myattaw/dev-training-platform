import { CHALLENGES } from '../data';
import { deepEqual, formatValue, runInSandbox } from './sandbox-runtime';

/**
 * Reference solutions, written as the CommonJS JavaScript the TypeScript compiler emits.
 * They live only in tests, so they never ship to learners, but they prove each
 * challenge's test data is correct.
 */
const REFERENCE_SOLUTIONS: Record<string, string> = {
  pangram: `
    exports.isPangram = (sentence) => new Set(sentence.toLowerCase().match(/[a-z]/g) ?? []).size === 26;
  `,
  'reverse-string': `
    exports.reverse = (input) => [...input].reverse().join('');
  `,
  'balanced-brackets': `
    exports.isBalanced = (text) => {
      const pairs = { ')': '(', ']': '[', '}': '{' };
      const stack = [];
      for (const ch of text) {
        if ('([{'.includes(ch)) stack.push(ch);
        else if (ch in pairs && stack.pop() !== pairs[ch]) return false;
      }
      return stack.length === 0;
    };
  `,
  'merge-intervals': `
    exports.merge = (intervals) => {
      const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
      const out = [];
      for (const [start, end] of sorted) {
        const last = out[out.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else out.push([start, end]);
      }
      return out;
    };
  `,
};

describe('runInSandbox', () => {
  for (const challenge of CHALLENGES) {
    it(`passes every visible test for the "${challenge.id}" reference solution`, () => {
      const solution = REFERENCE_SOLUTIONS[challenge.id];
      const setup = challenge.languages.typescript;
      expect(solution, `missing reference solution for ${challenge.id}`).toBeDefined();
      expect(setup, `${challenge.id} has no TypeScript setup`).toBeDefined();
      if (!setup) return;

      const response = runInSandbox(solution, setup.entryPoint, challenge.visibleTests);

      expect(response.kind).toBe('completed');
      if (response.kind === 'completed') {
        const failures = response.results.filter((r) => !r.passed).map((r) => r.description);
        expect(failures).toEqual([]);
      }
    });
  }

  it('reports failing tests with expected and actual values', () => {
    const response = runInSandbox('exports.isPangram = () => true;', 'isPangram', [
      { description: 'empty', input: [''], expected: false },
    ]);
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
      { description: 'throws', input: [], expected: 1 },
    ]);
    expect(response.kind === 'completed' && response.results[0].error).toBe('Error: boom');
  });

  it('reports a missing export', () => {
    const response = runInSandbox('function isPangram() { return true; }', 'isPangram', []);
    expect(response.kind).toBe('load-error');
  });

  it('reports errors thrown while loading the module', () => {
    const response = runInSandbox('throw new TypeError("bad");', 'f', []);
    expect(response).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('TypeError: bad'),
    });
  });

  it('captures console output', () => {
    const response = runInSandbox('console.log("hi", 42); exports.f = () => 1;', 'f', []);
    expect(response.logs).toEqual(['hi 42']);
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
  });
});
