import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProgressResponse } from '@pracstack/api-contracts';
import { provideTestContent } from '../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../testing/fake-api';
import { RuntimeConfigService } from '../../core/config/runtime-config';
import { ChallengeProgressService } from '../challenges/data-access/challenge-progress.service';
import { Dashboard } from './dashboard';

const progress: ProgressResponse = {
  technologyId: 'typescript',
  sqlComingSoon: [],
  skills: [
    {
      skillId: 'primitives',
      score: 100,
      tier: 5,
      mastered: true,
      attempts: 20,
      lastPracticedAt: '2026-01-01T10:00:00Z',
    },
    {
      skillId: 'unions',
      score: 42,
      tier: 3,
      mastered: false,
      attempts: 6,
      lastPracticedAt: '2026-01-02T10:00:00Z',
    },
  ],
};

describe('Dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  async function setup(
    options: {
      api?: FakeApiClient;
      signedOut?: boolean;
      arrange?: (progress: ChallengeProgressService) => void;
    } = {},
  ) {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideTestContent(), provideFakeApi(options.api)],
    }).compileComponents();
    if (options.signedOut) {
      TestBed.inject(RuntimeConfigService).set({
        auth: { mode: 'cognito', domain: 'https://auth.example.com', clientId: 'c' },
      });
    }
    options.arrange?.(TestBed.inject(ChallengeProgressService));
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const statValues = (el: HTMLElement) =>
    Object.fromEntries(
      [...el.querySelectorAll('.stat')].map((d) => [
        d.querySelector('dt')?.textContent?.trim(),
        d.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim(),
      ]),
    );

  it('shows signed-out visitors the landing page, not the dashboard', async () => {
    const el = await setup({ signedOut: true });
    expect(el.querySelector('h1')?.textContent).toContain('Get interview-ready');
    expect(el.textContent).toContain('Create a free account');
    expect(el.querySelector('.welcome')).toBeNull();
  });

  it('welcomes the learner with totals across challenges and skills', async () => {
    const el = await setup({
      api: new FakeApiClient().on('GET /skill-mastery/progress', () => progress),
    });
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Welcome back');
    expect(statValues(el)).toEqual({
      'Challenges solved': '0 / 4',
      'Skills mastered': '1 / 3',
      'Skills practiced': '2',
      'Questions answered': '26',
    });
  });

  it('shows each track with its progress and continues the last practiced skill', async () => {
    const el = await setup({
      api: new FakeApiClient().on('GET /skill-mastery/progress', () => progress),
    });
    const tracks = [...el.querySelectorAll('.track h3')].map((h) => h.textContent?.trim());
    expect(tracks).toEqual(['Coding Challenges', 'TypeScript']);
    const ts = el.querySelector('[data-track="typescript"]')!;
    expect(ts.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
    expect(ts.textContent).toContain('1 of 3 skills mastered');
    expect(ts.querySelector('a.btn')?.getAttribute('href')).toBe('/skills/typescript/unions');
  });

  it('offers to start a track that has not been practiced', async () => {
    const el = await setup({
      api: new FakeApiClient().on('GET /skill-mastery/progress', () => ({
        technologyId: 'typescript',
        skills: [],
      })),
    });
    const ts = el.querySelector('[data-track="typescript"]')!;
    expect(ts.textContent).toContain('0 of 3 skills mastered');
    expect(ts.querySelector('a.btn')?.textContent?.trim()).toBe('Start');
  });

  it('shows an empty Continue panel and easiest challenges first for a new visitor', async () => {
    const el = await setup();
    expect(el.textContent).toContain('Nothing in progress');
    const upNext = [...el.querySelectorAll('.up-next li a')].map((a) => a.textContent?.trim());
    expect(upNext).toEqual(['Pangram', 'Reverse String', 'Balanced Brackets']);
  });

  it('lists challenges with a saved draft under Continue, and continues them from the track', async () => {
    const el = await setup({
      arrange: (p) => p.saveDraft('merge-intervals', 'typescript', 'edited', 'starter'),
    });
    const continueLinks = [...el.querySelectorAll('.continue li a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(continueLinks).toEqual(['Merge Intervals']);
    expect(el.querySelector('.continue a')?.getAttribute('href')).toBe(
      '/challenges/merge-intervals/workspace',
    );
    const challengeTrack = el.querySelector('.track a.btn');
    expect(challengeTrack?.textContent?.trim()).toBe('Continue: Merge Intervals');
  });
});
