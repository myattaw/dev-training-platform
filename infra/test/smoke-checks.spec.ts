import { appContentSecurityPolicy } from '@pracstack/web-security';
import { describe, expect, it } from 'vitest';
import { runSmokeChecks } from '../scripts/smoke-checks';

const SITE = 'https://d111111abcdef8.cloudfront.net';
const COGNITO = 'https://pracstack-staging-1a2b3c4d.auth.us-east-2.amazoncognito.com';
const INDEX =
  '<!doctype html><html><body><app-root></app-root><script src="main-AB12cd_-.js" type="module"></script></body></html>';

type Site = Record<string, (init?: RequestInit) => Response>;

/** A fake deployment that behaves like the CDK stack. Tests break one thing at a time. */
function healthySite(): Site {
  const headers = {
    'content-security-policy': appContentSecurityPolicy({ connectOrigins: [COGNITO], https: true }),
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
  };
  const page = () =>
    new Response(INDEX, { status: 200, headers: { ...headers, 'content-type': 'text/html' } });
  return {
    [`${SITE}/`]: page,
    [`${SITE}/challenges/smoke-test-route/workspace`]: page,
    'http://d111111abcdef8.cloudfront.net/': () =>
      new Response(null, { status: 301, headers: { location: `${SITE}/` } }),
    [`${SITE}/config.json`]: () =>
      new Response(
        JSON.stringify({ auth: { mode: 'cognito', domain: COGNITO, clientId: 'abc123' } }),
        {
          status: 200,
          headers: { 'cache-control': 'no-cache' },
        },
      ),
    [`${SITE}/api/me`]: () => new Response('{"message":"Unauthorized"}', { status: 401 }),
    [`${SITE}/main-AB12cd_-.js`]: () =>
      new Response('console.log(1)', {
        status: 200,
        headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      }),
    [`${SITE}/main-AB12cd_-.js.map`]: () => new Response('denied', { status: 403 }),
    [`${COGNITO}/login`]: () => new Response('<form>', { status: 200 }),
  };
}

const run = (site: Site) =>
  runSmokeChecks(SITE, (url, init) => {
    const key = url.split('?')[0] ?? url;
    const handler = site[key];
    return Promise.resolve(handler ? handler(init) : new Response('missing', { status: 404 }));
  });
const failures = async (site: Site) => (await run(site)).filter((r) => !r.ok).map((r) => r.name);

describe('post-deployment smoke checks', () => {
  it('pass against a correctly deployed site', async () => {
    expect(await failures(healthySite())).toEqual([]);
  });

  it('accept social sign-in providers in config.json', async () => {
    const site = healthySite();
    site[`${SITE}/config.json`] = () =>
      new Response(
        JSON.stringify({
          auth: { mode: 'cognito', domain: COGNITO, clientId: 'abc', providers: ['Google'] },
        }),
        { status: 200, headers: { 'cache-control': 'no-cache' } },
      );
    expect(await failures(site)).toEqual([]);
  });

  it("accept the site's own sign-in subdomain, but no other domain", async () => {
    const withDomain = (domain: string) => {
      const site = healthySite();
      site[`${SITE}/config.json`] = () =>
        new Response(JSON.stringify({ auth: { mode: 'cognito', domain, clientId: 'abc' } }), {
          status: 200,
          headers: { 'cache-control': 'no-cache' },
        });
      return site;
    };
    expect(await failures(withDomain('https://auth.d111111abcdef8.cloudfront.net'))).not.toContain(
      'config.json: Cognito mode, public values only',
    );
    expect(await failures(withDomain('https://auth.evil.example'))).toContain(
      'config.json: Cognito mode, public values only',
    );
  });

  it('catch a missing SPA fallback', async () => {
    const site = healthySite();
    delete site[`${SITE}/challenges/smoke-test-route/workspace`];
    expect(await failures(site)).toEqual(['client-side routes serve the app']);
  });

  it('catch an API reachable without a token', async () => {
    const site = healthySite();
    site[`${SITE}/api/me`] = () => new Response('{}', { status: 200 });
    expect(await failures(site)).toEqual(
      expect.arrayContaining(['API rejects anonymous requests', 'API rejects a forged token']),
    );
  });

  it('accept the list of code languages in config.json, but only plain names', async () => {
    const withLanguages = (codeLanguages: unknown) => {
      const site = healthySite();
      site[`${SITE}/config.json`] = () =>
        new Response(
          JSON.stringify({
            auth: { mode: 'cognito', domain: COGNITO, clientId: 'abc' },
            codeLanguages,
          }),
          { status: 200, headers: { 'cache-control': 'no-cache' } },
        );
      return site;
    };
    expect(await failures(withLanguages(['typescript', 'java', 'csharp']))).toEqual([]);
    expect(await failures(withLanguages('java'))).toEqual([
      'config.json: Cognito mode, public values only',
    ]);
    expect(await failures(withLanguages(['java', 'secret=abc']))).toEqual([
      'config.json: Cognito mode, public values only',
    ]);
  });

  it('catch extra (possibly secret) values in config.json', async () => {
    const site = healthySite();
    site[`${SITE}/config.json`] = () =>
      new Response(
        JSON.stringify({
          auth: { mode: 'cognito', domain: COGNITO, clientId: 'abc', clientSecret: 's' },
        }),
        { status: 200, headers: { 'cache-control': 'no-cache' } },
      );
    expect(await failures(site)).toEqual(['config.json: Cognito mode, public values only']);
  });

  it('catch a weakened CSP, served source maps and a rejected callback URL', async () => {
    const site = healthySite();
    const page = site[`${SITE}/`]!;
    site[`${SITE}/`] = () => {
      const res = page();
      const headers = new Headers(res.headers);
      headers.set(
        'content-security-policy',
        `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ${COGNITO}`,
      );
      return new Response(INDEX, { status: 200, headers });
    };
    site[`${SITE}/main-AB12cd_-.js.map`] = () => new Response('{}', { status: 200 });
    site[`${COGNITO}/login`] = () =>
      new Response(null, {
        status: 302,
        headers: { location: `${COGNITO}/error?error=redirect_mismatch` },
      });
    expect(await failures(site)).toEqual([
      'content security policy (scripts from this site only)',
      'source maps are not served',
      'Cognito sign-in page accepts the callback URL',
    ]);
  });

  it('refuses a non-HTTPS site URL', async () => {
    await expect(runSmokeChecks('http://example.com')).rejects.toThrow(/https/);
  });
});
