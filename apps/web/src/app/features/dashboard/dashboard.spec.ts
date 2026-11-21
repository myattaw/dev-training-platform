import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestContent } from '../../../testing/content-fixtures';
import { ChallengeProgressService } from '../challenges/data-access/challenge-progress.service';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  beforeEach(() => localStorage.clear());

  async function setup(arrange?: (progress: ChallengeProgressService) => void) {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideTestContent()],
    }).compileComponents();
    arrange?.(TestBed.inject(ChallengeProgressService));
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows an empty Continue panel and easiest challenges first for a new visitor', async () => {
    const el = await setup();
    expect(el.textContent).toContain('Nothing in progress');
    const upNext = [...el.querySelectorAll('.up-next li a')].map((a) => a.textContent?.trim());
    expect(upNext).toEqual(['Pangram', 'Reverse String', 'Balanced Brackets']);
  });

  it('lists challenges with a saved draft under Continue', async () => {
    const el = await setup((progress) =>
      progress.saveDraft('merge-intervals', 'typescript', 'edited', 'starter'),
    );
    const continueLinks = [...el.querySelectorAll('.continue li a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(continueLinks).toEqual(['Merge Intervals']);
    expect(el.querySelector('.continue a')?.getAttribute('href')).toBe(
      '/challenges/merge-intervals/workspace',
    );
  });

  it('counts challenges by local status', async () => {
    const el = await setup((progress) =>
      progress.recordRun(
        'pangram',
        'typescript',
        { status: 'passed', results: [], logs: [], durationMs: 1 },
        10,
      ),
    );
    const values = Object.fromEntries(
      [...el.querySelectorAll('.summary > div')].map((d) => [
        d.querySelector('dt')?.textContent?.trim(),
        d.querySelector('dd')?.textContent?.trim(),
      ]),
    );
    expect(values).toEqual({
      Available: '4',
      'Visible tests passed': '1',
      'In progress': '0',
      'Not started': '3',
    });
  });
});
