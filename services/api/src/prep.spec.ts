import type {
  AccountProgressResponse,
  ApiErrorBody,
  CompanyDetailResponse,
  CompanyListResponse,
  EntitlementsResponse,
  InterviewSessionResponse,
  InterviewSubmitResponse,
  MeResponse,
  ProgressImportResponse,
  RecommendationsResponse,
  SavedCompaniesResponse,
} from '@pracstack/api-contracts';
import { describe, expect, it } from 'vitest';
import { createApi } from './app';
import { type Caller, LocalDevAuthenticator } from './auth';
import type { Authenticator } from './auth';
import { companyContent, DoubleRunner } from './testing/company-fixtures';
import { testApi } from './testing/fixtures';
import { SlidingWindowRateLimiter } from './rate-limit';
import { InMemoryProgressStore } from './store/memory-store';

const setup = (overrides: Parameters<typeof testApi>[0] = {}) =>
  testApi({ content: companyContent(), codeRunner: new DoubleRunner(), ...overrides });

const errorCode = (body: unknown) => (body as ApiErrorBody).error.code;

describe('company catalog', () => {
  it('searches case-insensitively by name and alias, with counts', async () => {
    const api = setup();
    const byName = (await api.call('GET', '/api/companies?q=LIBERTY')).body as CompanyListResponse;
    expect(byName.total).toBe(1);
    expect(byName.companies[0]).toMatchObject({
      slug: 'liberty-mutual',
      displayName: 'Liberty Mutual',
      questionCount: 1,
      saved: false,
    });
    const byAlias = (await api.call('GET', '/api/companies?q=mutual%20insurance'))
      .body as CompanyListResponse;
    expect(byAlias.companies.map((c) => c.slug)).toEqual(['liberty-mutual']);
    const none = (await api.call('GET', '/api/companies?q=zzz')).body as CompanyListResponse;
    expect(none).toMatchObject({ total: 0, companies: [] });
  });

  it('pages alphabetically and filters by first letter', async () => {
    const api = setup();
    const first = (await api.call('GET', '/api/companies')).body as CompanyListResponse;
    expect(first.total).toBe(32);
    expect(first.companies).toHaveLength(25);
    expect(first.companies[0]?.displayName).toBe('3M');
    expect(first.letters).toEqual(['#', 'A', 'L']);
    const second = (await api.call('GET', '/api/companies?page=2')).body as CompanyListResponse;
    expect(second.companies).toHaveLength(7);
    const l = (await api.call('GET', '/api/companies?letter=L')).body as CompanyListResponse;
    expect(l.companies.map((c) => c.slug)).toEqual(['liberty-mutual']);
  });

  it('validates the query', async () => {
    const api = setup();
    for (const q of ['page=0', 'page=x', 'letter=ab', `q=${'a'.repeat(101)}`]) {
      expect((await api.call('GET', `/api/companies?${q}`)).status, q).toBe(400);
    }
  });

  it('shows Liberty Mutual with Design a Text Editor as a reported, external question', async () => {
    const api = setup();
    const res = await api.call('GET', '/api/companies/liberty-mutual');
    expect(res.status).toBe(200);
    const detail = res.body as CompanyDetailResponse;
    expect(detail.questions).toEqual([
      {
        id: 'lc-companywise:2296',
        title: 'Design a Text Editor',
        difficulty: 'hard',
        provider: 'LeetCode',
        externalId: '2296',
        externalUrl: 'https://leetcode.com/problems/design-a-text-editor',
        sourceId: 'lc-companywise',
        acceptanceRate: 51.1,
        windows: [
          { window: 'all', reportedFrequency: 100 },
          { window: 'more-than-six-months', reportedFrequency: 100 },
        ],
        relatedChallenges: [{ id: 'double', title: 'Double' }],
        status: 'not-started',
      },
    ]);
    expect(detail.sources[0]).toMatchObject({
      licenseStatus: 'unverified',
      snapshotDate: '2026-07-12',
    });
    expect(detail.progress).toMatchObject({
      status: 'not-started',
      questionsTotal: 1,
      practiceTotal: 1,
    });
    expect(detail.preparationPaths[0]?.steps.map((s) => s.done)).toEqual([false, false]);
  });

  it('returns 404 for unknown companies and 400 for invalid slugs', async () => {
    const api = setup();
    expect((await api.call('GET', '/api/companies/nope')).status).toBe(404);
    expect((await api.call('GET', '/api/companies/..%2Fetc')).status).toBe(400);
    expect((await api.call('GET', '/api/companies/nope/recommendations')).status).toBe(404);
  });

  it('serves the question list on its own', async () => {
    const api = setup();
    const res = await api.call('GET', '/api/companies/liberty-mutual/questions');
    expect((res.body as { questions: unknown[] }).questions).toHaveLength(1);
  });
});

describe('premium recommendations and entitlements', () => {
  it('locks Pro recommendations for FREE users, whatever the request says', async () => {
    const api = setup();
    const res = await api.call('GET', '/api/companies/liberty-mutual/recommendations?plan=pro');
    const body = res.body as RecommendationsResponse;
    expect(body.plan).toBe('free');
    expect(
      body.recommendations.map((r) => [r.challengeId, r.access, r.availability, r.locked]),
    ).toEqual([
      ['double', 'free', 'available', false],
      ['premium-editor', 'pro', 'coming-soon', true],
    ]);
    expect(body.recommendations[0]).toMatchObject({
      reason: 'Practices arithmetic.',
      competencies: ['arithmetic'],
      relatedQuestion: { id: 'lc-companywise:2296', title: 'Design a Text Editor' },
      solved: false,
    });
  });

  it('defaults to FREE with no billing', async () => {
    const api = setup();
    const res = await api.call('GET', '/api/me/entitlements');
    expect(res.body).toEqual({
      plan: 'free',
      source: 'default',
      features: [],
      billing: { available: false },
    } satisfies EntitlementsResponse);
  });

  it('unlocks for an active PRO grant, and not for an expired one', async () => {
    const api = setup();
    await api.store.accounts.putEntitlement({
      userId: 'alice',
      plan: 'pro',
      source: 'manual-grant',
      grantedAt: '2026-11-01T00:00:00Z',
      expiresAt: '2026-12-01T00:00:00Z',
    });
    const pro = (await api.call('GET', '/api/companies/liberty-mutual/recommendations'))
      .body as RecommendationsResponse;
    expect(pro.plan).toBe('pro');
    expect(pro.recommendations.every((r) => !r.locked)).toBe(true);
    expect(
      ((await api.call('GET', '/api/me/entitlements')).body as EntitlementsResponse).source,
    ).toBe('manual-grant');
    // Bob is unaffected.
    const bob = (
      await api.call('GET', '/api/companies/liberty-mutual/recommendations', undefined, 'bob')
    ).body as RecommendationsResponse;
    expect(bob.plan).toBe('free');

    api.advance(15 * 24 * 60 * 60 * 1000); // past expiresAt
    const expired = (await api.call('GET', '/api/me/entitlements')).body as EntitlementsResponse;
    expect(expired.plan).toBe('free');
  });

  it('grants ADMIN only from verified groups', async () => {
    const admin: Authenticator = {
      kind: 'jwt',
      authenticate: () =>
        Promise.resolve({
          id: 'root',
          displayName: 'Root',
          mode: 'authenticated',
          groups: ['admins'],
        }),
    };
    const api = setup({ auth: admin });
    const body = (await api.call('GET', '/api/me/entitlements')).body as EntitlementsResponse;
    expect(body).toMatchObject({ plan: 'admin', source: 'identity-group' });
    expect(body.features).toContain('premium-recommendations');
  });

  it('allows a local plan override only for the local developer', () => {
    const store = new InMemoryProgressStore();
    const deps = {
      content: companyContent(),
      store,
      accounts: store.accounts,
      rateLimiter: new SlidingWindowRateLimiter(10, 1000),
      now: () => new Date(),
      random: Math.random,
      newId: () => 'id',
      localPlanOverride: 'pro' as const,
    };
    expect(() =>
      createApi({
        ...deps,
        auth: { kind: 'jwt', authenticate: () => Promise.reject(new Error()) },
      }),
    ).toThrow('local developer');
    expect(() =>
      createApi({ ...deps, auth: new LocalDevAuthenticator(), allowLocalDevUser: true }),
    ).not.toThrow();
  });
});

describe('company preparation progress', () => {
  it('saves and unsaves companies', async () => {
    const api = setup();
    expect((await api.call('POST', '/api/me/companies/liberty-mutual/save')).body).toEqual({
      saved: true,
    });
    expect((await api.call('POST', '/api/me/companies/liberty-mutual/save')).status).toBe(200);
    const saved = (await api.call('GET', '/api/me/companies')).body as SavedCompaniesResponse;
    expect(saved.companies.map((c) => c.slug)).toEqual(['liberty-mutual']);
    const list = (await api.call('GET', '/api/companies?q=liberty')).body as CompanyListResponse;
    expect(list.companies[0]?.saved).toBe(true);
    expect((await api.call('DELETE', '/api/me/companies/liberty-mutual/save')).body).toEqual({
      saved: false,
    });
    expect(
      ((await api.call('GET', '/api/me/companies')).body as SavedCompaniesResponse).companies,
    ).toEqual([]);
    expect((await api.call('POST', '/api/me/companies/nope/save')).status).toBe(404);
  });

  it('records the learner’s own marks on external questions, separately from PracStack practice', async () => {
    const api = setup();
    const mark = (status: string, id = 'lc-companywise%3A2296') =>
      api.call('PUT', `/api/me/companies/liberty-mutual/questions/${id}`, { status });
    expect((await mark('reviewed-externally')).status).toBe(200);
    let detail = (await api.call('GET', '/api/companies/liberty-mutual'))
      .body as CompanyDetailResponse;
    expect(detail.questions[0]?.status).toBe('reviewed-externally');
    expect(detail.progress).toMatchObject({
      status: 'in-progress',
      questionsReviewed: 1,
      questionsSolvedExternally: 0,
      practiceSolved: 0,
    });
    await mark('not-started');
    detail = (await api.call('GET', '/api/companies/liberty-mutual')).body as CompanyDetailResponse;
    expect(detail.questions[0]?.status).toBe('not-started');
    expect((await mark('done')).status).toBe(400);
    expect((await mark('reviewed-externally', 'lc-companywise%3A1')).status).toBe(404);
    expect((await mark('reviewed-externally', 'not-an-id')).status).toBe(400);
  });

  it('counts a recommended challenge only when a server-graded submission solves it', async () => {
    const api = setup();
    await api.call('POST', '/api/challenges/double/submissions', {
      language: 'typescript',
      code: 'wrong',
    });
    let detail = (await api.call('GET', '/api/companies/liberty-mutual'))
      .body as CompanyDetailResponse;
    expect(detail.progress.practiceSolved).toBe(0);
    await api.call('POST', '/api/challenges/double/submissions', {
      language: 'typescript',
      code: 'correct',
    });
    detail = (await api.call('GET', '/api/companies/liberty-mutual')).body as CompanyDetailResponse;
    expect(detail.progress.practiceSolved).toBe(1);
    expect(detail.preparationPaths[0]?.steps[0]?.done).toBe(true);
    const recs = (await api.call('GET', '/api/companies/liberty-mutual/recommendations'))
      .body as RecommendationsResponse;
    expect(recs.recommendations[0]?.solved).toBe(true);
  });
});

describe('timed interview sessions', () => {
  const create = (
    api: ReturnType<typeof setup>,
    over: Record<string, unknown> = {},
    user?: 'bob',
  ) =>
    api.call(
      'POST',
      '/api/interview-sessions',
      {
        companySlug: 'liberty-mutual',
        challengeId: 'double',
        durationMinutes: 45,
        language: 'typescript',
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        ...over,
      },
      user,
    );

  it('sets the deadline on the server and ignores client-supplied times', async () => {
    const api = setup();
    const res = await create(api, {
      deadline: '2099-01-01T00:00:00Z',
      startedAt: '2000-01-01T00:00:00Z',
    });
    expect(res.status).toBe(200);
    const { session, serverTime } = res.body as InterviewSessionResponse;
    expect(session).toMatchObject({
      companySlug: 'liberty-mutual',
      companyName: 'Liberty Mutual',
      challengeTitle: 'Double',
      status: 'active',
      startedAt: '2026-11-21T12:00:00.000Z',
      deadline: '2026-11-21T12:45:00.000Z',
      submissions: 0,
    });
    expect(serverTime).toBe('2026-11-21T12:00:00.000Z');
  });

  it('is idempotent per client request id, and refuses a second running session', async () => {
    const api = setup();
    const a = (await create(api)).body as InterviewSessionResponse;
    api.advance(60_000);
    const again = (await create(api)).body as InterviewSessionResponse;
    expect(again.session.id).toBe(a.session.id);
    expect(again.session.deadline).toBe(a.session.deadline);
    const other = await create(api, { clientRequestId: '22222222-2222-4222-8222-222222222222' });
    expect(other.status).toBe(409);
  });

  it('grades submissions before the deadline and refuses them after', async () => {
    const api = setup();
    const { session } = (await create(api)).body as InterviewSessionResponse;
    const submit = (code: string) =>
      api.call('POST', `/api/interview-sessions/${session.id}/submit`, {
        language: 'typescript',
        code,
      });

    const wrong = (await submit('wrong')).body as InterviewSubmitResponse;
    expect(wrong.session.best).toMatchObject({ status: 'failed', visiblePassed: 0 });
    const right = (await submit('correct')).body as InterviewSubmitResponse;
    expect(right.submission.submission.status).toBe('accepted');
    expect(right.session).toMatchObject({
      submissions: 2,
      best: { status: 'accepted', hiddenPassed: 1 },
    });
    // A worse later attempt does not replace the best one.
    const worse = (await submit('wrong')).body as InterviewSubmitResponse;
    expect(worse.session.best?.status).toBe('accepted');

    api.advance(45 * 60_000);
    const late = await submit('correct');
    expect(late.status).toBe(409);
    expect(errorCode(late.body)).toBe('session-expired');
    const after = (await api.call('GET', `/api/interview-sessions/${session.id}`))
      .body as InterviewSessionResponse;
    expect(after.session).toMatchObject({
      status: 'expired',
      timeUsedSeconds: 2700,
      finishedAt: session.deadline,
    });
  });

  it('keeps every concurrent submission', async () => {
    const api = setup();
    const { session } = (await create(api)).body as InterviewSessionResponse;
    await Promise.all(
      ['wrong', 'correct', 'wrong'].map((code) =>
        api.call('POST', `/api/interview-sessions/${session.id}/submit`, {
          language: 'typescript',
          code,
        }),
      ),
    );
    const after = (await api.call('GET', `/api/interview-sessions/${session.id}`))
      .body as InterviewSessionResponse;
    expect(after.session.submissions).toBe(3);
    expect(after.session.best?.status).toBe('accepted');
  });

  it('finishes once, with the time used computed on the server', async () => {
    const api = setup();
    const { session } = (await create(api)).body as InterviewSessionResponse;
    api.advance(10 * 60_000);
    const done = (
      await api.call('POST', `/api/interview-sessions/${session.id}/finish`, {
        outcome: 'completed',
      })
    ).body as InterviewSessionResponse;
    expect(done.session).toMatchObject({ status: 'completed', timeUsedSeconds: 600 });
    api.advance(60_000);
    const again = (
      await api.call('POST', `/api/interview-sessions/${session.id}/finish`, {
        outcome: 'abandoned',
      })
    ).body as InterviewSessionResponse;
    expect(again.session).toMatchObject({ status: 'completed', timeUsedSeconds: 600 });
    const submit = await api.call('POST', `/api/interview-sessions/${session.id}/submit`, {
      language: 'typescript',
      code: 'correct',
    });
    expect(errorCode(submit.body)).toBe('conflict');
    const detail = (await api.call('GET', '/api/companies/liberty-mutual'))
      .body as CompanyDetailResponse;
    expect(detail.progress.timedSessionsCompleted).toBe(1);
    expect(detail.preparationPaths[0]?.steps[1]?.done).toBe(true);
  });

  it('marks a finish after the deadline as expired', async () => {
    const api = setup();
    const { session } = (await create(api, { durationMinutes: 30 }))
      .body as InterviewSessionResponse;
    api.advance(31 * 60_000);
    const res = (
      await api.call('POST', `/api/interview-sessions/${session.id}/finish`, {
        outcome: 'completed',
      })
    ).body as InterviewSessionResponse;
    expect(res.session).toMatchObject({ status: 'expired', timeUsedSeconds: 1800 });
  });

  it('keeps sessions private and validates input', async () => {
    const api = setup();
    const { session } = (await create(api)).body as InterviewSessionResponse;
    expect(
      (await api.call('GET', `/api/interview-sessions/${session.id}`, undefined, 'bob')).status,
    ).toBe(404);
    expect((await create(api, { durationMinutes: 50 })).status).toBe(400);
    expect((await create(api, { clientRequestId: 'x' })).status).toBe(400);
    expect(
      (
        await create(api, {
          challengeId: 'premium-editor',
          clientRequestId: '33333333-3333-4333-8333-333333333333',
        })
      ).status,
    ).toBe(409);
    expect((await create(api, { companySlug: 'nope' })).status).toBe(404);
    expect((await api.call('GET', '/api/interview-sessions/not-a-uuid')).status).toBe(400);
    const list = (await api.call('GET', '/api/interview-sessions?companySlug=liberty-mutual'))
      .body as {
      sessions: unknown[];
    };
    expect(list.sessions).toHaveLength(1);
  });
});

describe('profile and progress import', () => {
  it('updates the display name, sanitized and limited', async () => {
    const api = setup();
    const res = await api.call('PATCH', '/api/me', { displayName: '  Ada\u0007  Lovelace ' });
    expect((res.body as MeResponse).user.displayName).toBe('Ada Lovelace');
    expect(((await api.call('GET', '/api/me')).body as MeResponse).user.displayName).toBe(
      'Ada Lovelace',
    );
    expect((await api.call('PATCH', '/api/me', { displayName: 'x'.repeat(61) })).status).toBe(400);
    expect((await api.call('PATCH', '/api/me', { displayName: '   ' })).status).toBe(400);
  });

  it('cannot change the plan or XP through the profile', async () => {
    const api = setup();
    await api.call('PATCH', '/api/me', { displayName: 'Eve', plan: 'admin', xp: 99999 });
    const me = (await api.call('GET', '/api/me')).body as MeResponse;
    expect(me.xp).toBe(0);
    expect(
      ((await api.call('GET', '/api/me/entitlements')).body as EntitlementsResponse).plan,
    ).toBe('free');
  });

  const draft = (code: string, updatedAt = '2026-11-20T10:00:00.000Z') => ({
    challengeId: 'double',
    language: 'typescript',
    code,
    updatedAt,
  });
  const ids = [
    'a1111111-1111-4111-8111-111111111111',
    'b2222222-2222-4222-8222-222222222222',
    'c3333333-3333-4333-8333-333333333333',
    'd4444444-4444-4444-8444-444444444444',
  ];

  it('imports drafts idempotently and reports conflicts instead of overwriting', async () => {
    const api = setup();
    const first = (
      await api.call('POST', '/api/me/progress/import', { importId: ids[0], drafts: [draft('v1')] })
    ).body as ProgressImportResponse;
    expect(first).toMatchObject({ imported: 1, unchanged: 0, conflicts: [], replayed: false });

    const replay = (
      await api.call('POST', '/api/me/progress/import', {
        importId: ids[0],
        drafts: [draft('other')],
      })
    ).body as ProgressImportResponse;
    expect(replay).toMatchObject({ imported: 1, replayed: true });

    const same = (
      await api.call('POST', '/api/me/progress/import', { importId: ids[1], drafts: [draft('v1')] })
    ).body as ProgressImportResponse;
    expect(same).toMatchObject({ imported: 0, unchanged: 1 });

    const different = (
      await api.call('POST', '/api/me/progress/import', {
        importId: ids[2],
        drafts: [draft('v2', '2026-11-01T00:00:00Z'), { ...draft('x'), challengeId: 'gone' }],
      })
    ).body as ProgressImportResponse;
    expect(different.imported).toBe(0);
    expect(different.conflicts.map((c) => c.reason)).toEqual([
      'Your account has a newer, different draft.',
      'This challenge or language no longer exists.',
    ]);
    expect(
      ((await api.call('GET', '/api/me/drafts/double/typescript')).body as { code: string }).code,
    ).toBe('v1');

    const overwrite = (
      await api.call('POST', '/api/me/progress/import', {
        importId: ids[3],
        drafts: [draft('v2')],
        overwrite: ['double:typescript'],
      })
    ).body as ProgressImportResponse;
    expect(overwrite.imported).toBe(1);
    expect(
      ((await api.call('GET', '/api/me/drafts/double/typescript')).body as { code: string }).code,
    ).toBe('v2');
    expect(
      (await api.call('GET', '/api/me/drafts/double/typescript', undefined, 'bob')).status,
    ).toBe(404);
  });

  it('never turns browser results into solved challenges', async () => {
    const api = setup();
    await api.call('POST', '/api/me/progress/import', {
      importId: ids[0],
      drafts: [draft('v1')],
      solved: ['double'],
    });
    const progress = (await api.call('GET', '/api/me/progress')).body as AccountProgressResponse;
    expect(progress.challenges).toEqual([]);
    expect(progress.drafts).toEqual([
      {
        challengeId: 'double',
        language: 'typescript',
        updatedAt: '2026-11-20T10:00:00.000Z',
        length: 2,
      },
    ]);
  });

  it('validates imports', async () => {
    const api = setup();
    for (const body of [
      { importId: 'nope', drafts: [] },
      { importId: ids[0], drafts: [{ ...draft('x'), language: 'cobol' }] },
      { importId: ids[0], drafts: [{ ...draft('x'), updatedAt: 'yesterday' }] },
      { importId: ids[0], drafts: [draft('x')], overwrite: ['../etc'] },
      { importId: ids[0], drafts: Array.from({ length: 101 }, () => draft('x')) },
    ]) {
      expect((await api.call('POST', '/api/me/progress/import', body)).status).toBe(400);
    }
  });
});

describe('identities and account linking', () => {
  /** Signs in as `x-test-user` at provider `x-test-provider` (test-only). */
  const providerAuth: Authenticator = {
    kind: 'jwt',
    authenticate: (req) => {
      const subject = req.headers['x-test-user'] ?? 'alice';
      const provider = req.headers['x-test-provider'] ?? 'https://cognito-idp.test/pool';
      const method = req.headers['x-test-method'];
      return Promise.resolve({
        id: subject,
        displayName: subject,
        mode: 'authenticated',
        provider,
        subject,
        ...(method ? { method } : {}),
      } satisfies Caller);
    },
  };

  function linkingApi() {
    const api = setup({ auth: providerAuth });
    const as = (method: string, path: string, body: unknown, subject: string, provider?: string) =>
      createCall(api, method, path, body, subject, provider);
    return { api, as };
  }

  function createCall(
    api: ReturnType<typeof setup>,
    method: string,
    path: string,
    body: unknown,
    subject: string,
    provider?: string,
  ) {
    // testApi only sets x-test-user; reach the handler directly for the provider header.
    return api.callWithHeaders(method, path, body, {
      'x-test-user': subject,
      ...(provider ? { 'x-test-provider': provider } : {}),
    });
  }

  it('maps each identity to a stable internal user id', async () => {
    const { as } = linkingApi();
    const me = (await as('GET', '/api/me', undefined, 'sub-1')).body as MeResponse;
    expect(me.user.id).toBe('sub-1');
    const identities = (await as('GET', '/api/me/identities', undefined, 'sub-1')).body as {
      identities: { provider: string }[];
    };
    expect(identities.identities.map((i) => i.provider)).toEqual(['Email and password']);
  });

  it('links a second sign-in method with a single-use token, never by email', async () => {
    const { as } = linkingApi();
    await as('PATCH', '/api/me', { displayName: 'Alice' }, 'alice');
    const intent = (await as('POST', '/api/me/identities/link-intents', undefined, 'alice'))
      .body as {
      token: string;
    };
    const linked = await as(
      'POST',
      '/api/me/identities/link',
      { token: intent.token },
      'gh-42',
      'github',
    );
    expect(linked.body).toEqual({ userId: 'alice' });
    const me = (await as('GET', '/api/me', undefined, 'gh-42', 'github')).body as MeResponse;
    expect(me.user).toMatchObject({ id: 'alice', displayName: 'Alice' });
    // Single use.
    const reused = await as(
      'POST',
      '/api/me/identities/link',
      { token: intent.token },
      'gh-43',
      'github',
    );
    expect(reused.status).toBe(400);
  });

  it('lists linked sign-in methods by how they sign in (GitHub, email and password)', async () => {
    const { api, as } = linkingApi();
    const intent = (await as('POST', '/api/me/identities/link-intents', undefined, 'alice'))
      .body as { token: string };
    const linked = await api.callWithHeaders(
      'POST',
      '/api/me/identities/link',
      { token: intent.token },
      { 'x-test-user': 'gh-sub-9', 'x-test-method': 'GitHub' },
    );
    expect(linked.body).toEqual({ userId: 'alice' });
    const list = (await as('GET', '/api/me/identities', undefined, 'alice')).body as {
      identities: { provider: string }[];
    };
    expect(list.identities.map((i) => i.provider).sort()).toEqual(['Email and password', 'GitHub']);
  });

  it('refuses to link an identity that already has its own progress', async () => {
    const { as } = linkingApi();
    await as('POST', '/api/me/companies/liberty-mutual/save', undefined, 'gh-7', 'github');
    const intent = (await as('POST', '/api/me/identities/link-intents', undefined, 'alice'))
      .body as {
      token: string;
    };
    const res = await as(
      'POST',
      '/api/me/identities/link',
      { token: intent.token },
      'gh-7',
      'github',
    );
    expect(res.status).toBe(409);
    const me = (await as('GET', '/api/me', undefined, 'gh-7', 'github')).body as MeResponse;
    expect(me.user.id).toBe('gh-7');
  });

  it('expires link tokens', async () => {
    const { api, as } = linkingApi();
    const intent = (await as('POST', '/api/me/identities/link-intents', undefined, 'alice'))
      .body as {
      token: string;
    };
    api.advance(11 * 60_000);
    expect(
      (await as('POST', '/api/me/identities/link', { token: intent.token }, 'gh-9', 'github'))
        .status,
    ).toBe(400);
  });
});
