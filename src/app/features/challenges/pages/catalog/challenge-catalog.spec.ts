import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChallengeCatalog } from './challenge-catalog';

describe('ChallengeCatalog', () => {
  beforeEach(() => localStorage.clear());

  async function setup(params: { q?: string; difficulty?: string; category?: string } = {}) {
    await TestBed.configureTestingModule({
      imports: [ChallengeCatalog],
      providers: [provideRouter([])],
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
});
