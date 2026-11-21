import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestContent } from '../../../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../../../testing/fake-api';
import { ChallengeCatalog } from './challenge-catalog';

describe('ChallengeCatalog', () => {
  beforeEach(() => localStorage.clear());

  async function setup(
    params: { q?: string; difficulty?: string; category?: string } = {},
    failure?: Error,
    api: FakeApiClient = new FakeApiClient(),
  ) {
    await TestBed.configureTestingModule({
      imports: [ChallengeCatalog],
      providers: [provideRouter([]), provideTestContent(undefined, failure), provideFakeApi(api)],
    }).compileComponents();
    const fixture = TestBed.createComponent(ChallengeCatalog);
    for (const [key, value] of Object.entries(params)) fixture.componentRef.setInput(key, value);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const names = () =>
      [...el.querySelectorAll('tbody td.name a')].map((a) => a.textContent?.trim());
    return { el, names };
  }

  it('lists every challenge by default', async () => {
    const { names } = await setup();
    expect(names()).toEqual(['Pangram', 'Reverse String', 'Balanced Brackets', 'Merge Intervals']);
  });

  it('filters by search text across title, summary and tags', async () => {
    expect((await setup({ q: 'reverse' })).names()).toEqual(['Reverse String']);
    TestBed.resetTestingModule();
    expect((await setup({ q: 'stacks' })).names()).toEqual(['Balanced Brackets']);
  });

  it('combines difficulty and category filters', async () => {
    const { names } = await setup({ difficulty: 'medium', category: 'arrays' });
    expect(names()).toEqual(['Merge Intervals']);
  });

  it('ignores unknown filter values from the URL', async () => {
    const { names } = await setup({ difficulty: 'impossible' });
    expect(names()).toHaveLength(4);
  });

  it('shows an empty state when nothing matches', async () => {
    const { el, names } = await setup({ q: 'no such challenge' });
    expect(names()).toEqual([]);
    expect(el.textContent).toContain('No challenges match the current filters.');
  });

  it('shows local status per challenge', async () => {
    const { el } = await setup();
    expect(el.querySelector('tbody app-challenge-status')?.textContent).toContain('Not started');
  });

  it('shows an error with a retry button when the catalog cannot load', async () => {
    const { el, names } = await setup({}, new Error('Content request failed (503).'));
    expect(names()).toEqual([]);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Content request failed (503).',
    );
    expect(el.querySelector('[role="alert"] button')?.textContent).toContain('Try again');
  });

  it('shows "Solved" for challenges solved by a server-graded submission', async () => {
    const api = new FakeApiClient().on('GET /challenges/progress', () => ({
      challenges: [
        {
          challengeId: 'reverse-string',
          solved: true,
          attempts: 2,
          lastSubmittedAt: '2026-11-21T10:00:00Z',
          languagesSolved: ['java'],
        },
      ],
    }));
    const { el } = await setup({}, undefined, api);
    await new Promise((r) => setTimeout(r));
    const statuses = [...el.querySelectorAll('tbody tr')].map((tr) => [
      tr.querySelector('.name a')?.textContent?.trim(),
      tr.querySelector('app-challenge-status')?.textContent?.trim(),
    ]);
    expect(statuses).toContainEqual(['Reverse String', 'Solved']);
    expect(statuses).toContainEqual(['Pangram', 'Not started']);
  });
});
