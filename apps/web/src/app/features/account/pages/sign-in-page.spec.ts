import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NAVIGATOR } from '../../../core/auth/auth.service';
import { RuntimeConfigService, type SocialProvider } from '../../../core/config/runtime-config';
import { SignInPage } from './sign-in-page';

const DOMAIN = 'https://pracstack-test.auth.us-east-2.amazoncognito.com';
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

async function render(providers: readonly SocialProvider[]) {
  const visited: string[] = [];
  await TestBed.configureTestingModule({
    imports: [SignInPage],
    providers: [
      provideRouter([]),
      { provide: NAVIGATOR, useValue: (url: string) => visited.push(url) },
    ],
  }).compileComponents();
  TestBed.inject(RuntimeConfigService).set({
    auth: { mode: 'cognito', domain: DOMAIN, clientId: 'client-abc', providers },
  });
  const fixture = TestBed.createComponent(SignInPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('.provider-btn')].find((b) =>
      text(b)?.startsWith(label),
    );
  return { el, visited, button, fixture };
}

describe('SignInPage social providers', () => {
  it('offers GitHub when the deployment configures it, through Cognito with PKCE', async () => {
    const { button, visited } = await render(['Google', 'GitHub']);
    const github = button('Continue with GitHub');
    expect(github?.disabled).toBe(false);
    expect(text(github)).not.toContain('Coming soon');
    github?.click();
    await navigated(visited);
    const url = new URL(visited[0] ?? '');
    expect(url.origin).toBe(DOMAIN);
    expect(url.searchParams.get('identity_provider')).toBe('GitHub');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('shows GitHub as coming soon (disabled) when it is not configured', async () => {
    const { button } = await render(['Google']);
    expect(button('Continue with Google')?.disabled).toBe(false);
    const github = button('Continue with GitHub');
    expect(github?.disabled).toBe(true);
    expect(text(github)).toContain('Coming soon');
  });
});

describe('SignInPage layout and modes', () => {
  async function renderWith(inputs: Record<string, string>) {
    const result = await render(['Google', 'GitHub']);
    for (const [k, v] of Object.entries(inputs)) result.fixture.componentRef.setInput(k, v);
    await result.fixture.whenStable();
    return result;
  }

  it('shows the providers with their logos, then email', async () => {
    const { el } = await renderWith({});
    const buttons = [...el.querySelectorAll('.provider-btn:not(:disabled)')];
    expect(buttons.map((b) => b.getAttribute('data-provider'))).toEqual(['Google', 'GitHub']);
    for (const b of buttons) expect(b.querySelector('svg.provider-icon path')).not.toBeNull();
    expect(text(el.querySelector('h1'))).toBe('Sign in to PracStack');
    expect(text(el.querySelector('.email-btn'))).toBe('Sign in with email');
  });

  it('opens Cognito sign-up from the create-account view, returning to the requested page', async () => {
    const { el, visited } = await renderWith({ mode: 'signup', returnTo: '/skills' });
    expect(text(el.querySelector('h1'))).toBe('Create your PracStack account');
    el.querySelector<HTMLButtonElement>('.email-btn')?.click();
    await navigated(visited);
    const url = new URL(visited[0] ?? '');
    expect(url.pathname).toBe('/signup');
    expect(url.searchParams.has('identity_provider')).toBe(false);
  });

  it('keeps the return path when switching between sign-in and create account', async () => {
    const { el } = await renderWith({ returnTo: '/skills' });
    const link = el.querySelector<HTMLAnchorElement>('.switch a');
    expect(text(link)).toBe('Create an account');
    expect(link?.getAttribute('href')).toBe('/account/sign-in?returnTo=%2Fskills&mode=signup');
  });
});

/** Sign-in hashes the PKCE verifier (async crypto) before it navigates: wait for that. */
async function navigated(visited: readonly string[]): Promise<void> {
  for (let i = 0; i < 100 && visited.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
}
