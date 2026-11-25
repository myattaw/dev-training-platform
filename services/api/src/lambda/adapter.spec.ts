import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import type { ApiRequest } from '../http';
import { signInMethod, VerifiedJwtAuthenticator } from '../auth';
import { createApi } from '../app';
import { InMemoryProgressStore } from '../store/memory-store';
import { SlidingWindowRateLimiter } from '../rate-limit';
import { fixtureContent } from '../testing/fixtures';
import { createLambdaHandler } from './adapter';

const ISSUER = 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TEST';
const CLIENT = 'client123';
const NOW = new Date('2026-11-21T12:00:00Z');

const claims = (over: Record<string, string> = {}) => ({
  sub: 'user-1',
  iss: ISSUER,
  aud: CLIENT,
  token_use: 'id',
  email: 'learner@example.com',
  exp: String(NOW.getTime() / 1000 + 600),
  ...over,
});

function event(
  over: {
    method?: string;
    path?: string;
    body?: string;
    base64?: boolean;
    claims?: Record<string, string> | null;
  } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const method = over.method ?? 'GET';
  const path = over.path ?? '/api/me';
  return {
    version: '2.0',
    routeKey: `ANY /api/{proxy+}`,
    rawPath: path,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    ...(over.body !== undefined ? { body: over.body } : {}),
    isBase64Encoded: over.base64 ?? false,
    requestContext: {
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '1.2.3.4', userAgent: 'test' },
      ...(over.claims === null
        ? {}
        : {
            authorizer: {
              principalId: '',
              integrationLatency: 0,
              jwt: { claims: over.claims ?? claims(), scopes: [] },
            },
          }),
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function setup() {
  const seen: ApiRequest[] = [];
  const store = new InMemoryProgressStore();
  const api = createApi({
    auth: new VerifiedJwtAuthenticator({ issuer: ISSUER, audience: CLIENT }, () => NOW),
    content: fixtureContent(),
    store,
    accounts: store.accounts,
    webStore: store.web,
    rateLimiter: new SlidingWindowRateLimiter(1000, 60_000),
    now: () => NOW,
    random: () => 0,
    newId: () => 'id',
  });
  const handler = createLambdaHandler((req) => {
    seen.push(req);
    return api(req);
  });
  return { handler, seen };
}

describe('Lambda adapter + verified JWT authenticator', () => {
  it('passes verified claims through and identifies the user by `sub`', async () => {
    const { handler } = setup();
    const res = await handler(event());
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({ 'cache-control': 'no-store' });
    expect(JSON.parse(res.body ?? '')).toEqual({
      user: { id: 'user-1', displayName: 'learner@example.com', mode: 'authenticated' },
      xp: 0,
    });
  });

  it('rejects requests without verified claims (401)', async () => {
    const { handler } = setup();
    expect((await handler(event({ claims: null }))).statusCode).toBe(401);
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['another app client', { aud: 'other-client' }],
    ['an access token', { token_use: 'access' }],
    ['an expired token', { exp: String(NOW.getTime() / 1000 - 1) }],
    ['no subject', { sub: '' }],
  ])('fails closed on %s, even if the authorizer let it through', async (_, over) => {
    const { handler } = setup();
    expect((await handler(event({ claims: claims(over) }))).statusCode).toBe(401);
  });

  it('ignores claims sent by the client in headers or body', async () => {
    const { handler, seen } = setup();
    const e = event({
      method: 'POST',
      path: '/api/me',
      body: JSON.stringify({ sub: 'admin' }),
      claims: null,
    });
    (e.headers as Record<string, string>)['x-verified-claims'] = JSON.stringify(claims());
    expect((await handler(e)).statusCode).toBe(401);
    expect(seen[0]?.verifiedClaims).toBeUndefined();
  });

  it('decodes base64 bodies, rejects invalid JSON (400) and oversized bodies (413)', async () => {
    const { handler, seen } = setup();
    await handler(
      event({
        method: 'POST',
        path: '/api/skill-mastery/practice/next',
        body: Buffer.from(JSON.stringify({ skillId: 'x' })).toString('base64'),
        base64: true,
      }),
    );
    expect(seen[0]?.body).toEqual({ skillId: 'x' });
    expect((await handler(event({ method: 'POST', body: '{nope' }))).statusCode).toBe(400);
    const huge = JSON.stringify({ code: 'x'.repeat(500 * 1024) });
    expect((await handler(event({ method: 'POST', body: huge }))).statusCode).toBe(413);
    expect(seen).toHaveLength(1);
  });

  it('accepts the largest allowed code submission', async () => {
    const { handler } = setup();
    // 64 K characters of code that JSON-escapes to twice its size.
    const code = '"\n'.repeat(32 * 1024);
    const res = await handler(
      event({
        method: 'POST',
        path: '/api/challenges/none/submissions',
        body: JSON.stringify({ language: 'typescript', code }),
      }),
    );
    expect(res.statusCode).not.toBe(413);
  });
});

describe('signInMethod', () => {
  it('reads the federated provider from the Cognito identities claim', () => {
    expect(signInMethod([{ providerName: 'GitHub', providerType: 'OIDC', userId: '42' }])).toEqual({
      method: 'GitHub',
    });
    expect(signInMethod(JSON.stringify([{ providerName: 'Google' }]))).toEqual({
      method: 'Google',
    });
    // API Gateway's JWT authorizer prints the claim in Go's format, not JSON.
    expect(
      signInMethod(
        '[map[dateCreated:1732500000000 issuer:<nil> primary:true providerName:GitHub providerType:OIDC userId:39500954]]',
      ),
    ).toEqual({ method: 'GitHub' });
    expect(signInMethod('[map[providerName:Google providerType:Google userId:1]]')).toEqual({
      method: 'Google',
    });
    for (const value of [
      undefined,
      [],
      'not json',
      [{ providerName: '<script>' }],
      [{}],
      '[map[providerName:<script> userId:1]]',
    ])
      expect(signInMethod(value), JSON.stringify(value)).toEqual({});
  });
});
