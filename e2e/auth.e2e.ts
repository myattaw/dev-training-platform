import { expect, type Page, test } from '@playwright/test';
import { appContentSecurityPolicy } from '@pracstack/web-security';
import { PANGRAM_SOLUTION, replaceCode, waitForEditor } from './support/workspace';

/*
 * The app in Cognito mode, as deployed on AWS, with a fake Cognito: the test
 * serves config.json in "cognito" mode and answers the OAuth endpoints. Pages
 * get the production CSP generated for that Cognito origin (as the CDK stack
 * does), so the token request is checked against the real policy.
 *
 * The local API behind it ignores tokens (it is the local developer user), so
 * these tests cover the browser side: the redirect, PKCE, the callback, the
 * bearer token on API calls, and what signed-out learners can and can't do.
 */

const DOMAIN = 'https://pracstack-e2e.auth.us-east-2.amazoncognito.com';
const CLIENT = 'e2e-client';

const idToken = (() => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ email: 'learner@example.com', sub: 'u1' })}.sig`;
})();

interface FakeCognito {
  readonly tokenRequests: URLSearchParams[];
  readonly revokeRequests: URLSearchParams[];
  readonly apiAuthHeaders: (string | undefined)[];
}

async function cognitoMode(page: Page): Promise<FakeCognito> {
  const fake: FakeCognito = { tokenRequests: [], revokeRequests: [], apiAuthHeaders: [] };

  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { auth: { mode: 'cognito', domain: DOMAIN, clientId: CLIENT } } }),
  );
  // Documents get the production CSP for this Cognito origin.
  await page.route(
    (url) => !url.href.startsWith(DOMAIN),
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy': appContentSecurityPolicy({ connectOrigins: [DOMAIN] }),
        },
      });
    },
  );
  await page.route(`${DOMAIN}/oauth2/authorize?*`, (route) => {
    const q = new URL(route.request().url()).searchParams;
    expect(q.get('code_challenge_method')).toBe('S256');
    const back = new URL(q.get('redirect_uri') ?? '');
    back.search = new URLSearchParams({ code: 'code-1', state: q.get('state') ?? '' }).toString();
    // Like the real login page, navigate back (a 302 would bypass routing of the next document).
    return route.fulfill({
      contentType: 'text/html',
      body: `<meta http-equiv="refresh" content="0;url=${back.toString()}">`,
    });
  });
  await page.route(`${DOMAIN}/oauth2/token`, (route) => {
    fake.tokenRequests.push(new URLSearchParams(route.request().postData() ?? ''));
    return route.fulfill({
      json: { id_token: idToken, refresh_token: 'r1', expires_in: 3600 },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.route(`${DOMAIN}/oauth2/revoke`, (route) => {
    fake.revokeRequests.push(new URLSearchParams(route.request().postData() ?? ''));
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route(`${DOMAIN}/logout?*`, (route) => {
    const back = new URL(route.request().url()).searchParams.get('logout_uri') ?? '/';
    return route.fulfill({ status: 302, headers: { location: back } });
  });
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/'))
      fake.apiAuthHeaders.push(req.headers()['authorization']);
  });
  return fake;
}

test.describe('sign-in with Cognito (fake identity provider)', () => {
  test('signed-out learners can browse and run code in the browser, but nothing calls the API', async ({
    page,
  }) => {
    const fake = await cognitoMode(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Local mode')).toHaveCount(0);

    await page.goto('/skills/typescript');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.goto('/challenges/pangram/workspace');
    await waitForEditor(page);
    await expect(page.getByRole('button', { name: 'Sign in to submit' })).toBeVisible();
    await replaceCode(page, PANGRAM_SOLUTION);
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 10 visible tests passed')).toBeVisible({ timeout: 30_000 });

    expect(fake.apiAuthHeaders).toEqual([]);
  });

  test('practice requires sign-in: PKCE round trip, then API calls carry the token', async ({
    page,
  }) => {
    const fake = await cognitoMode(page);
    await page.goto('/skills/typescript');
    await page.goto('/skills/typescript/ts-primitive-types/practice');

    // Back from the (fake) Cognito login, on the page that was asked for.
    await expect(page).toHaveURL(/\/skills\/typescript\/ts-primitive-types\/practice$/);
    await expect(page.getByText(/tier \d of 5/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    expect(fake.tokenRequests).toHaveLength(1);
    const exchange = fake.tokenRequests[0];
    expect(exchange?.get('grant_type')).toBe('authorization_code');
    expect(exchange?.get('code')).toBe('code-1');
    expect(exchange?.get('client_id')).toBe(CLIENT);
    expect(exchange?.get('code_verifier')?.length).toBeGreaterThanOrEqual(43);
    expect(fake.apiAuthHeaders.length).toBeGreaterThan(0);
    expect(fake.apiAuthHeaders.every((h) => h === `Bearer ${idToken}`)).toBe(true);

    // The code is single-use from the app's side: revisiting the callback fails safely.
    await page.goto('/auth/callback?code=code-1&state=replayed');
    await expect(page.getByText('This sign-in link is invalid or has expired')).toBeVisible();
    expect(fake.tokenRequests).toHaveLength(1);
  });

  test('signing out clears the session and revokes the refresh token', async ({ page }) => {
    const fake = await cognitoMode(page);
    await page.goto('/challenges/pangram/workspace');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page).toHaveURL(/\/challenges\/pangram\/workspace$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('pracstack:auth:tokens'))).toBeNull();
    // Sent under the production CSP (connect-src allows the Cognito origin).
    await expect.poll(() => fake.revokeRequests.length).toBe(1);
    expect(fake.revokeRequests[0]?.get('token')).toBe('r1');
    expect(fake.revokeRequests[0]?.get('client_id')).toBe(CLIENT);
  });
});
