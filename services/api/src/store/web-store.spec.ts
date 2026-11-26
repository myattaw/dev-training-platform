import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DynamoDbLocal, skipDockerTests, startDynamoDbLocal } from '../testing/dynamodb-local';
import { decodeRun, DynamoWebStore, encodeRun } from './dynamo-web';
import { emptyWebData, InMemoryWebStore, type WebRunRecord, type WebStore } from './web-store';

/*
 * Web run records and execution leases, against both stores: the in-memory
 * one (local development) and DynamoDB (on AWS; DynamoDB Local here, which
 * needs Docker; PRACSTACK_SKIP_DOCKER_TESTS=1 skips it).
 */
const run = (over: Partial<WebRunRecord> = {}): WebRunRecord => ({
  id: '6b0f1d2e-8c1f-4a33-9a51-2ef1f1f1f1f1',
  userId: 'alice',
  challengeId: 'employee-rest-api',
  framework: 'django',
  mode: 'submit',
  status: 'queued',
  acceptedAt: '2026-11-26T12:00:00.000Z',
  files: { 'employees/views.py': 'print(1)' },
  expiresAt: Date.parse('2026-11-27T12:00:00.000Z'),
  ...over,
});

function storeContract(name: string, make: () => Promise<WebStore>) {
  describe(name, () => {
    it('keeps runs per user and updates them only from the expected status', async () => {
      const store = await make();
      await store.createWebRun(run());
      expect(await store.getWebRun('alice', run().id)).toEqual(run());
      expect(await store.getWebRun('bob', run().id)).toBeUndefined();
      // Claim: queued → building succeeds once.
      expect(await store.updateWebRun(run({ status: 'building' }), 'queued')).toBe(true);
      expect(await store.updateWebRun(run({ status: 'building' }), 'queued')).toBe(false);
      expect((await store.getWebRun('alice', run().id))?.status).toBe('building');
    });

    it('a lease admits at most `limit` live holders; expired holders do not count', async () => {
      const store = await make();
      const now = 1_000_000;
      expect(await store.acquireWebLease('runs', 'a', 2, now, now + 100)).toBe(true);
      expect(await store.acquireWebLease('runs', 'b', 2, now, now + 100)).toBe(true);
      expect(await store.acquireWebLease('runs', 'c', 2, now, now + 100)).toBe(false);
      // A holder that already holds it keeps it.
      expect(await store.acquireWebLease('runs', 'a', 2, now, now + 100)).toBe(true);
      await store.releaseWebLease('runs', 'a');
      expect(await store.acquireWebLease('runs', 'c', 2, now, now + 100)).toBe(true);
      // Past their time, holders free their slots (a crashed worker cannot block forever).
      expect(await store.acquireWebLease('runs', 'd', 2, now + 200, now + 300)).toBe(true);
      // Leases are independent of each other.
      expect(await store.acquireWebLease('user-runs#bob', 'x', 1, now, now + 100)).toBe(true);
    });

    it('concurrent acquisitions never exceed the limit', async () => {
      const store = await make();
      const now = 5_000_000;
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          store.acquireWebLease('busy', `h${i}`, 2, now, now + 1_000),
        ),
      );
      expect(results.filter(Boolean).length).toBeLessThanOrEqual(2);
      expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    });
  });
}

storeContract('in-memory web store', () => {
  const data = emptyWebData();
  return Promise.resolve(
    new InMemoryWebStore(
      () => data,
      () => Promise.resolve(),
    ),
  );
});

describe.skipIf(skipDockerTests)('DynamoDB web store', () => {
  let local: DynamoDbLocal;
  beforeAll(async () => {
    local = await startDynamoDbLocal();
  }, 120_000);
  afterAll(() => local?.stop());
  storeContract(
    'contract',
    async () => new DynamoWebStore({ tableName: await local.createTable(), client: local.client }),
  );
});

describe('run record encoding (DynamoDB item limit)', () => {
  it('round-trips a run', () => {
    expect(decodeRun(encodeRun(run()))).toEqual(run());
  });

  it('shrinks a completed run that would not fit: logs first, then the files', () => {
    const noise = (n: number) =>
      Array.from({ length: n }, (_, i) => `${i}:${Math.random()}`).join('');
    const huge = run({
      status: 'completed',
      files: { 'a.py': noise(60_000) },
      result: {
        verdict: 'tests-failed',
        diagnostics: [],
        visible: [],
        hidden: [],
        logs: Array.from({ length: 200 }, () => noise(300)),
      },
    });
    const decoded = decodeRun(encodeRun(huge));
    expect(decoded.result?.verdict).toBe('tests-failed');
    expect(encodeRun(huge).length).toBeLessThanOrEqual(300_000);
  });
});
