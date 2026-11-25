import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NAVIGATOR } from '../../../core/auth/auth.service';
import { RuntimeConfigService } from '../../../core/config/runtime-config';
import { FakeApiClient, provideFakeApi } from '../../../../testing/fake-api';
import { AccountPage } from './account-page';

/*
 * Adding a sign-in method: a link token created while signed in to the
 * account, redeemed after signing in with the new method (proof from both).
 */

const DOMAIN = 'https://pracstack-test.auth.us-east-2.amazoncognito.com';
const TOKEN = '0b6e1f4c-8c2a-4a57-9b0e-3d3a3f1e9c11';
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
/** A sign-in method row: its name and its status or action, e.g. `GitHub Connected`. */
const row = (li: Element) => [...li.children].map((c) => text(c)).join(' ');
const settle = () => new Promise((r) => setTimeout(r));

function api(identities: string[]) {
  return new FakeApiClient()
    .on('GET /me', () => ({ user: { id: 'u1', displayName: 'Ada', mode: 'authenticated' } }))
    .on('GET /me/entitlements', () => ({
      plan: 'free',
      source: 'default',
      features: [],
      billing: { available: false },
    }))
    .on('GET /me/progress', () => ({ drafts: [], importedAt: null }))
    .on('GET /me/identities', () => ({
      identities: identities.map((provider) => ({ provider, linkedAt: '2026-11-01T00:00:00Z' })),
    }))
    .on('POST /me/identities/link-intents', () => ({
      token: TOKEN,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }))
    .on('POST /me/identities/link', () => ({ userId: 'u1' }));
}

async function render(fake: FakeApiClient) {
  const visited: string[] = [];
  // Signed in (an unexpired, unsigned token is enough for the browser's state).
  sessionStorage.setItem(
    'pracstack:auth:tokens',
    JSON.stringify({ idToken: 'x.e30.y', expiresAt: Date.now() + 3_600_000 }),
  );
  await TestBed.configureTestingModule({
    imports: [AccountPage],
    providers: [
      provideRouter([]),
      provideFakeApi(fake),
      { provide: NAVIGATOR, useValue: (url: string) => visited.push(url) },
    ],
  }).compileComponents();
  TestBed.inject(RuntimeConfigService).set({
    auth: { mode: 'cognito', domain: DOMAIN, clientId: 'client', providers: ['Google', 'GitHub'] },
  });
  const fixture = TestBed.createComponent(AccountPage);
  await fixture.whenStable();
  await settle();
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, fixture, visited };
}

afterEach(() => sessionStorage.clear());

describe('AccountPage: adding a sign-in method', () => {
  it('lists connected methods, and offers configured providers that are not connected', async () => {
    const { el } = await render(api(['Email and password', 'Google']));
    const rows = [...el.querySelectorAll('.methods li')].map(row);
    expect(rows).toEqual(['Email and password Connected', 'Google Connected', 'GitHub Connect']);
    const buttons = [...el.querySelectorAll('.methods button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(buttons).toEqual(['Connect GitHub to this account']);
  });

  it('offers nothing to connect when every provider is connected', async () => {
    const { el } = await render(api(['GitHub', 'Google']));
    expect([...el.querySelectorAll('.methods li')].map(row)).toEqual([
      'GitHub Connected',
      'Google Connected',
    ]);
    expect(el.querySelectorAll('.methods button')).toHaveLength(0);
  });

  it('creates a link token, keeps it in this tab, and signs in with GitHub', async () => {
    const fake = api(['Email and password']);
    const { el, visited } = await render(fake);
    el.querySelector<HTMLButtonElement>('[aria-label="Connect GitHub to this account"]')?.click();
    await settle();
    await settle();
    expect(fake.calls.some((c) => c.route === 'POST /me/identities/link-intents')).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('pracstack.pendingLink') ?? '{}')).toMatchObject({
      token: TOKEN,
      provider: 'GitHub',
    });
    const url = new URL(visited[0] ?? '');
    expect(url.searchParams.get('identity_provider')).toBe('GitHub');
    // The token never goes into a URL.
    expect(visited.join(' ')).not.toContain(TOKEN);
  });

  it('redeems the token once after signing in with the new method', async () => {
    sessionStorage.setItem(
      'pracstack.pendingLink',
      JSON.stringify({
        token: TOKEN,
        provider: 'GitHub',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    );
    const fake = api(['Email and password', 'GitHub']);
    const { el } = await render(fake);
    const link = fake.calls.filter((c) => c.route === 'POST /me/identities/link');
    expect(link.map((c) => c.input)).toEqual([{ token: TOKEN }]);
    expect(sessionStorage.getItem('pracstack.pendingLink')).toBeNull();
    expect(text(el)).toContain('GitHub is now linked');
  });

  it('does not redeem an expired request', async () => {
    sessionStorage.setItem(
      'pracstack.pendingLink',
      JSON.stringify({ token: TOKEN, provider: 'GitHub', expiresAt: '2020-01-01T00:00:00Z' }),
    );
    const fake = api(['Email and password']);
    const { el } = await render(fake);
    expect(fake.calls.some((c) => c.route === 'POST /me/identities/link')).toBe(false);
    expect(text(el)).toContain('The link request expired');
  });
});
