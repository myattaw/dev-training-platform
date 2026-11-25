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
    const brand = el.querySelector('a.brand');
    expect(brand?.getAttribute('aria-label')).toBe('PracStack home');
    expect(brand?.getAttribute('href')).toBe('/');
    expect(brand?.querySelector('app-pracstack-logo')).not.toBeNull();
    const links = [...el.querySelectorAll('nav[aria-label="Primary"] a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(links).toEqual([
      'Dashboard',
      'Skill Mastery',
      'Coding Challenges',
      'Web Development Challenges',
      'Enterprise Scenarios',
      'Company Interview Prep',
      'Job Role Preparation',
      'My Progress',
      'Account',
    ]);
    // Grouped: practice areas, then goal-oriented career preparation.
    const groups = [...el.querySelectorAll('nav[aria-label="Primary"] ul')].map((ul) => ({
      heading: ul.getAttribute('aria-labelledby')
        ? el.querySelector(`#${ul.getAttribute('aria-labelledby')}`)?.textContent?.trim()
        : undefined,
      links: [...ul.querySelectorAll('a')].map((a) => a.textContent?.trim()),
    }));
    expect(groups).toEqual([
      { heading: undefined, links: ['Dashboard'] },
      {
        heading: 'Practice',
        links: [
          'Skill Mastery',
          'Coding Challenges',
          'Web Development Challenges',
          'Enterprise Scenarios',
        ],
      },
      {
        heading: 'Career Preparation',
        links: ['Company Interview Prep', 'Job Role Preparation'],
      },
      { heading: 'You', links: ['My Progress', 'Account'] },
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
