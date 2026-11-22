import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../config/runtime-config';
import { AuthService, NAVIGATOR, SignInError } from './auth.service';
import { codeChallenge, readJwtPayload, safeReturnPath } from './pkce';

const DOMAIN = 'https://pracstack-test.auth.us-east-2.amazoncognito.com';
const CLIENT = 'client-abc';

/** An unsigned JWT-shaped token for display tests. */
const fakeJwt = (claims: Record<string, unknown>) => {
  const utf8 = new TextEncoder().encode(JSON.stringify(claims));
  return `x.${btoa(String.fromCharCode(...utf8)).replace(/=+$/, '')}.y`;
};

function setup(mode: 'local' | 'cognito' = 'cognito') {
  const visited: string[] = [];
  TestBed.configureTestingModule({
    providers: [{ provide: NAVIGATOR, useValue: (url: string) => visited.push(url) }],
  });
  TestBed.inject(RuntimeConfigService).set(
    mode === 'local'
      ? { auth: { mode: 'local' } }
      : { auth: { mode: 'cognito', domain: DOMAIN, clientId: CLIENT } },
  );
  return { auth: TestBed.inject(AuthService), visited };
}

const tokenResponse = (over: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      id_token: fakeJwt({ email: 'learner@example.com' }),
      refresh_token: 'refresh-1',
      expires_in: 3600,
      ...over,
    }),
    { status: 200 },
  );

describe('AuthService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('needs no sign-in in local mode', () => {
    const { auth, visited } = setup('local');
    expect(auth.status()).toBe('local');
    expect(auth.ensureSignedIn()).toBe(true);
    expect(visited).toEqual([]);
  });

  it('sends the browser to Cognito with PKCE (S256) and a random state', async () => {
    const { auth, visited } = setup();
    expect(auth.status()).toBe('signed-out');
    await auth.signIn('/skills/typescript');
    const url = new URL(visited[0] ?? '');
    expect(url.origin + url.pathname).toBe(`${DOMAIN}/oauth2/authorize`);
    const q = url.searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe(CLIENT);
    expect(q.get('redirect_uri')).toBe(`${location.origin}/auth/callback`);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('state')?.length).toBeGreaterThanOrEqual(40);
    // The verifier stays in this tab; only its hash is sent.
    const pending = JSON.parse(sessionStorage.getItem('pracstack:auth:pending') ?? '{}');
    expect(q.get('code_challenge')).toBe(await codeChallenge(pending.verifier));
    expect(url.toString()).not.toContain(pending.verifier);
  });

  it('exchanges the code (with the verifier) and returns to the original page', async () => {
    const { auth, visited } = setup();
    await auth.signIn('/skills/typescript');
    const state = new URL(visited[0] ?? '').searchParams.get('state') ?? '';
    fetchMock.mockResolvedValue(tokenResponse());

    const next = await auth.completeSignIn(new URLSearchParams({ code: 'c1', state }));
    expect(next).toBe('/skills/typescript');
    expect(auth.status()).toBe('signed-in');
    expect(auth.displayName()).toBe('learner@example.com');
    expect(await auth.idToken()).toContain('x.');

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(`${DOMAIN}/oauth2/token`);
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('c1');
    expect(body.get('code_verifier')).toBeTruthy();
    expect(body.get('client_secret')).toBeNull();
  });

  it('refuses a callback whose state does not match (CSRF / forged link)', async () => {
    const { auth } = setup();
    await auth.signIn('/');
    await expect(
      auth.completeSignIn(new URLSearchParams({ code: 'c1', state: 'forged' })),
    ).rejects.toBeInstanceOf(SignInError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.status()).toBe('signed-out');
  });

  it('refuses a callback this tab did not start, and cannot be replayed', async () => {
    const { auth, visited } = setup();
    await expect(
      auth.completeSignIn(new URLSearchParams({ code: 'c1', state: 's' })),
    ).rejects.toBeInstanceOf(SignInError);

    await auth.signIn('/');
    const state = new URL(visited[0] ?? '').searchParams.get('state') ?? '';
    fetchMock.mockResolvedValue(tokenResponse());
    await auth.completeSignIn(new URLSearchParams({ code: 'c1', state }));
    await expect(
      auth.completeSignIn(new URLSearchParams({ code: 'c1', state })),
    ).rejects.toBeInstanceOf(SignInError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports errors returned by Cognito', async () => {
    const { auth } = setup();
    await auth.signIn('/');
    await expect(
      auth.completeSignIn(
        new URLSearchParams({ error: 'access_denied', error_description: 'User cancelled' }),
      ),
    ).rejects.toThrow('User cancelled');
  });

  it('refreshes an expiring token once, even for concurrent callers', async () => {
    const { auth, visited } = setup();
    await auth.signIn('/');
    const state = new URL(visited[0] ?? '').searchParams.get('state') ?? '';
    fetchMock.mockResolvedValueOnce(tokenResponse({ expires_in: 30 })); // inside the margin
    await auth.completeSignIn(new URLSearchParams({ code: 'c1', state }));

    fetchMock.mockResolvedValueOnce(
      tokenResponse({
        id_token: fakeJwt({ email: 'fresh@example.com' }),
        refresh_token: undefined,
      }),
    );
    const [a, b] = await Promise.all([auth.idToken(), auth.idToken()]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = new URLSearchParams(
      String((fetchMock.mock.calls[1] as [URL, RequestInit])[1].body),
    );
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-1');
    expect(auth.displayName()).toBe('fresh@example.com');
  });

  it('signs out when the refresh fails', async () => {
    const { auth, visited } = setup();
    await auth.signIn('/');
    const state = new URL(visited[0] ?? '').searchParams.get('state') ?? '';
    fetchMock.mockResolvedValueOnce(tokenResponse({ expires_in: 1 }));
    await auth.completeSignIn(new URLSearchParams({ code: 'c1', state }));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    expect(await auth.idToken()).toBeUndefined();
    expect(auth.status()).toBe('signed-out');
  });

  it('signs out locally and at Cognito', async () => {
    const { auth, visited } = setup();
    await auth.signIn('/');
    const state = new URL(visited[0] ?? '').searchParams.get('state') ?? '';
    fetchMock.mockResolvedValue(tokenResponse());
    await auth.completeSignIn(new URLSearchParams({ code: 'c1', state }));
    auth.signOut();
    expect(auth.status()).toBe('signed-out');
    expect(sessionStorage.getItem('pracstack:auth:tokens')).toBeNull();
    const logout = new URL(visited.at(-1) ?? '');
    expect(logout.pathname).toBe('/logout');
    expect(logout.searchParams.get('client_id')).toBe(CLIENT);
    // The refresh token is revoked at Cognito (public client: client_id, no secret).
    const [url, init] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
    expect(String(url)).toBe(`${DOMAIN}/oauth2/revoke`);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    const body = new URLSearchParams(String(init.body));
    expect(body.get('token')).toBe('refresh-1');
    expect(body.get('client_id')).toBe(CLIENT);
  });

  it('still signs out when revoking the refresh token fails', async () => {
    const { auth, visited } = setup();
    await auth.signIn('/');
    const state = new URL(visited[0] ?? '').searchParams.get('state') ?? '';
    fetchMock.mockResolvedValueOnce(tokenResponse());
    await auth.completeSignIn(new URLSearchParams({ code: 'c1', state }));
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    auth.signOut();
    expect(auth.status()).toBe('signed-out');
    expect(new URL(visited.at(-1) ?? '').pathname).toBe('/logout');
  });
});

describe('PKCE helpers', () => {
  it('computes the RFC 7636 example challenge', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('only returns to same-origin paths after sign-in', () => {
    expect(safeReturnPath('/skills/typescript?x=1')).toBe('/skills/typescript?x=1');
    for (const evil of ['https://evil.example', '//evil.example', '/\\evil.example', '', null])
      expect(safeReturnPath(evil)).toBe('/');
  });

  it('reads (but does not trust) JWT payloads', () => {
    expect(readJwtPayload(fakeJwt({ email: 'é@example.com' }))).toEqual({ email: 'é@example.com' });
    expect(readJwtPayload('garbage')).toBeUndefined();
  });
});
