import type {
  AnswerResponse,
  ApiErrorBody,
  HintResponse,
  HistoryResponse,
  MeResponse,
  NextQuestionResponse,
  ProgressResponse,
} from '@pracstack/api-contracts';
import { describe, expect, it } from 'vitest';
import { createApi } from './app';
import { LocalDevAuthenticator } from './auth';
import { TOKEN_TTL_MS } from './practice/practice-service';
import { SlidingWindowRateLimiter } from './rate-limit';
import { InMemoryProgressStore } from './store/memory-store';
import type { RecordAnswer } from './store/progress-store';
import { fixtureContent, testApi } from './testing/fixtures';

const next = async (api: ReturnType<typeof testApi>, user: 'alice' | 'bob' = 'alice') => {
  const res = await api.call(
    'POST',
    '/api/skill-mastery/practice/next',
    { skillId: 'demo-skill' },
    user,
  );
  expect(res.status).toBe(200);
  return res.body as NextQuestionResponse;
};
const pickA = { format: 'multiple-choice', selected: ['a'] };
const errorCode = (body: unknown) => (body as ApiErrorBody).error.code;

describe('practice flow', () => {
  it('serves a question without any answer data', async () => {
    const api = testApi();
    const served = await next(api);
    expect(served.question).toMatchObject({ id: 'q-mcq', difficulty: 1, hintCount: 2 });
    const json = JSON.stringify(served);
    for (const secret of ['correct', 'explanation', 'It is the first one.', 'A is right.']) {
      expect(json).not.toContain(secret);
    }
    expect(served.skill).toEqual({
      skillId: 'demo-skill',
      score: 0,
      tier: 1,
      mastered: false,
      attempts: 0,
    });
    expect(served.selection).toEqual({ reason: 'new' });
  });

  it('scores a correct answer on the server and reveals the explanation', async () => {
    const api = testApi();
    const { token } = await next(api);
    const res = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: pickA,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      result: 'correct',
      scoreBefore: 0,
      scoreAfter: 6, // a Beginner question is worth 6 (docs/scoring.md)
      xpAwarded: 10,
      masteredNow: false,
      tierBefore: 1,
      tierAfter: 1,
      repeat: false,
      cappedByTier: false,
      correctAnswer: { format: 'multiple-choice', correct: ['a'] },
      explanation: [{ kind: 'paragraph', text: 'A is right.' }],
      skill: { skillId: 'demo-skill', score: 6, tier: 1, attempts: 1 },
    });

    const me = (await api.call('GET', '/api/me')).body as MeResponse;
    expect(me.xp).toBe(10);
    const progress = (await api.call('GET', '/api/skill-mastery/progress?technologyId=demo'))
      .body as ProgressResponse;
    expect(progress.skills).toEqual([
      expect.objectContaining({ skillId: 'demo-skill', score: 6, attempts: 1 }),
    ]);
  });

  it('does not let learners reroll: next returns the same unanswered question', async () => {
    const api = testApi({ random: Math.random });
    const first = await next(api);
    const second = await next(api);
    expect(second.token).toBe(first.token);
    expect(second.question.id).toBe(first.question.id);
  });

  it('is idempotent: answering the same token again replays the result without rescoring', async () => {
    const api = testApi();
    const { token } = await next(api);
    const first = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: pickA,
    });
    const again = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: { format: 'multiple-choice', selected: ['b'] },
    });
    expect(again.body).toEqual(first.body);
    const history = (await api.call('GET', '/api/skill-mastery/skills/demo-skill/history'))
      .body as HistoryResponse;
    expect(history.attempts).toHaveLength(1);
    expect(((await api.call('GET', '/api/me')).body as MeResponse).xp).toBe(10);
  });

  it('serves a different question after an answer', async () => {
    const api = testApi();
    const first = await next(api);
    await api.call('POST', '/api/skill-mastery/practice/answer', {
      token: first.token,
      answer: pickA,
    });
    const second = await next(api);
    expect(second.token).not.toBe(first.token);
    expect(second.question.id).not.toBe('q-mcq');
  });

  it('records history, most recent first', async () => {
    const api = testApi();
    for (let i = 0; i < 2; i++) {
      const served = await next(api);
      const answer =
        served.question.format === 'multiple-choice'
          ? { format: 'multiple-choice', selected: ['b'] }
          : { format: served.question.format, output: 'x', blanks: {} };
      await api.call('POST', '/api/skill-mastery/practice/answer', { token: served.token, answer });
      api.advance(1000);
    }
    const history = (await api.call('GET', '/api/skill-mastery/skills/demo-skill/history'))
      .body as HistoryResponse;
    expect(history.attempts).toHaveLength(2);
    expect(history.attempts[0]!.answeredAt > history.attempts[1]!.answeredAt).toBe(true);
    expect(history.skill.attempts).toBe(2);
  });
});

describe('hints', () => {
  it('reveals hints one at a time, counts them on the server and reduces the gain', async () => {
    const api = testApi();
    const { token } = await next(api);
    const h1 = (await api.call('POST', '/api/skill-mastery/practice/hint', { token }))
      .body as HintResponse;
    expect(h1).toEqual({ hint: 'It is the first one.', index: 0, remaining: 1 });

    // Resuming the question shows hints already revealed.
    expect((await next(api)).hintsRevealed).toEqual(['It is the first one.']);

    const h2 = (await api.call('POST', '/api/skill-mastery/practice/hint', { token }))
      .body as HintResponse;
    expect(h2).toEqual({ hint: 'It is A.', index: 1, remaining: 0 });
    const none = await api.call('POST', '/api/skill-mastery/practice/hint', { token });
    expect(none.status).toBe(400);

    const answer = (
      await api.call('POST', '/api/skill-mastery/practice/answer', { token, answer: pickA })
    ).body as AnswerResponse;
    expect(answer.scoreAfter).toBe(2); // 6 × 0.3 with two hints
    const history = (await api.call('GET', '/api/skill-mastery/skills/demo-skill/history'))
      .body as HistoryResponse;
    expect(history.attempts[0]!.hintsUsed).toBe(2);
  });

  it('refuses hints after the question is answered', async () => {
    const api = testApi();
    const { token } = await next(api);
    await api.call('POST', '/api/skill-mastery/practice/answer', { token, answer: pickA });
    const res = await api.call('POST', '/api/skill-mastery/practice/hint', { token });
    expect(res.status).toBe(409);
  });
});

describe('tokens', () => {
  it('expire after 30 minutes; next then serves a fresh question', async () => {
    const api = testApi();
    const { token } = await next(api);
    api.advance(TOKEN_TTL_MS + 1);
    const res = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: pickA,
    });
    expect(res.status).toBe(410);
    expect(errorCode(res.body)).toBe('token-expired');
    expect((await next(api)).token).not.toBe(token);
  });

  it('cannot be used by another user (reported as not found)', async () => {
    const api = testApi();
    const { token } = await next(api, 'alice');
    const res = await api.call(
      'POST',
      '/api/skill-mastery/practice/answer',
      { token, answer: pickA },
      'bob',
    );
    expect(res.status).toBe(404);
    const hint = await api.call('POST', '/api/skill-mastery/practice/hint', { token }, 'bob');
    expect(hint.status).toBe(404);
  });

  it('keeps users separate', async () => {
    const api = testApi();
    const { token } = await next(api, 'alice');
    await api.call('POST', '/api/skill-mastery/practice/answer', { token, answer: pickA }, 'alice');
    const bob = (
      await api.call('GET', '/api/skill-mastery/progress?technologyId=demo', undefined, 'bob')
    ).body as ProgressResponse;
    expect(bob.skills).toEqual([]);
  });
});

describe('validation and errors', () => {
  it.each([
    ['missing body', '/api/skill-mastery/practice/next', undefined],
    ['bad skill id', '/api/skill-mastery/practice/next', { skillId: '../etc/passwd' }],
    ['bad token', '/api/skill-mastery/practice/answer', { token: 'nope', answer: pickA }],
    [
      'unknown answer format',
      '/api/skill-mastery/practice/answer',
      { token: '00000000-0000-0000-0000-000000000000', answer: { format: 'essay' } },
    ],
    [
      'oversized output',
      '/api/skill-mastery/practice/answer',
      {
        token: '00000000-0000-0000-0000-000000000000',
        answer: { format: 'predict-output', output: 'x'.repeat(2001) },
      },
    ],
  ])('rejects %s with 400', async (_, path, body) => {
    const res = await testApi().call('POST', path, body);
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('bad-request');
  });

  it('rejects an answer in the wrong format for the question', async () => {
    const api = testApi();
    const { token } = await next(api);
    const res = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: { format: 'predict-output', output: 'A' },
    });
    expect(res.status).toBe(400);
    // Nothing was recorded.
    expect(((await api.call('GET', '/api/me')).body as MeResponse).xp).toBe(0);
  });

  it('returns 404 for unknown skills, technologies and routes', async () => {
    const api = testApi();
    expect(
      (await api.call('POST', '/api/skill-mastery/practice/next', { skillId: 'nope' })).status,
    ).toBe(404);
    expect((await api.call('GET', '/api/skill-mastery/progress?technologyId=nope')).status).toBe(
      404,
    );
    expect((await api.call('GET', '/api/skill-mastery/skills/nope/history')).status).toBe(404);
    expect((await api.call('DELETE', '/api/me')).status).toBe(404);
  });

  it('returns 409 when the served question has since changed version', async () => {
    const api = testApi();
    const { token } = await next(api);
    const stored = await api.store.getToken(token);
    await api.store.putToken({ ...stored!, questionVersion: 99 });
    const res = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: pickA,
    });
    expect(res.status).toBe(409);
  });

  it('hides unexpected errors behind a generic 500 and logs them', async () => {
    const store = new InMemoryProgressStore();
    store.getXp = () => Promise.reject(new Error('disk on fire'));
    const api = testApi({ store });
    const res = await api.call('GET', '/api/me');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('disk on fire');
    expect(api.errors).toHaveLength(1);
  });
});

describe('adaptive practice', () => {
  /** Answers the served question with its key (the fixture keys are known to the tests). */
  const answerServed = async (api: ReturnType<typeof testApi>, served: NextQuestionResponse) => {
    const key = api.content.findQuestion(served.question.id)!.grading.answer;
    const answer =
      key.format === 'multiple-choice'
        ? { format: key.format, selected: key.correct }
        : key.format === 'predict-output'
          ? { format: key.format, output: key.output }
          : key.format === 'fill-in-blank'
            ? {
                format: key.format,
                blanks: Object.fromEntries(
                  Object.entries(key.blanks).map(([k, b]) => [
                    k,
                    (b as { accepted: string[] }).accepted[0] ?? '',
                  ]),
                ),
              }
            : { format: 'sql-query' as const, query: 'SELECT 1' };
    return (
      await api.call('POST', '/api/skill-mastery/practice/answer', { token: served.token, answer })
    ).body as AnswerResponse;
  };

  it('moves up a tier after two first-time correct answers, and reports it', async () => {
    const api = testApi();
    const first = await answerServed(api, await next(api));
    expect(first).toMatchObject({ tierBefore: 1, tierAfter: 1, repeat: false });
    const second = await answerServed(api, await next(api));
    expect(second).toMatchObject({ tierBefore: 1, tierAfter: 2, skill: { tier: 2 } });
    expect((await next(api)).skill.tier).toBe(2);
  });

  it('serves every question before repeating, then marks repeats and gives them reduced credit', async () => {
    const api = testApi();
    const total = api.content.questions('demo-skill').length;
    const served: string[] = [];
    let last: AnswerResponse | undefined;
    for (let i = 0; i < total; i++) {
      const q = await next(api);
      expect(q.selection.reason, `answer ${i}`).toBe('new');
      served.push(q.question.id);
      last = await answerServed(api, q);
    }
    expect(new Set(served).size).toBe(total);
    expect(last?.repeat).toBe(false);
    const again = await next(api);
    expect(again.selection.reason).toBe('repeat');
    expect(again.selection.note).toContain('repeat');
    const repeated = await answerServed(api, again);
    expect(repeated.repeat).toBe(true);
  });
});

describe('concurrency', () => {
  it('recomputes and retries when another answer changed mastery first', async () => {
    const store = new InMemoryProgressStore();
    const original = store.recordAnswer.bind(store);
    let conflicts = 1;
    store.recordAnswer = (input: RecordAnswer) => {
      if (conflicts-- > 0) return Promise.resolve({ kind: 'conflict' });
      return original(input);
    };
    const api = testApi({ store });
    const { token } = await next(api);
    const res = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: pickA,
    });
    expect(res.status).toBe(200);
    expect((res.body as AnswerResponse).scoreAfter).toBe(6);
  });
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After once a user exceeds the limit', async () => {
    const api = testApi({ rateLimiter: new SlidingWindowRateLimiter(3, 60_000) });
    for (let i = 0; i < 3; i++) expect((await api.call('GET', '/api/me')).status).toBe(200);
    const limited = await api.call('GET', '/api/me');
    expect(limited.status).toBe(429);
    expect(limited.headers).toEqual({ 'retry-after': '60' });
    // Other users are unaffected.
    expect((await api.call('GET', '/api/me', undefined, 'bob')).status).toBe(200);
    api.advance(60_001);
    expect((await api.call('GET', '/api/me')).status).toBe(200);
  });
});

describe('local developer user', () => {
  it('must be explicitly allowed', () => {
    const store = new InMemoryProgressStore();
    const deps = {
      content: fixtureContent(),
      store,
      accounts: store.accounts,
      webStore: store.web,
      rateLimiter: new SlidingWindowRateLimiter(10, 1000),
      now: () => new Date(),
      random: Math.random,
      newId: () => 'id',
      auth: new LocalDevAuthenticator(),
    };
    expect(() => createApi(deps)).toThrow('requires allowLocalDevUser');
    expect(() => createApi({ ...deps, allowLocalDevUser: true })).not.toThrow();
  });
});

describe('SQL questions', () => {
  /** Fake engine: "SELECT name FROM items" returns the dataset's names; anything else fails. */
  const fakeEngine = {
    run: (req: { database: { dataSql: string }; query: string }) =>
      Promise.resolve(
        req.query.trim() === 'SELECT name FROM items'
          ? {
              kind: 'rows' as const,
              columns: [{ name: 'name', type: 'text' }],
              rows: [...req.database.dataSql.matchAll(/'([^']+)'/g)].map((m) => [m[1] ?? '']),
              truncated: false,
              durationMs: 1,
            }
          : { kind: 'error' as const, message: 'syntax error' },
      ),
    close: () => Promise.resolve(),
  };

  const sqlNext = async (api: ReturnType<typeof testApi>) => {
    const res = await api.call('POST', '/api/skill-mastery/practice/next', { skillId: 'demo-sql' });
    return res.body as NextQuestionResponse;
  };

  it('serves the schema and sample data, never the reference query or hidden data', async () => {
    const api = testApi({ sqlEngine: fakeEngine });
    const served = await sqlNext(api);
    expect(served.question).toMatchObject({
      format: 'sql-query',
      schema: 'CREATE TABLE items (name text);',
    });
    const json = JSON.stringify(served);
    expect(json).not.toContain('SELECT name FROM items');
    expect(json).not.toContain('Juice');
  });

  it('runs queries on the sample data without scoring', async () => {
    const api = testApi({ sqlEngine: fakeEngine });
    const { token } = await sqlNext(api);
    const run = await api.call('POST', '/api/skill-mastery/practice/run-sql', {
      token,
      query: 'SELECT name FROM items',
    });
    expect(run.body).toMatchObject({ kind: 'rows', table: { rows: [['Tea']] } });
    expect(((await api.call('GET', '/api/me')).body as MeResponse).xp).toBe(0);
  });

  it('grades a submitted query against every dataset', async () => {
    const api = testApi({ sqlEngine: fakeEngine });
    const { token } = await sqlNext(api);
    const res = await api.call('POST', '/api/skill-mastery/practice/answer', {
      token,
      answer: { format: 'sql-query', query: 'SELECT name FROM items' },
    });
    expect(res.body).toMatchObject({
      result: 'correct',
      correctAnswer: { format: 'sql-query', referenceQuery: 'SELECT name FROM items' },
    });
  });

  it('refuses run-sql for questions that are not SQL', async () => {
    const api = testApi({ sqlEngine: fakeEngine });
    const { token } = await next(api);
    const res = await api.call('POST', '/api/skill-mastery/practice/run-sql', {
      token,
      query: 'SELECT 1',
    });
    expect(res.status).toBe(400);
  });

  it('applies the stricter SQL rate limit to runs', async () => {
    const api = testApi({
      sqlEngine: fakeEngine,
      sqlRateLimiter: new SlidingWindowRateLimiter(2, 60_000),
    });
    const { token } = await sqlNext(api);
    const runSql = () =>
      api.call('POST', '/api/skill-mastery/practice/run-sql', {
        token,
        query: 'SELECT name FROM items',
      });
    expect((await runSql()).status).toBe(200);
    expect((await runSql()).status).toBe(200);
    expect((await runSql()).status).toBe(429);
    // Other requests still work.
    expect((await api.call('GET', '/api/me')).status).toBe(200);
  });

  it('returns 503 for SQL skills when the server has no SQL engine, and serves no question', async () => {
    const api = testApi();
    const res = await api.call('POST', '/api/skill-mastery/practice/next', { skillId: 'demo-sql' });
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toContain('SQL practice is not available here yet.');
    expect(await api.store.findOpenToken('alice', 'demo-sql')).toBeUndefined();
  });

  it('returns 503 for a SQL question served before the engine became unavailable', async () => {
    const withEngine = testApi({ sqlEngine: fakeEngine });
    const { token } = await sqlNext(withEngine);
    const without = testApi({ store: withEngine.store });
    const res = await without.call('POST', '/api/skill-mastery/practice/run-sql', {
      token,
      query: 'SELECT 1',
    });
    expect(res.status).toBe(503);
  });
});
