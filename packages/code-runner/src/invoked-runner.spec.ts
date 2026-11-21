import { describe, expect, it } from 'vitest';
import { type Invoke, InvokedCodeRunner } from './invoked-runner';
import type { CodeRunRequest } from './protocol';
import { parseCodeRunRequest } from './validate';

const request: CodeRunRequest = {
  language: 'java',
  code: 'class Solution {}',
  entryPoint: 'f',
  tests: [{ kind: 'call', input: [1] }],
};
const functions = { typescript: 'ts-fn', java: 'java-fn' };
const runner = (invoke: Invoke) => new InvokedCodeRunner(invoke, functions);

describe('InvokedCodeRunner', () => {
  it('invokes the function for the language and returns a valid result', async () => {
    const calls: string[] = [];
    const result = await runner((name, payload) => {
      calls.push(name);
      expect(payload).toEqual(request);
      return Promise.resolve({
        kind: 'returned',
        payload: { kind: 'completed', outcomes: [{ kind: 'call', value: 2 }], logs: ['hi'] },
      });
    }).run(request);
    expect(calls).toEqual(['java-fn']);
    expect(result).toEqual({
      kind: 'completed',
      outcomes: [{ kind: 'call', value: 2 }],
      logs: ['hi'],
    });
  });

  it('treats malformed or oversized runner responses as untrusted garbage', async () => {
    for (const payload of [
      null,
      'completed',
      { kind: 'completed', outcomes: [], logs: [] }, // wrong number of outcomes
      { kind: 'completed', outcomes: [{ kind: 'call', value: 1 }], logs: ['x'.repeat(5000)] },
      { kind: 'compile-error', diagnostics: [{ line: 'one', column: 1, message: 'm' }] },
      { kind: 'surprise' },
    ]) {
      const result = await runner(() => Promise.resolve({ kind: 'returned', payload })).run(
        request,
      );
      expect(result, JSON.stringify(payload)).toMatchObject({ kind: 'load-error' });
    }
  });

  it('maps function failures and refusals', async () => {
    const failing = (error: string) =>
      runner(() => Promise.resolve({ kind: 'function-error', error })).run(request);
    expect((await failing('Task timed out after 25.00 seconds')).kind).toBe('timeout');
    expect((await failing('Runtime exited with error: signal: killed (out of memory)')).kind).toBe(
      'resource-limit',
    );
    expect((await failing('Runtime.ExitError')).kind).toBe('load-error');
    const refused = await runner(() =>
      Promise.resolve({ kind: 'refused', message: 'TooManyRequestsException' }),
    ).run(request);
    expect(refused.kind).toBe('unavailable');
  });
});

describe('parseCodeRunRequest', () => {
  it('accepts requests from the API and rejects anything else', () => {
    expect(parseCodeRunRequest(request)).toEqual(request);
    expect(parseCodeRunRequest({ ...request, language: 'python' })).toBeUndefined();
    expect(parseCodeRunRequest({ ...request, code: 1 })).toBeUndefined();
    expect(parseCodeRunRequest('x')).toBeUndefined();
  });
});
