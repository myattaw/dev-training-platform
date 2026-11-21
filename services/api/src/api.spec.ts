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
    expect(served.skill).toEqual({ skillId: 'demo-skill', score: 0, mastered: false, attempts: 0 });
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
      scoreAfter: 9,
      xpAwarded: 10,
      masteredNow: false,
      correctAnswer: { format: 'multiple-choice', correct: ['a'] },
      explanation: [{ kind: 'paragraph', text: 'A is right.' }],
      skill: { skillId: 'demo-skill', score: 9, attempts: 1 },
    });

    const me = (await api.call('GET', '/api/me')).body as MeResponse;
    expect(me.xp).toBe(10);
    const progress = (await api.call('GET', '/api/skill-mastery/progress?technologyId=demo'))
      .body as ProgressResponse;
    expect(progress.skills).toEqual([
      expect.objectContaining({ skillId: 'demo-skill', score: 9, attempts: 1 }),
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
    expect(answer.scoreAfter).toBe(3); // 9 × 0.3 with two hints
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
    expect((res.body as AnswerResponse).scoreAfter).toBe(9);
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
    const deps = {
      content: fixtureContent(),
      store: new InMemoryProgressStore(),
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
