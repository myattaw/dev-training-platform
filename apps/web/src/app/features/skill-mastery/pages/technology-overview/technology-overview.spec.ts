import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProgressResponse } from '@pracstack/api-contracts';
import { provideTestContent } from '../../../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../../../testing/fake-api';
import { TechnologyOverview } from './technology-overview';

async function setup(api: FakeApiClient, technologyId = 'typescript') {
  await TestBed.configureTestingModule({
    imports: [TechnologyOverview],
    providers: [provideRouter([]), provideTestContent(), provideFakeApi(api)],
  }).compileComponents();
  const fixture = TestBed.createComponent(TechnologyOverview);
  fixture.componentRef.setInput('technologyId', technologyId);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const progress: ProgressResponse = {
  technologyId: 'typescript',
  skills: [
    { skillId: 'primitives', score: 100, tier: 5, mastered: true, attempts: 20 },
    { skillId: 'unions', score: 42, tier: 3, mastered: false, attempts: 6 },
  ],
};

describe('TechnologyOverview', () => {
  it('lists topics and skills with the learner’s scores and status', async () => {
    const el = await setup(new FakeApiClient().on('GET /skill-mastery/progress', () => progress));
    const topics = [...el.querySelectorAll('app-panel h2')].map((h) => h.textContent?.trim());
    expect(topics).toEqual(['Basics', 'Narrowing']);

    const rows = [...el.querySelectorAll('tbody tr')].map((tr) => ({
      name: tr.querySelector('.name a')?.textContent?.trim(),
      score: tr.querySelector('[role="meter"]')?.getAttribute('aria-valuenow'),
      status: tr.querySelector('app-skill-status')?.textContent?.trim(),
      action: tr.querySelector('.action a')?.textContent?.trim().split(/\s+/)[0],
    }));
    expect(rows).toEqual([
      { name: 'Primitive types', score: '100', status: 'Mastered', action: 'Continue' },
      { name: 'Union types', score: '42', status: 'In progress', action: 'Continue' },
      { name: 'typeof narrowing', score: '0', status: 'Not started', action: 'Practice' },
    ]);
    expect(el.textContent).toContain('1 of 3 skills mastered');
  });

  it('still lists skills when progress cannot be loaded, with a warning', async () => {
    const el = await setup(new FakeApiClient());
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(el.querySelector('app-alert')?.textContent).toContain(
      'Your progress could not be loaded',
    );
  });

  it('shows not found for an unknown technology', async () => {
    const el = await setup(new FakeApiClient(), 'cobol');
    expect(el.textContent).toContain('Technology not found');
  });
});
