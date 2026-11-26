import type { WebTest } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import {
  batchToTestRun,
  newBatchKey,
  parseWebBatchEvent,
  signBatch,
  verifyBatch,
  type WebBatchBody,
} from './batch';

const body = (over: Partial<WebBatchBody> = {}): WebBatchBody => ({
  runId: 'run-1',
  kind: 'completed',
  buildLogs: [],
  logs: ['started'],
  results: [[{ status: 200, headers: {}, body: '{"ok":true}', truncated: false }]],
  timings: { total: 1234 },
  ...over,
});

describe('signed batch responses', () => {
  it('a response signed with the run key verifies', () => {
    const key = newBatchKey();
    expect(verifyBatch(key, 'run-1', signBatch(key, body()))).toEqual(body());
  });

  it('rejects another key, another run, an altered body or a bad signature', () => {
    const key = newBatchKey();
    const signed = signBatch(key, body());
    expect(verifyBatch(newBatchKey(), 'run-1', signed)).toBeUndefined();
    expect(verifyBatch(key, 'run-2', signed)).toBeUndefined();
    expect(
      verifyBatch(key, 'run-1', { ...signed, body: signed.body.replace('started', 'forged') }),
    ).toBeUndefined();
    expect(verifyBatch(key, 'run-1', { ...signed, signature: '0'.repeat(64) })).toBeUndefined();
    expect(verifyBatch(key, 'run-1', { ...signed, signature: 'zz' })).toBeUndefined();
  });

  it('rejects anything that is not a signed response (e.g. one posted by learner code)', () => {
    const key = newBatchKey();
    for (const forged of [null, 'x', [], { kind: 'completed' }, { body: '', signature: '' }]) {
      expect(verifyBatch(key, 'run-1', forged)).toBeUndefined();
    }
    // Validly signed, but not a batch body.
    const notJson = { body: 'not json', signature: signBatch(key, body()).signature };
    expect(verifyBatch(key, 'run-1', notJson)).toBeUndefined();
  });
});

describe('parseWebBatchEvent', () => {
  const valid = {
    runId: 'abc-123',
    key: 'a'.repeat(64),
    framework: 'django',
    tar: 'AAAA',
    sequences: [[{ method: 'GET', path: '/api/items' }]],
  };

  it('accepts a valid event', () => {
    expect(parseWebBatchEvent(valid)).toEqual(valid);
    expect(
      parseWebBatchEvent({
        ...valid,
        framework: 'spring-boot',
        spring: { mainClass: 'com.example.App', librarySet: 'jpa' },
        limits: { startupTimeoutMs: 3000 },
      }),
    ).toBeDefined();
  });

  it.each([
    ['no key', { key: undefined }],
    ['short key', { key: 'abc' }],
    ['bad run id', { runId: '../x' }],
    ['unknown framework', { framework: 'angular' }],
    ['bad method', { sequences: [[{ method: 'TRACE', path: '/' }]] }],
    ['header not a string', { sequences: [[{ method: 'GET', path: '/', headers: { a: 1 } }]] }],
    ['bad spring class', { spring: { mainClass: 'a b', librarySet: 'core' } }],
    ['unknown library set', { spring: { mainClass: 'a.B', librarySet: 'all' } }],
    ['negative limit', { limits: { buildTimeoutMs: -1 } }],
    ['too many sequences', { sequences: Array.from({ length: 101 }, () => []) }],
  ])('rejects %s', (_name, change) => {
    expect(parseWebBatchEvent({ ...valid, ...change })).toBeUndefined();
  });
});

describe('batchToTestRun', () => {
  const test: WebTest = {
    id: 'lists',
    description: 'Lists items',
    category: 'basics',
    steps: [{ request: { method: 'GET', path: '/api/items' }, expect: { status: 200 } }],
  };

  it('grades completed batches on the trusted side', () => {
    const run = batchToTestRun('django', body(), [test]);
    expect(run.kind).toBe('completed');
    if (run.kind === 'completed') expect(run.results[0]?.passed).toBe(true);
    const failing = batchToTestRun(
      'django',
      body({ results: [[{ status: 500, headers: {}, body: '', truncated: false }]] }),
      [test],
    );
    if (failing.kind === 'completed') expect(failing.results[0]?.passed).toBe(false);
  });

  it('maps failures like the Docker runner', () => {
    const build = batchToTestRun(
      'django',
      body({
        kind: 'build-failed',
        buildLogs: ['employees/views.py:3:5: error: SyntaxError: invalid syntax'],
      }),
      [test],
    );
    expect(build.kind).toBe('build-failed');
    if (build.kind === 'build-failed') expect(build.diagnostics[0]?.line).toBe(3);
    expect(batchToTestRun('django', body({ kind: 'time-limit' }), [test]).kind).toBe('time-limit');
    expect(batchToTestRun('django', body({ kind: 'resource-limit' }), [test]).kind).toBe(
      'resource-limit',
    );
    expect(batchToTestRun('django', body({ kind: 'unavailable' }), [test]).kind).toBe(
      'unavailable',
    );
  });
});
