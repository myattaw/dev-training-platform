import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProgressResponse } from '@pracstack/api-contracts';
import { provideTestContent } from '../../../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../../../testing/fake-api';
import { TechnologyCatalog } from './technology-catalog';

async function setup(api: FakeApiClient = new FakeApiClient()) {
  await TestBed.configureTestingModule({
    imports: [TechnologyCatalog],
    providers: [provideRouter([]), provideTestContent(), provideFakeApi(api)],
  }).compileComponents();
  const fixture = TestBed.createComponent(TechnologyCatalog);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const empty: ProgressResponse = { technologyId: 'typescript', skills: [] };
const practised: ProgressResponse = {
  technologyId: 'typescript',
  skills: [
    {
      skillId: 'unions',
      score: 42,
      tier: 3,
      mastered: false,
      attempts: 6,
      lastPracticedAt: '2026-11-20T10:00:00Z',
    },
    { skillId: 'primitives', score: 100, tier: 5, mastered: true, attempts: 20 },
  ],
};

describe('TechnologyCatalog', () => {
  it('groups technologies into sections from their category, as compact cards', async () => {
    const { el } = await setup(new FakeApiClient().on('GET /skill-mastery/progress', () => empty));
    const sections = [...el.querySelectorAll('section.category h2')].map((h) =>
      h.textContent?.trim(),
    );
    expect(sections).toEqual(['Programming languages']);
    const card = el.querySelector('a.card[data-technology="typescript"]')!;
    expect(card.getAttribute('aria-label')).toBe('View TypeScript skills');
    expect(card.textContent).toContain('3 skills');
    // No long description on the card.
    expect(card.textContent).not.toContain('Types for JavaScript');
  });

  it('shows real progress, and recently practised skills under Continue learning', async () => {
    const { el } = await setup(
      new FakeApiClient().on('GET /skill-mastery/progress', () => practised),
    );
    const card = el.querySelector('a.card[data-technology="typescript"]')!;
    expect(card.textContent).toContain('1 mastered');
    expect(card.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
    const recent = [...el.querySelectorAll('.continue .recent-name')].map((n) =>
      n.textContent?.trim(),
    );
    // Only skills with a practice date, most recent first.
    expect(recent).toEqual(['Union types']);
  });

  it('has no Continue learning section without practice', async () => {
    const { el } = await setup(new FakeApiClient().on('GET /skill-mastery/progress', () => empty));
    expect(el.querySelector('.continue')).toBeNull();
  });

  it('searches every section and hides sections with no match', async () => {
    const { fixture, el } = await setup(
      new FakeApiClient().on('GET /skill-mastery/progress', () => empty),
    );
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'no such technology';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelectorAll('section.category')).toHaveLength(0);
    expect(el.textContent).toContain('No technologies match your search');

    search.value = 'type';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelectorAll('a.card')).toHaveLength(1);
  });
});
