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
    [...el.querySelectorAll<HTMLButtonElement>('.social-btn')].find((b) =>
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
    await new Promise((r) => setTimeout(r));
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
