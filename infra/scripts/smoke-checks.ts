/**
 * Post-deployment smoke checks against a deployed PracStack site, over public
 * HTTPS only: no AWS credentials, no sign-in, nothing written. Used by
 * scripts/smoke-test.ts and the staging deployment workflow.
 */

export interface SmokeResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const header = (res: Response, name: string): string => res.headers.get(name) ?? '';

export async function runSmokeChecks(
  siteUrl: string,
  fetchImpl: Fetch = fetch,
): Promise<SmokeResult[]> {
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:') throw new Error(`The site URL must be https: ${siteUrl}`);
  const origin = site.origin;
  const results: SmokeResult[] = [];
  const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });
  const get = async (path: string, init: RequestInit = {}) =>
    fetchImpl(new URL(path, origin).toString(), { redirect: 'manual', ...init });

  // 1. The app shell, with the security headers CloudFront adds.
  const home = await get('/');
  const html = home.status === 200 ? await home.text() : '';
  check(
    'home page is served',
    home.status === 200 && /<app-root/i.test(html),
    `HTTP ${home.status}`,
  );
  const csp = header(home, 'content-security-policy');
  const scriptSrc = /(?:^|;)\s*script-src([^;]*)/.exec(csp)?.[1]?.trim() ?? '';
  check(
    'content security policy (scripts from this site only)',
    /(?:^|;)\s*default-src 'self'/.test(csp) && scriptSrc === "'self'",
    csp.slice(0, 160),
  );
  check(
    'HSTS',
    /max-age=\d{7,}/.test(header(home, 'strict-transport-security')),
    header(home, 'strict-transport-security'),
  );
  check(
    'no framing',
    header(home, 'x-frame-options').toUpperCase() === 'DENY',
    header(home, 'x-frame-options'),
  );
  check(
    'no MIME sniffing',
    header(home, 'x-content-type-options') === 'nosniff',
    header(home, 'x-content-type-options'),
  );

  // 2. Client-side routes get the app (CloudFront Function), files do not.
  const deep = await get('/challenges/smoke-test-route/workspace');
  check(
    'client-side routes serve the app',
    deep.status === 200 && /<app-root/i.test(await deep.text()),
    `HTTP ${deep.status}`,
  );

  // 3. Plain HTTP is redirected to HTTPS.
  const http = await fetchImpl(`http://${site.host}/`, { redirect: 'manual' }).catch(
    () => undefined,
  );
  check(
    'HTTP redirects to HTTPS',
    !!http &&
      [301, 302, 307, 308].includes(http.status) &&
      header(http, 'location').startsWith('https://'),
    http ? `HTTP ${http.status} → ${header(http, 'location')}` : 'no response',
  );

  // 4. Runtime config: public values only, pointing at Cognito.
  const configRes = await get('/config.json');
  let config: unknown;
  try {
    config = configRes.status === 200 ? await configRes.json() : undefined;
  } catch {
    config = undefined;
  }
  const auth = (config as { auth?: Record<string, unknown> } | undefined)?.auth;
  const domain = typeof auth?.['domain'] === 'string' ? auth['domain'] : '';
  const clientId = typeof auth?.['clientId'] === 'string' ? auth['clientId'] : '';
  check(
    'config.json: Cognito mode, public values only',
    auth?.['mode'] === 'cognito' &&
      /^https:\/\/[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/.test(domain) &&
      clientId !== '' &&
      JSON.stringify(Object.keys(config as object)) === '["auth"]' &&
      JSON.stringify(Object.keys(auth).sort()) === '["clientId","domain","mode"]',
    JSON.stringify(config),
  );
  check(
    'config.json is revalidated',
    /no-cache/.test(header(configRes, 'cache-control')),
    header(configRes, 'cache-control'),
  );
  check('the CSP allows the sign-in domain', domain !== '' && csp.includes(domain), domain);

  // 5. The API rejects requests without a valid token (API Gateway JWT authorizer).
  const anonymous = await get('/api/me');
  check('API rejects anonymous requests', anonymous.status === 401, `HTTP ${anonymous.status}`);
  const forged = await get('/api/me', {
    headers: { authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' },
  });
  check('API rejects a forged token', forged.status === 401, `HTTP ${forged.status}`);
  check(
    'API responses are not cached',
    !/public|max-age=[1-9]/.test(header(anonymous, 'cache-control')),
    header(anonymous, 'cache-control'),
  );

  // 6. Hashed bundles are cached long-term and ship without source maps.
  const main = /\b(main-[A-Za-z0-9_-]{8}\.js)\b/.exec(html)?.[1];
  if (main) {
    const bundle = await get(`/${main}`);
    const body = bundle.status === 200 ? await bundle.text() : '';
    check(
      'main bundle is served and immutable',
      bundle.status === 200 && /immutable/.test(header(bundle, 'cache-control')),
      `${main}: HTTP ${bundle.status}, ${header(bundle, 'cache-control')}`,
    );
    check(
      'main bundle has no source map reference',
      bundle.status === 200 && !/sourceMappingURL/.test(body),
      main,
    );
    const map = await get(`/${main}.map`);
    check('source maps are not served', map.status !== 200, `HTTP ${map.status}`);
  } else {
    check('main bundle is referenced by index.html', false, 'no main-<hash>.js in index.html');
  }

  // 7. Cognito's managed login accepts this site's callback URL.
  if (domain && clientId) {
    const login = new URL('/login', domain);
    login.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${origin}/auth/callback`,
    }).toString();
    const res = await fetchImpl(login.toString(), { redirect: 'manual' }).catch(() => undefined);
    const location = res ? header(res, 'location') : '';
    check(
      'Cognito sign-in page accepts the callback URL',
      res?.status === 200 && !/error/.test(location),
      res ? `HTTP ${res.status}${location ? ` → ${location}` : ''}` : 'no response',
    );
  }

  return results;
}
