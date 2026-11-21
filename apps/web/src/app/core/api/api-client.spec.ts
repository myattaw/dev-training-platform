import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../config/runtime-config';
import { ApiClientError, FetchApiClient } from './api-client';

const DOMAIN = 'https://pracstack-test.auth.us-east-2.amazoncognito.com';

function setup(mode: 'local' | 'cognito', tokens?: { idToken: string; expiresAt: number }) {
  if (tokens) sessionStorage.setItem('pracstack:auth:tokens', JSON.stringify(tokens));
  TestBed.configureTestingModule({ providers: [FetchApiClient] });
  TestBed.inject(RuntimeConfigService).set(
    mode === 'local'
      ? { auth: { mode: 'local' } }
      : { auth: { mode: 'cognito', domain: DOMAIN, clientId: 'c' } },
  );
  return TestBed.inject(FetchApiClient);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('FetchApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const authHeader = () =>
    ((fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<string, string>)[
      'authorization'
    ];

  it('sends no credentials in local mode', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await setup('local').get('/me');
    expect(authHeader()).toBeUndefined();
  });

  it('sends the ID token as a bearer token when signed in', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await setup('cognito', { idToken: 'tok', expiresAt: Date.now() + 3_600_000 }).get('/me');
    expect(authHeader()).toBe('Bearer tok');
  });

  it('does not call the API when signed out', async () => {
    await expect(setup('cognito').get('/me')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps API Gateway's own 401 to 'unauthorized' and forgets the rejected token", async () => {
    fetchMock.mockResolvedValue(json(401, { message: 'Unauthorized' }));
    const client = setup('cognito', { idToken: 'tok', expiresAt: Date.now() + 3_600_000 });
    const err = await client.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: 'unauthorized', message: 'Sign in to continue.' });
    expect(sessionStorage.getItem('pracstack:auth:tokens')).toBeNull();
  });

  it('passes API error messages through', async () => {
    fetchMock.mockResolvedValue(
      json(503, {
        error: { code: 'unavailable', message: 'SQL practice is not available here yet.' },
      }),
    );
    await expect(setup('local').get('/x')).rejects.toMatchObject({
      code: 'unavailable',
      message: 'SQL practice is not available here yet.',
    });
  });
});
