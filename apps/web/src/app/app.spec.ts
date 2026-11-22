import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideFakeApi } from '../testing/fake-api';
import { App } from './app';
import { routes } from './app.routes';

describe('App shell', () => {
  beforeEach(() => localStorage.clear());

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideFakeApi()],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the PracStack brand and primary navigation', async () => {
    const { el } = await setup();
    expect(el.querySelector('.brand')?.textContent).toContain('PracStack');
    const links = [...el.querySelectorAll('nav[aria-label="Primary"] a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(links).toEqual([
      'Dashboard',
      'Skill Mastery',
      'Coding Challenges',
      'Company Interview Prep',
      'My Progress',
      'Account',
    ]);
  });

  it('only lists areas that exist (no placeholder navigation)', async () => {
    const { el } = await setup();
    const nav = el.querySelector('nav[aria-label="Primary"]');
    // Every link leads to a real, routed page; nothing is a placeholder.
    const top = new Set(routes.map((r) => r.path));
    for (const a of nav?.querySelectorAll('a') ?? []) {
      const path = (a.getAttribute('href') ?? '').replace(/^\//, '').split('/')[0] ?? '';
      expect(top.has(path), path).toBe(true);
    }
    expect(nav?.textContent).not.toContain('Coming soon');
  });

  it('toggles the side navigation and reflects it in aria-expanded', async () => {
    const { fixture, el } = await setup();
    const toggle = el.querySelector<HTMLButtonElement>('[aria-controls="side-nav"]')!;
    const nav = el.querySelector<HTMLElement>('#side-nav')!;
    const initiallyOpen = toggle.getAttribute('aria-expanded') === 'true';
    expect(nav.hidden).toBe(!initiallyOpen);

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe(String(!initiallyOpen));
    expect(nav.hidden).toBe(initiallyOpen);
  });
});
