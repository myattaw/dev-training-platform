import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type BridgeRequest, createGithubBridge, keyIdOf } from './bridge';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = keyIdOf(privateKey);
const ISSUER = 'https://api.example.com/oidc/github';
const COGNITO = 'https://auth.example.com/oauth2/idpresponse';
const NOW = Date.parse('2026-11-24T12:00:00Z');

interface GitHubState {
  emails: unknown;
  user?: unknown;
  exchange?: unknown;
}

function setup(state: GitHubState = { emails: [] }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url === 'https://github.com/login/oauth/access_token')
      return respond(state.exchange ?? { access_token: 'gho_token', token_type: 'bearer' });
    const auth = new Headers(init?.headers).get('authorization');
    if (auth !== 'Bearer gho_token') return respond({ message: 'Bad credentials' }, 401);
    if (url === 'https://api.github.com/user')
      return respond(state.user ?? { id: 4242, login: 'octo', name: 'Octo Cat' });
    if (url === 'https://api.github.com/user/emails') return respond(state.emails);
    return respond({}, 404);
  }) as typeof fetch;
  const bridge = createGithubBridge({
    issuer: ISSUER,
    allowedRedirectUris: [COGNITO],
    signingKey: () => Promise.resolve({ privateKey, kid: KID }),
    fetch: fakeFetch,
    now: () => NOW,
  });
  const call = (req: Partial<BridgeRequest>) =>
    bridge({ method: 'GET', path: '/', query: {}, headers: {}, body: '', ...req });
  return { call, calls };
}

const VERIFIED = [
  { email: 'old@example.com', primary: false, verified: true },
  { email: 'Octo@Example.com', primary: true, verified: true },
];

const tokenRequest = (extra: Record<string, string> = {}): Partial<BridgeRequest> => ({
  method: 'POST',
  path: '/token',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: 'abc',
    client_id: 'Iv1.client',
    client_secret: 's3cret',
    redirect_uri: COGNITO,
    ...extra,
  }).toString(),
});

function decode(jwt: string) {
  const [h, p, s] = jwt.split('.');
  const ok = verify(
    'RSA-SHA256',
    Buffer.from(`${h}.${p}`),
    createPublicKey(privateKey),
    Buffer.from(s!, 'base64url'),
  );
  return {
    ok,
    header: JSON.parse(Buffer.from(h!, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p!, 'base64url').toString()),
  };
}

describe('GitHub OIDC bridge: discovery and keys', () => {
  it('publishes its endpoints and RS256 key', async () => {
    const { call } = setup();
    const doc = JSON.parse((await call({ path: '/.well-known/openid-configuration' })).body);
    expect(doc).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/jwks.json`,
      id_token_signing_alg_values_supported: ['RS256'],
    });
    const jwks = JSON.parse((await call({ path: '/jwks.json' })).body);
    expect(jwks.keys).toEqual([
      expect.objectContaining({ kty: 'RSA', kid: KID, alg: 'RS256', use: 'sig' }),
    ]);
    expect(jwks.keys[0]).not.toHaveProperty('d');
  });

  it('answers 404 for anything else', async () => {
    const { call } = setup();
    expect((await call({ path: '/admin' })).status).toBe(404);
    expect((await call({ method: 'DELETE', path: '/token' })).status).toBe(404);
  });
});

describe('GitHub OIDC bridge: authorize', () => {
  it('redirects to GitHub with the client, Cognito redirect, state and email scope', async () => {
    const { call } = setup();
    const res = await call({
      path: '/authorize',
      query: {
        client_id: 'Iv1.client',
        redirect_uri: COGNITO,
        state: 'xyz',
        response_type: 'code',
        scope: 'openid email',
      },
    });
    expect(res.status).toBe(302);
    const url = new URL(res.headers['location']!);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'Iv1.client',
      redirect_uri: COGNITO,
      scope: 'read:user user:email',
      state: 'xyz',
    });
  });

  it('is not an open redirect: other redirect URIs are refused', async () => {
    const { call } = setup();
    for (const redirect of ['https://evil.example/cb', `${COGNITO}?x=1`, '']) {
      const res = await call({
        path: '/authorize',
        query: { client_id: 'Iv1.client', redirect_uri: redirect },
      });
      expect(res.status, redirect).toBe(400);
      expect(res.headers['location']).toBeUndefined();
    }
    expect(
      (await call({ path: '/authorize', query: { client_id: '<x>', redirect_uri: COGNITO } }))
        .status,
    ).toBe(400);
    expect(
      (
        await call({
          path: '/authorize',
          query: { client_id: 'a', redirect_uri: COGNITO, response_type: 'token' },
        })
      ).status,
    ).toBe(400);
  });
});

describe('GitHub OIDC bridge: token', () => {
  it('exchanges the code with the client credentials Cognito sent and signs an ID token', async () => {
    const { call, calls } = setup({ emails: VERIFIED });
    const res = await call(tokenRequest());
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ access_token: 'gho_token', token_type: 'Bearer' });
    const exchange = calls.find((c) => c.url.endsWith('/login/oauth/access_token'));
    expect(Object.fromEntries(new URLSearchParams(String(exchange?.init?.body)))).toEqual({
      client_id: 'Iv1.client',
      client_secret: 's3cret',
      code: 'abc',
      redirect_uri: COGNITO,
    });
    const token = decode(body.id_token);
    expect(token.ok).toBe(true);
    expect(token.header).toEqual({ alg: 'RS256', typ: 'JWT', kid: KID });
    expect(token.payload).toEqual({
      iss: ISSUER,
      aud: 'Iv1.client',
      iat: NOW / 1000,
      exp: NOW / 1000 + 300,
      sub: '4242',
      email: 'octo@example.com',
      email_verified: true,
      name: 'Octo Cat',
      preferred_username: 'octo',
    });
  });

  it('accepts client credentials in a Basic header too', async () => {
    const { call, calls } = setup({ emails: VERIFIED });
    const req = tokenRequest();
    const form = new URLSearchParams(req.body);
    form.delete('client_id');
    form.delete('client_secret');
    const res = await call({
      ...req,
      body: form.toString(),
      headers: { authorization: `Basic ${Buffer.from('Iv1.client:s3cret').toString('base64')}` },
    });
    expect(res.status).toBe(200);
    expect(String(calls[0]?.init?.body)).toContain('client_secret=s3cret');
  });

  it('never uses an unverified or non-primary email', async () => {
    for (const emails of [
      [{ email: 'victim@example.com', primary: true, verified: false }],
      [{ email: 'victim@example.com', primary: false, verified: true }],
      [],
      { message: 'not a list' },
    ]) {
      const { call } = setup({ emails });
      const res = await call(tokenRequest());
      expect(res.status, JSON.stringify(emails)).toBe(400);
      expect(JSON.parse(res.body)).toMatchObject({ error: 'access_denied' });
      expect(res.body).not.toContain('id_token');
    }
  });

  it('uses the login as the name when GitHub has no display name', async () => {
    const { call } = setup({ emails: VERIFIED, user: { id: 7, login: 'octo', name: null } });
    const token = decode(JSON.parse((await call(tokenRequest())).body).id_token);
    expect(token.payload).toMatchObject({ sub: '7', name: 'octo' });
  });

  it('refuses bad grants, missing credentials, foreign redirect URIs and codes GitHub rejects', async () => {
    const { call } = setup({ emails: VERIFIED });
    expect((await call(tokenRequest({ grant_type: 'password' }))).status).toBe(400);
    expect((await call(tokenRequest({ client_secret: '' }))).status).toBe(400);
    expect((await call(tokenRequest({ redirect_uri: 'https://evil.example/cb' }))).status).toBe(
      400,
    );
    const rejected = setup({ emails: VERIFIED, exchange: { error: 'bad_verification_code' } });
    const res = await rejected.call(tokenRequest());
    expect([res.status, JSON.parse(res.body).error]).toEqual([400, 'invalid_grant']);
  });
});

describe('GitHub OIDC bridge: userinfo', () => {
  it('returns the same claims for a valid GitHub token, 401 otherwise', async () => {
    const { call } = setup({ emails: VERIFIED });
    const ok = await call({ path: '/userinfo', headers: { authorization: 'Bearer gho_token' } });
    expect(JSON.parse(ok.body)).toEqual({
      sub: '4242',
      email: 'octo@example.com',
      email_verified: true,
      name: 'Octo Cat',
      preferred_username: 'octo',
    });
    expect((await call({ path: '/userinfo' })).status).toBe(401);
    expect(
      (await call({ path: '/userinfo', headers: { authorization: 'Bearer nope' } })).status,
    ).toBe(401);
  });
});
