import type {
  ApiErrorBody,
  ChallengeProgressResponse,
  ChallengeRunResponse,
  SubmissionListResponse,
  SubmissionResponse,
} from '@pracstack/api-contracts';
import { executeTests } from '@pracstack/challenge-runtime';
import type { CodeRunner, CodeRunRequest, CodeRunResult } from '@pracstack/code-runner';
import {
  callTests,
  type ChallengeSource,
  splitChallenge,
  splitTrack,
} from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { createContentSource } from '../content/content-source';
import { SlidingWindowRateLimiter } from '../rate-limit';
import { FIXTURE_TRACK, testApi } from '../testing/fixtures';

/** A challenge whose hidden tests contain recognisable secrets. */
const source: ChallengeSource = {
  challenge: {
    id: 'double',
    version: 1,
    title: 'Double',
    summary: 'Double a number.',
    category: 'arrays',
    difficulty: 'easy',
    tags: [],
    instructions: [{ kind: 'paragraph', text: 'Double it.' }],
    languages: {
      typescript: {
        entryPoint: 'double',
        starterCode: 'export function double(n: number): number {}',
      },
    },
    visibleTests: callTests<(n: number) => number>([
      { description: 'two', input: [2], expected: 4 },
    ]),
  },
  hiddenTests: callTests<(n: number) => number>([
    { description: 'secret hidden test one', input: [31337], expected: 62674 },
    { description: 'secret hidden test two', input: [-7], expected: -14 },
  ]),
};

/**
 * Fake runner: "executes" a few named solutions with the shared executor, and
 * records every request so tests can inspect what would enter a container.
 */
class FakeRunner implements CodeRunner {
  readonly requests: CodeRunRequest[] = [];
  constructor(private readonly override?: CodeRunResult) {}

  run(request: CodeRunRequest): Promise<CodeRunResult> {
    this.requests.push(request);
    if (this.override) return Promise.resolve(this.override);
    const solutions: Record<string, (n: number) => number> = {
      correct: (n) => n * 2,
      'visible-only': (n) => (n === 2 ? 4 : 0),
    };
    const fn = solutions[request.code.trim()];
    if (!fn)
      return Promise.resolve({
        kind: 'compile-error',
        diagnostics: [{ line: 1, column: 1, message: 'bad code' }],
      });
    const result = executeTests({ double: fn }, request.entryPoint, request.tests);
    return Promise.resolve(
      result.kind === 'completed'
        ? { kind: 'completed', outcomes: result.outcomes, logs: ['log line'] }
        : { ...result, logs: [] },
    );
  }
}

function setup(runner?: CodeRunner, codeRateLimiter?: SlidingWindowRateLimiter) {
  const { catalog, questionsBySkill } = splitTrack(FIXTURE_TRACK);
  const { challenge, grading } = splitChallenge(source);
  const content = createContentSource('test', [catalog], questionsBySkill, [
    { challenge, grading },
  ]);
  return testApi({
    content,
    ...(runner ? { codeRunner: runner } : {}),
    ...(codeRateLimiter ? { codeRateLimiter } : {}),
  });
}

const submit = (api: ReturnType<typeof setup>, code: string, language = 'typescript') =>
  api.call('POST', '/api/challenges/double/submissions', { language, code });

describe('challenge submissions', () => {
  it('accepts a solution that passes visible and hidden tests, and marks the challenge solved once', async () => {
    const api = setup(new FakeRunner());
    const first = (await submit(api, 'correct')).body as SubmissionResponse;
    expect(first.submission).toMatchObject({
      status: 'accepted',
      visiblePassed: 1,
      visibleTotal: 1,
      hiddenPassed: 2,
      hiddenTotal: 2,
      language: 'typescript',
    });
    expect(first.solvedNow).toBe(true);
    expect(((await submit(api, 'correct')).body as SubmissionResponse).solvedNow).toBe(false);

    const progress = (await api.call('GET', '/api/challenges/progress'))
      .body as ChallengeProgressResponse;
    expect(progress.challenges).toEqual([
      expect.objectContaining({
        challengeId: 'double',
        solved: true,
        attempts: 2,
        languagesSolved: ['typescript'],
      }),
    ]);
  });

  it('never sends expected values to the runner', async () => {
    const runner = new FakeRunner();
    const api = setup(runner);
    await submit(api, 'correct');
    const sent = JSON.stringify(runner.requests);
    expect(sent).toContain('31337'); // inputs go in...
    expect(sent).not.toContain('62674'); // ...expected values do not
    expect(sent).not.toContain('secret hidden test');
  });

  it('reports hidden tests as counts only: no descriptions, inputs, outputs or logs', async () => {
    const api = setup(new FakeRunner());
    const res = (await submit(api, 'visible-only')).body as SubmissionResponse;
    expect(res.submission).toMatchObject({
      status: 'failed',
      visiblePassed: 1,
      hiddenPassed: 0,
      hiddenTotal: 2,
    });
    expect(res.detail).toMatchObject({
      status: 'passed',
      results: [expect.objectContaining({ description: 'two' })],
    });
    const json = JSON.stringify(res);
    for (const leak of ['secret hidden test', '31337', '62674', '-14', 'log line'])
      expect(json).not.toContain(leak);
  });

  it('stores compile errors as submissions', async () => {
    const api = setup(new FakeRunner());
    const res = (await submit(api, 'nonsense')).body as SubmissionResponse;
    expect(res.submission.status).toBe('compile-error');
    expect(res.detail).toEqual({
      status: 'compile-error',
      diagnostics: [{ line: 1, column: 1, message: 'bad code' }],
    });
    const history = (await api.call('GET', '/api/challenges/double/submissions'))
      .body as SubmissionListResponse;
    expect(history.submissions.map((s) => s.status)).toEqual(['compile-error']);
  });

  it('maps timeouts and resource limits', async () => {
    const timeout = setup(new FakeRunner({ kind: 'timeout', timeoutMs: 10_000 }));
    expect(((await submit(timeout, 'correct')).body as SubmissionResponse).submission.status).toBe(
      'timeout',
    );
    const memory = setup(new FakeRunner({ kind: 'resource-limit', message: 'too much memory' }));
    expect(((await submit(memory, 'correct')).body as SubmissionResponse).detail).toEqual({
      status: 'resource-limit',
      message: 'too much memory',
    });
  });
});

describe('challenge runs (visible tests only)', () => {
  it('runs visible tests, returns logs, and stores nothing', async () => {
    const runner = new FakeRunner();
    const api = setup(runner);
    const res = (
      await api.call('POST', '/api/challenges/double/run', {
        language: 'typescript',
        code: 'correct',
      })
    ).body as ChallengeRunResponse;
    expect(res.detail).toMatchObject({ status: 'passed' });
    expect(res.logs).toEqual(['log line']);
    expect(runner.requests[0]?.tests).toHaveLength(1);
    const history = (await api.call('GET', '/api/challenges/double/submissions'))
      .body as SubmissionListResponse;
    expect(history.submissions).toEqual([]);
  });
});

describe('errors and limits', () => {
  it('returns 503 when the runner is unavailable, and stores nothing', async () => {
    const api = setup(new FakeRunner({ kind: 'unavailable', message: 'Docker is not running.' }));
    const res = await submit(api, 'correct');
    expect(res.status).toBe(503);
    expect((res.body as ApiErrorBody).error.message).toBe('Docker is not running.');
    const progress = (await api.call('GET', '/api/challenges/progress'))
      .body as ChallengeProgressResponse;
    expect(progress.challenges).toEqual([]);

    expect((await submit(setup(), 'correct')).status).toBe(503);
  });

  it('validates the request', async () => {
    const api = setup(new FakeRunner());
    expect((await submit(api, 'correct', 'cobol')).status).toBe(400);
    expect((await submit(api, 'correct', 'java')).status).toBe(400); // not offered for this challenge
    expect((await submit(api, '   ')).status).toBe(400);
    expect((await submit(api, 'x'.repeat(70_000))).status).toBe(400);
    expect(
      (
        await api.call('POST', '/api/challenges/nope/submissions', {
          language: 'typescript',
          code: 'x',
        })
      ).status,
    ).toBe(404);
  });

  it('rate-limits code runs and submissions together', async () => {
    const api = setup(new FakeRunner(), new SlidingWindowRateLimiter(2, 60_000));
    expect((await submit(api, 'correct')).status).toBe(200);
    expect(
      (
        await api.call('POST', '/api/challenges/double/run', {
          language: 'typescript',
          code: 'correct',
        })
      ).status,
    ).toBe(200);
    expect((await submit(api, 'correct')).status).toBe(429);
  });
});
