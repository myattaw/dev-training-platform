import type { WebProgressResponse, WebRun, WebRunResponse } from '@pracstack/api-contracts';
import { splitWebChallenge, type WebChallengeSource } from '@pracstack/content-model';
import { WEB_CHALLENGES } from '@pracstack/content/web-challenges';
import {
  type BatchRun,
  LambdaWebExecutor,
  type ProbeResponse,
  signBatch,
  type WebBatchEvent,
  type WebExecutor,
  type WebInvokeOutcome,
} from '@pracstack/web-runner';
import { describe, expect, it } from 'vitest';
import { createContentSource } from '../content/content-source';
import { testApi, type TestApi } from '../testing/fixtures';
import { DEFAULT_WEB_POLICY } from './web-challenge-service';

/*
 * The web worker without Docker: a fake executor stands in for the
 * applications. Runs are stored, claimed, limited globally (2 at once by
 * default), graded on the trusted side and completed; the Lambda executor
 * believes only responses signed with the run's key.
 */
const employee = WEB_CHALLENGES[0]?.source as WebChallengeSource;
const { challenge, projects, grading } = splitWebChallenge(employee);
const content = createContentSource(
  'test',
  [],
  {},
  [],
  undefined,
  [],
  undefined,
  [],
  [{ challenge, projects, grading }],
);
const tests = [...challenge.visibleTests, ...employee.hiddenTests];

/** Responses that fail every test (a 500 for each step). */
const failingResponses = (sequences: readonly (readonly unknown[])[]) =>
  sequences.map((s) => s.map((): ProbeResponse => ({ status: 500, headers: {}, body: '' })));

/** An executor whose batches wait until the test lets them finish. */
class GatedExecutor implements WebExecutor {
  running = 0;
  maxRunning = 0;
  calls = 0;
  private readonly gates: (() => void)[] = [];

  async runBatch(_project: unknown, sequences: readonly (readonly unknown[])[]): Promise<BatchRun> {
    this.calls++;
    this.running++;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    await new Promise<void>((resolve) => this.gates.push(resolve));
    this.running--;
    return { kind: 'completed', responses: failingResponses(sequences), logs: [], durationMs: 1 };
  }

  get waiting(): number {
    return this.gates.length;
  }

  releaseAll(): void {
    this.gates.splice(0).forEach((g) => g());
  }
}

const until = async (check: () => boolean | Promise<boolean>, ms = 5_000) => {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const submit = (t: TestApi, user: 'alice' | 'bob' = 'alice', mode = 'submit') =>
  t.call(
    'POST',
    '/api/web-challenges/employee-rest-api/runs',
    { framework: 'django', files: {}, mode },
    user,
  );

const runOf = async (t: TestApi, id: string, user: 'alice' | 'bob' = 'alice'): Promise<WebRun> => {
  const res = await t.call('GET', `/api/web-runs/${id}`, undefined, user);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as WebRunResponse).run;
};

describe('web worker (fake executor)', () => {
  it('runs at most 2 batches at once across users; the rest wait in the queue', async () => {
    const executor = new GatedExecutor();
    const t = testApi({
      content,
      webExecutor: executor,
      webPolicy: { ...DEFAULT_WEB_POLICY, concurrentPerUser: 2 },
    });
    const ids: { id: string; user: 'alice' | 'bob' }[] = [];
    for (const user of ['alice', 'alice', 'bob'] as const) {
      const res = await submit(t, user);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      ids.push({ id: (res.body as WebRunResponse).run.id, user });
    }
    await until(() => executor.waiting === 2);
    // The third run is stored and waiting for a slot; it never started.
    await new Promise((r) => setTimeout(r, 1_200));
    expect(executor.calls).toBe(2);
    const statuses = await Promise.all(ids.map((r) => runOf(t, r.id, r.user)));
    expect(statuses.filter((r) => r.status === 'queued')).toHaveLength(1);
    executor.releaseAll();
    await until(() => executor.waiting === 1, 5_000);
    executor.releaseAll();
    await until(async () =>
      (await Promise.all(ids.map((r) => runOf(t, r.id, r.user)))).every(
        (r) => r.status === 'completed',
      ),
    );
    expect(executor.maxRunning).toBe(2);
    expect(executor.calls).toBe(3);
  });

  it('grades on the trusted side, records the submission, and frees the user slot', async () => {
    const executor = new GatedExecutor();
    const t = testApi({ content, webExecutor: executor });
    const id = ((await submit(t)).body as WebRunResponse).run.id;
    // One run per user at a time: a second is refused while the first runs.
    expect((await submit(t)).status).toBe(409);
    // Bob cannot see Alice's run.
    expect((await t.call('GET', `/api/web-runs/${id}`, undefined, 'bob')).status).toBe(404);
    await until(() => executor.waiting === 1);
    executor.releaseAll();
    await until(async () => (await runOf(t, id)).status === 'completed');
    const run = await runOf(t, id);
    expect(run.result?.verdict).toBe('tests-failed');
    expect(run.result?.hidden.length).toBe(employee.hiddenTests.length);
    expect(run.result?.logs).toEqual([]);
    const progress = (await t.call('GET', '/api/web-challenges/progress'))
      .body as WebProgressResponse;
    expect(progress.challenges[0]).toMatchObject({ attempts: 1, solved: false });
    // The slot is free again.
    expect((await submit(t)).status).toBe(200);
  });

  it('an infrastructure error is reported as such and never counts as an attempt', async () => {
    const executor: WebExecutor = {
      runBatch: () => Promise.resolve({ kind: 'unavailable', message: 'The runner is down.' }),
    };
    const t = testApi({ content, webExecutor: executor });
    const id = ((await submit(t)).body as WebRunResponse).run.id;
    await until(async () => (await runOf(t, id)).status === 'completed');
    const run = await runOf(t, id);
    expect(run.result?.verdict).toBe('infrastructure-error');
    expect(run.result?.message).toMatch(/does not count/);
    const progress = (await t.call('GET', '/api/web-challenges/progress'))
      .body as WebProgressResponse;
    expect(progress.challenges).toEqual([]);
    expect((await submit(t)).status).toBe(200);
  });

  it('a run that cannot get a slot in time ends as "busy" (infrastructure error)', async () => {
    const executor = new GatedExecutor();
    const t = testApi({
      content,
      webExecutor: executor,
      webPolicy: { ...DEFAULT_WEB_POLICY, concurrentGlobal: 0 },
    });
    // concurrentGlobal 0: no slot ever frees; the in-process worker waits up to its limit.
    // Use the store directly to show the busy path without waiting minutes.
    const { WebRunWorker } = await import('./web-run-worker');
    const res = await submit(t);
    const id = (res.body as WebRunResponse).run.id;
    const worker = new WebRunWorker({
      findChallenge: (cid) => t.content.findWebChallenge(cid),
      store: t.store.web,
      executor,
      concurrentGlobal: 0,
      queueWaitMs: 50,
      pollMs: 10,
      now: () => new Date(),
    });
    await worker.process('alice', id);
    const run = await runOf(t, id);
    expect(run.status).toBe('completed');
    expect(run.result?.verdict).toBe('infrastructure-error');
    expect(run.result?.message).toMatch(/busy/);
    expect(executor.calls).toBe(0);
  });

  it('a repeated dispatch of the same run executes it once', async () => {
    const executor = new GatedExecutor();
    const t = testApi({ content, webExecutor: executor });
    const id = ((await submit(t)).body as WebRunResponse).run.id;
    const { WebRunWorker } = await import('./web-run-worker');
    const duplicate = new WebRunWorker({
      findChallenge: (cid) => t.content.findWebChallenge(cid),
      store: t.store.web,
      executor,
      concurrentGlobal: 2,
      queueWaitMs: 1_000,
      pollMs: 10,
      now: () => new Date(),
    });
    await until(() => executor.waiting === 1);
    await duplicate.process('alice', id);
    expect(executor.calls).toBe(1);
    // The duplicate did not free Alice's slot while the first worker runs.
    expect((await submit(t)).status).toBe(409);
    executor.releaseAll();
    await until(async () => (await runOf(t, id)).status === 'completed');
  });
});

describe('Lambda executor (fake invoke)', () => {
  const runWith = async (respond: (event: WebBatchEvent) => WebInvokeOutcome) => {
    const rejected: string[] = [];
    const executor = new LambdaWebExecutor(
      (_fn, payload) => Promise.resolve(respond(payload as WebBatchEvent)),
      { django: 'web-django-function' },
      { onRejected: (fw) => rejected.push(fw) },
    );
    const t = testApi({ content, webExecutor: executor });
    const id = ((await submit(t)).body as WebRunResponse).run.id;
    await until(async () => (await runOf(t, id)).status === 'completed');
    return { run: await runOf(t, id), rejected };
  };

  it('grades a response signed with the run key; the event carries requests only', async () => {
    let seen: WebBatchEvent | undefined;
    const { run, rejected } = await runWith((event) => {
      seen = event;
      return {
        kind: 'returned',
        payload: signBatch(event.key, {
          runId: event.runId,
          kind: 'completed',
          buildLogs: [],
          logs: [],
          results: failingResponses(event.sequences),
          timings: { total: 5 },
        }),
      };
    });
    expect(run.result?.verdict).toBe('tests-failed');
    expect(rejected).toEqual([]);
    expect(seen?.sequences).toHaveLength(tests.length);
    // Expected values never leave the trusted side.
    const event = JSON.stringify(seen);
    expect(event).not.toContain('"expect"');
    for (const test of employee.hiddenTests) expect(event).not.toContain(test.description);
  });

  it('a forged, unsigned or replayed response is an infrastructure error and raises an alarm', async () => {
    for (const forge of [
      (e: WebBatchEvent) => ({
        body: JSON.stringify({ runId: e.runId, kind: 'completed' }),
        signature: '0'.repeat(64),
      }),
      (e: WebBatchEvent) =>
        signBatch('f'.repeat(64), {
          runId: e.runId,
          kind: 'completed',
          buildLogs: [],
          logs: [],
          timings: {},
        }),
      (e: WebBatchEvent) =>
        signBatch(e.key, {
          runId: 'another-run',
          kind: 'completed',
          buildLogs: [],
          logs: [],
          timings: {},
        }),
    ]) {
      const { run, rejected } = await runWith((event) => ({
        kind: 'returned',
        payload: forge(event),
      }));
      expect(run.result?.verdict).toBe('infrastructure-error');
      expect(rejected).toEqual(['django']);
    }
  });

  it('maps function failures: timeout, memory, a killed supervisor, a refused call', async () => {
    const verdictFor = async (outcome: WebInvokeOutcome) =>
      (await runWith(() => outcome)).run.result?.verdict;
    expect(await verdictFor({ kind: 'function-error', error: 'Task timed out after 300 s' })).toBe(
      'time-limit-exceeded',
    );
    expect(
      await verdictFor({
        kind: 'function-error',
        error: 'Runtime exited with error: signal: killed',
      }),
    ).toBe('resource-limit-exceeded');
    expect(await verdictFor({ kind: 'function-error', error: 'Runtime.ExitError' })).toBe(
      'startup-error',
    );
    expect(await verdictFor({ kind: 'refused', message: 'TooManyRequestsException' })).toBe(
      'infrastructure-error',
    );
  });
});
