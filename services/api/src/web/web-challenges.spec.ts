import type {
  WebChallengeResponse,
  WebDraftResponse,
  WebHttpExchangeResponse,
  WebProjectResponse,
  WebRunResponse,
  WebSessionResponse,
  WebTimedSessionResponse,
  WebUsageResponse,
} from '@pracstack/api-contracts';
import { splitWebChallenge, type WebChallengeSource } from '@pracstack/content-model';
import { DockerWebRunner } from '@pracstack/web-runner';
import { WEB_CHALLENGES } from '@pracstack/content/web-challenges';
import { describe, expect, it } from 'vitest';
import { createContentSource, type WebChallengeWithGrading } from '../content/content-source';
import { testApi, type TestApi } from '../testing/fixtures';
import { parseWebHttpRequest } from './web-challenge-service';

/*
 * Web Development Challenges through the API. The first block needs no Docker
 * (access, validation, ownership, drafts, timed sessions, browse-only mode);
 * the second builds and runs real applications (needs Docker and
 * `npm run web-runners:build`; PRACSTACK_SKIP_DOCKER_TESTS=1 skips it).
 */
const employee = WEB_CHALLENGES[0]?.source as WebChallengeSource;
const proOnly: WebChallengeSource = {
  ...employee,
  challenge: { ...employee.challenge, id: 'pro-employee-api', access: 'pro' },
};
const toContent = (source: WebChallengeSource): WebChallengeWithGrading => {
  const { challenge, projects, grading } = splitWebChallenge(source);
  return { challenge, projects, grading };
};
const content = createContentSource(
  'test',
  [],
  {},
  [],
  undefined,
  [],
  undefined,
  [],
  [toContent(employee), toContent(proOnly)],
);

const reference = (framework: string): Record<string, string> =>
  employee.implementations.find((i) => i.framework === framework)?.reference ?? {};

const body = <T>(res: { status: number; body: unknown }, status = 200): T => {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  return res.body as T;
};

describe('web challenges API (no execution)', () => {
  const api = (): TestApi => testApi({ content });

  it('serves a challenge without hidden tests or references, and its starter project', async () => {
    const t = api();
    const detail = body<WebChallengeResponse>(
      await t.call('GET', '/api/web-challenges/employee-rest-api'),
    );
    expect(detail.executionAvailable).toBe(false);
    expect(detail.challenge.hiddenTestCategories.length).toBeGreaterThan(0);
    const text = JSON.stringify(detail);
    for (const hidden of employee.hiddenTests) expect(text).not.toContain(hidden.description);
    const project = body<WebProjectResponse>(
      await t.call('GET', '/api/web-challenges/employee-rest-api/frameworks/django/project'),
    );
    expect(project.project.files.filter((f) => f.editable).map((f) => f.path)).toEqual([
      'employees/serializers.py',
      'employees/views.py',
    ]);
    // The reference solution is never served.
    const views = project.project.files.find((f) => f.path === 'employees/views.py');
    expect(views?.content).not.toBe(reference('django')['employees/views.py']);
    expect(JSON.stringify(project)).not.toContain('IntegrityError');
  });

  it('enforces Pro access on the server for detail, project, drafts and runs', async () => {
    const t = api();
    expect((await t.call('GET', '/api/web-challenges/pro-employee-api')).status).toBe(403);
    expect(
      (await t.call('GET', '/api/web-challenges/pro-employee-api/frameworks/django/project'))
        .status,
    ).toBe(403);
    expect(
      (
        await t.call('PUT', '/api/me/web-drafts/pro-employee-api/django', {
          challengeVersion: 1,
          files: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.call('POST', '/api/web-challenges/pro-employee-api/runs', {
          framework: 'django',
          files: {},
          mode: 'submit',
        })
      ).status,
    ).toBe(403);
  });

  it('reports browse-only mode instead of running anything when no runner is configured', async () => {
    const t = api();
    const res = await t.call('POST', '/api/web-challenges/employee-rest-api/runs', {
      framework: 'django',
      files: {},
      mode: 'visible',
    });
    expect(res.status).toBe(503);
    expect(body<WebUsageResponse>(await t.call('GET', '/api/me/web-usage')).executionsUsed).toBe(0);
  });

  it('accepts only editable files, with safe paths and bounded sizes', async () => {
    const t = api();
    const draft = (files: unknown) =>
      t.call('PUT', '/api/me/web-drafts/employee-rest-api/django', { challengeVersion: 1, files });
    expect((await draft({ 'employees/models.py': 'x' })).status).toBe(400);
    expect((await draft({ '../etc/passwd': 'x' })).status).toBe(400);
    expect((await draft({ '/tmp/app/employees/views.py': 'x' })).status).toBe(400);
    expect((await draft({ 'employees/../config/settings.py': 'x' })).status).toBe(400);
    expect((await draft({ 'employees/views.py': 'x'.repeat(100_001) })).status).toBe(400);
    expect((await draft({ 'employees/views.py': 'a\u0000b' })).status).toBe(400);
    expect((await draft({ 'employees/views.py': 'print(1)' })).status).toBe(200);
    expect(
      (
        await t.call('PUT', '/api/me/web-drafts/employee-rest-api/rails', {
          challengeVersion: 1,
          files: {},
        })
      ).status,
    ).toBe(400);
  });

  it('keeps drafts per user and per framework', async () => {
    const t = api();
    await t.call('PUT', '/api/me/web-drafts/employee-rest-api/django', {
      challengeVersion: 1,
      files: { 'employees/views.py': 'alice django' },
    });
    await t.call('PUT', '/api/me/web-drafts/employee-rest-api/aspnetcore', {
      challengeVersion: 1,
      files: { 'Services/EmployeeService.cs': 'alice dotnet' },
    });
    const mine = body<WebDraftResponse>(
      await t.call('GET', '/api/me/web-drafts/employee-rest-api/django'),
    );
    expect(mine.draft?.files).toEqual({ 'employees/views.py': 'alice django' });
    const dotnet = body<WebDraftResponse>(
      await t.call('GET', '/api/me/web-drafts/employee-rest-api/aspnetcore'),
    );
    expect(dotnet.draft?.files).toEqual({ 'Services/EmployeeService.cs': 'alice dotnet' });
    const bobs = body<WebDraftResponse>(
      await t.call('GET', '/api/me/web-drafts/employee-rest-api/django', undefined, 'bob'),
    );
    expect(bobs.draft).toBeNull();
  });

  it('keeps a timed session deadline across reloads and refuses submissions after it', async () => {
    const t = api();
    const created = body<WebTimedSessionResponse>(
      await t.call('POST', '/api/web-timed-sessions', {
        challengeId: 'employee-rest-api',
        framework: 'django',
        durationMinutes: 30,
      }),
    );
    // Starting again (a reload, a second tab) resumes the same session and deadline.
    const again = body<WebTimedSessionResponse>(
      await t.call('POST', '/api/web-timed-sessions', {
        challengeId: 'employee-rest-api',
        framework: 'django',
        durationMinutes: 120,
      }),
    );
    expect(again.session.id).toBe(created.session.id);
    expect(again.session.deadline).toBe(created.session.deadline);
    // Bob cannot see it.
    expect(
      (await t.call('GET', `/api/web-timed-sessions/${created.session.id}`, undefined, 'bob'))
        .status,
    ).toBe(404);
    t.advance(31 * 60_000);
    const expired = body<WebTimedSessionResponse>(
      await t.call('GET', `/api/web-timed-sessions/${created.session.id}`),
    );
    expect(expired.session.status).toBe('expired');
    const late = await t.call('POST', '/api/web-challenges/employee-rest-api/runs', {
      framework: 'django',
      files: {},
      mode: 'submit',
      timedSessionId: created.session.id,
    });
    expect(late.status).toBe(409);
  });

  it('validates HTTP-client requests: relative paths, approved headers, bounded bodies', () => {
    expect(parseWebHttpRequest({ method: 'GET', path: '/api/employees?page=2' }).path).toBe(
      '/api/employees?page=2',
    );
    const bad = [
      { method: 'GET', path: 'http://169.254.169.254/latest/meta-data/' },
      { method: 'GET', path: '//evil.example/x' },
      { method: 'GET', path: 'api/employees' },
      { method: 'GET', path: '/api/\\..\\x' },
      { method: 'GET', path: '/api/x\r\nHost: evil' },
      { method: 'CONNECT', path: '/' },
      { method: 'TRACE', path: '/' },
      { method: 'GET', path: '/', headers: { Host: 'evil.example' } },
      { method: 'GET', path: '/', headers: { 'X-Forwarded-For': 'a\r\nb' } },
      { method: 'GET', path: '/', headers: { Cookie: 'session=1' } },
      { method: 'POST', path: '/', body: 'x'.repeat(70_000) },
    ];
    for (const request of bad)
      expect(() => parseWebHttpRequest(request), JSON.stringify(request)).toThrow();
    expect(
      parseWebHttpRequest({
        method: 'POST',
        path: '/api/x',
        headers: { Authorization: 'Bearer test-admin' },
        body: '{}',
      }).headers,
    ).toEqual({
      Authorization: 'Bearer test-admin',
    });
  });

  it('does not reveal other users’ runs or sessions', async () => {
    const t = api();
    const id = '6b0f1d2e-8c1f-4a33-9a51-2ef1f1f1f1f1';
    expect((await t.call('GET', `/api/web-runs/${id}`)).status).toBe(404);
    expect((await t.call('GET', `/api/web-sessions/${id}`)).status).toBe(404);
    expect(
      (await t.call('POST', `/api/web-sessions/${id}/requests`, { method: 'GET', path: '/' }))
        .status,
    ).toBe(404);
  });
});

const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

describe.skipIf(skip)('web challenges API (real framework runners)', { timeout: 600_000 }, () => {
  const runner = new DockerWebRunner({ maxConcurrent: 2, maxQueue: 20 });

  async function waitForRun(t: TestApi, id: string, user: 'alice' | 'bob' = 'alice') {
    for (let i = 0; i < 600; i++) {
      const res = body<WebRunResponse>(await t.call('GET', `/api/web-runs/${id}`, undefined, user));
      if (res.run.status === 'completed') return res.run;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('run did not finish');
  }

  it('grades a reference submission as accepted, records progress, and hides it from others', async () => {
    const status = await runner.check(['django']);
    if (!status.ok)
      throw new Error(`${status.message} (set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip)`);
    const t = testApi({ content, webRunner: runner });
    const created = body<WebRunResponse>(
      await t.call('POST', '/api/web-challenges/employee-rest-api/runs', {
        framework: 'django',
        files: reference('django'),
        mode: 'submit',
      }),
    );
    expect((await t.call('GET', `/api/web-runs/${created.run.id}`, undefined, 'bob')).status).toBe(
      404,
    );
    const run = await waitForRun(t, created.run.id);
    expect(run.result?.verdict, JSON.stringify(run.result)).toBe('accepted');
    expect(run.result?.hidden.every((h) => h.passed)).toBe(true);
    // Hidden tests reveal categories only, and submissions return no application output.
    expect(JSON.stringify(run.result?.hidden)).not.toContain('Katherine');
    expect(run.result?.logs).toEqual([]);
    expect(run.progress).toMatchObject({ solved: true, frameworksSolved: ['django'] });
  });

  it('reports compilation errors with file and line, and test failures for the starter', async () => {
    const t = testApi({ content, webRunner: runner });
    const broken = body<WebRunResponse>(
      await t.call('POST', '/api/web-challenges/employee-rest-api/runs', {
        framework: 'django',
        files: { 'employees/views.py': 'def broken(:\n' },
        mode: 'visible',
      }),
    );
    const failed = await waitForRun(t, broken.run.id);
    expect(failed.result?.verdict).toBe('compilation-error');
    expect(failed.result?.diagnostics[0]).toMatchObject({ file: 'employees/views.py', line: 1 });
    const starter = body<WebRunResponse>(
      await t.call('POST', '/api/web-challenges/employee-rest-api/runs', {
        framework: 'django',
        files: {},
        mode: 'visible',
      }),
    );
    const result = (await waitForRun(t, starter.run.id)).result;
    expect(result?.verdict).toBe('tests-failed');
    expect(result?.visible.some((v) => !v.passed)).toBe(true);
    expect(result?.hidden).toEqual([]);
  });

  it('runs an application for the HTTP client, only for its owner, then stops it', async () => {
    const t = testApi({ content, webRunner: runner });
    const session = body<WebSessionResponse>(
      await t.call('POST', '/api/web-sessions', {
        challengeId: 'employee-rest-api',
        framework: 'django',
        files: reference('django'),
      }),
    ).session;
    let state = session.state;
    for (let i = 0; i < 120 && state !== 'ready'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      state = body<WebSessionResponse>(await t.call('GET', `/api/web-sessions/${session.id}`))
        .session.state;
      expect(['queued', 'building', 'starting', 'ready']).toContain(state);
    }
    const exchange = body<WebHttpExchangeResponse>(
      await t.call('POST', `/api/web-sessions/${session.id}/requests`, {
        method: 'GET',
        path: '/api/employees/1',
      }),
    );
    expect(exchange.response.status).toBe(200);
    expect(JSON.parse(exchange.response.body)).toMatchObject({ name: 'Ada Lovelace' });
    // Bob can neither read nor use Alice's application.
    expect((await t.call('GET', `/api/web-sessions/${session.id}`, undefined, 'bob')).status).toBe(
      404,
    );
    expect(
      (
        await t.call(
          'POST',
          `/api/web-sessions/${session.id}/requests`,
          { method: 'GET', path: '/' },
          'bob',
        )
      ).status,
    ).toBe(404);
    const stopped = body<WebSessionResponse>(
      await t.call('DELETE', `/api/web-sessions/${session.id}`),
    );
    expect(stopped.session.state).toBe('stopped');
    expect(
      (
        await t.call('POST', `/api/web-sessions/${session.id}/requests`, {
          method: 'GET',
          path: '/',
        })
      ).status,
    ).toBe(409);
  });

  it('enforces one running application per user and the daily quota', async () => {
    const t = testApi({
      content,
      webRunner: runner,
      webPolicy: {
        executionsPerDay: { free: 2, pro: 10 },
        concurrentPerUser: 1,
        sessionLifetimeMs: 60_000,
        sessionIdleMs: 60_000,
        sessionRequestLimit: 5,
      },
    });
    const start = () =>
      t.call('POST', '/api/web-challenges/employee-rest-api/runs', {
        framework: 'django',
        files: {},
        mode: 'visible',
      });
    const first = body<WebRunResponse>(await start());
    expect((await start()).status).toBe(409);
    await waitForRun(t, first.run.id);
    const second = body<WebRunResponse>(await start());
    await waitForRun(t, second.run.id);
    expect((await start()).status).toBe(429);
    expect(body<WebUsageResponse>(await t.call('GET', '/api/me/web-usage')).executionsUsed).toBe(2);
  });
});
