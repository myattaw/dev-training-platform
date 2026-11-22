import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CompanyDetailResponse,
  CompanyListResponse,
  RecommendationsResponse,
} from '@pracstack/api-contracts';
import { provideTestContent } from '../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../testing/fake-api';
import { batchDrafts } from '../account/data-access/account-api';
import { CompanyCatalog } from './pages/catalog/company-catalog';
import { CompanyDetail } from './pages/detail/company-detail';
import { Countdown, remainingMs } from './ui/countdown';
import { formatDate, formatDuration, formatMinutes, formatMonth } from './ui/labels';

const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

const LIST: CompanyListResponse = {
  companies: [
    {
      slug: 'liberty-mutual',
      displayName: 'Liberty Mutual',
      aliases: ['Liberty Mutual Insurance'],
      questionCount: 1,
      saved: false,
    },
    {
      slug: 'paypal',
      displayName: 'PayPal',
      aliases: [],
      questionCount: 5,
      sourceQuestionCount: 103,
      saved: true,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
  letters: ['L', 'P'],
};

const DETAIL: CompanyDetailResponse = {
  company: {
    slug: 'liberty-mutual',
    displayName: 'Liberty Mutual',
    aliases: [],
    questionCount: 1,
    saved: false,
  },
  sources: [
    {
      id: 'lc-companywise',
      name: 'Dataset',
      url: 'https://github.com/example/dataset',
      provider: 'LeetCode',
      providerUrl: 'https://leetcode.com',
      snapshotDate: '2026-07-12',
      licenseStatus: 'unverified',
    },
  ],
  questions: [
    {
      id: 'lc-companywise:2296',
      title: 'Design a Text Editor',
      difficulty: 'hard',
      provider: 'LeetCode',
      externalId: '2296',
      externalUrl: 'https://leetcode.com/problems/design-a-text-editor',
      sourceId: 'lc-companywise',
      acceptanceRate: 51.1,
      windows: [{ window: 'all', reportedFrequency: 100 }],
      relatedChallenges: [{ id: 'text-cursor-buffer', title: 'Text Buffer with a Cursor' }],
      status: 'not-started',
    },
  ],
  progress: {
    status: 'not-started',
    questionsTotal: 1,
    questionsReviewed: 0,
    questionsSolvedExternally: 0,
    practiceTotal: 1,
    practiceSolved: 0,
    timedSessionsCompleted: 0,
  },
  preparationPaths: [],
};

const RECS: RecommendationsResponse = {
  plan: 'free',
  recommendations: [
    {
      challengeId: 'text-cursor-buffer',
      title: 'Text Buffer with a Cursor',
      summary: 'Build a buffer.',
      difficulty: 'medium',
      category: 'data-structures',
      reason: 'Practises cursor state management.',
      competencies: ['cursor state management'],
      confidence: 'high',
      origin: 'curated',
      access: 'free',
      availability: 'available',
      locked: false,
      solved: false,
    },
    {
      challengeId: 'piece-table-editor',
      title: 'Piece Table Text Buffer',
      summary: 'A planned challenge.',
      difficulty: 'hard',
      category: 'data-structures',
      reason: 'Practises an efficient text buffer.',
      competencies: [],
      confidence: 'medium',
      origin: 'curated',
      access: 'pro',
      availability: 'coming-soon',
      locked: true,
      solved: false,
    },
  ],
};

describe('CompanyCatalog', () => {
  async function setup(api: FakeApiClient) {
    await TestBed.configureTestingModule({
      imports: [CompanyCatalog],
      providers: [provideRouter([]), provideTestContent(), provideFakeApi(api)],
    }).compileComponents();
    const fixture = TestBed.createComponent(CompanyCatalog);
    fixture.componentRef.setInput('q', 'liberty');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('searches on the server and shows counts, aliases, samples and saved state', async () => {
    const api = new FakeApiClient()
      .on('GET /companies', () => LIST)
      .on('GET /me/companies', () => ({ companies: [] }));
    const el = await setup(api);
    expect(api.calls.find((c) => c.route === 'GET /companies')?.input).toEqual({ q: 'liberty' });
    const rows = [...el.querySelectorAll('table[aria-labelledby="companies-heading"] tbody tr')];
    expect(rows.map((r) => text(r.querySelector('.name a')))).toEqual(['Liberty Mutual', 'PayPal']);
    expect(text(rows[0])).toContain('Also: Liberty Mutual Insurance');
    expect(text(rows[1])).toContain('5 (sample of 103)');
    expect(rows[1]?.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(text(el.querySelector('.match-count'))).toBe('2 companies');
  });

  it('disables letters with no companies', async () => {
    const api = new FakeApiClient()
      .on('GET /companies', () => LIST)
      .on('GET /me/companies', () => ({ companies: [] }));
    const el = await setup(api);
    const letter = (l: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.letter')].find((b) => text(b) === l);
    expect(letter('L')?.disabled).toBe(false);
    expect(letter('Z')?.disabled).toBe(true);
  });

  it('shows the affiliation disclaimer', async () => {
    const api = new FakeApiClient()
      .on('GET /companies', () => LIST)
      .on('GET /me/companies', () => ({ companies: [] }));
    const el = await setup(api);
    expect(text(el.querySelector('app-not-affiliated'))).toContain('not affiliated with');
  });
});

describe('CompanyDetail', () => {
  async function setup() {
    const api = new FakeApiClient()
      .on('GET /companies/liberty-mutual', () => DETAIL)
      .on('GET /companies/liberty-mutual/recommendations', () => RECS)
      .on('GET /interview-sessions', () => ({ sessions: [] }));
    await TestBed.configureTestingModule({
      imports: [CompanyDetail],
      providers: [provideRouter([]), provideTestContent(), provideFakeApi(api)],
    }).compileComponents();
    const fixture = TestBed.createComponent(CompanyDetail);
    fixture.componentRef.setInput('slug', 'liberty-mutual');
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, api };
  }

  it('shows reported questions as external references, with an explained frequency', async () => {
    const { el } = await setup();
    const row = el.querySelector('table[aria-labelledby="questions-heading"] tbody tr');
    expect(text(row)).toContain('Design a Text Editor');
    expect(text(row)).toContain('All time (100)');
    const external = row?.querySelector<HTMLAnchorElement>('a.external');
    expect(external?.href).toBe('https://leetcode.com/problems/design-a-text-editor');
    expect(external?.rel).toBe('noopener noreferrer');
    expect(text(el.querySelector('.source-note'))).toContain('Source snapshot: July 2026');
    expect(text(el.querySelector('.source-note'))).toContain('It is not the chance of being asked');
  });

  it('links available practice and shows locked Pro previews with no link or start button', async () => {
    const { el } = await setup();
    const [free, pro] = [...el.querySelectorAll('.rec')];
    expect(free?.querySelector('.rec-title a')?.textContent?.trim()).toBe(
      'Text Buffer with a Cursor',
    );
    expect(text(free?.querySelector('.rec-status'))).toBe('Practise');
    expect(pro?.classList).toContain('locked');
    expect(pro?.querySelectorAll('a')).toHaveLength(0);
    expect(pro?.querySelectorAll('button')).toHaveLength(0);
    expect(text(pro)).toContain('Coming soon');
    expect(text(pro)).toContain('Not available yet');
    expect(text(el.querySelector('.pro-note'))).toContain('nothing can be bought today');
  });

  it('saves the learner’s mark on a reported question', async () => {
    const { el, api } = await setup();
    api.on('PUT /me/companies/liberty-mutual/questions/lc-companywise%3A2296', () => ({
      status: 'reviewed-externally',
    }));
    const select = el.querySelector<HTMLSelectElement>('tbody select');
    if (!select) throw new Error('no select');
    select.value = 'reviewed-externally';
    select.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r));
    expect(api.calls.map((c) => c.route)).toContain(
      'PUT /me/companies/liberty-mutual/questions/lc-companywise%3A2296',
    );
  });
});

describe('Countdown', () => {
  it('computes the time left from the deadline, never below zero', () => {
    const deadline = '2026-11-22T10:30:00.000Z';
    expect(remainingMs(deadline, Date.parse('2026-11-22T10:00:00.000Z'))).toBe(30 * 60_000);
    expect(remainingMs(deadline, Date.parse('2026-11-22T11:00:00.000Z'))).toBe(0);
  });

  it('shows the deadline with the server clock offset, and announces only thresholds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-22T10:00:00.000Z'));
      await TestBed.configureTestingModule({ imports: [Countdown] }).compileComponents();
      const fixture = TestBed.createComponent(Countdown);
      // The browser's clock is 60 s behind the server's.
      fixture.componentRef.setInput('deadline', '2026-11-22T10:12:00.000Z');
      fixture.componentRef.setInput('clockOffsetMs', 60_000);
      let expired = 0;
      fixture.componentInstance.expired.subscribe(() => expired++);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const live = () => text(el.querySelector('[aria-live]'));
      expect(text(el.querySelector('[role="timer"]'))).toBe('11:00');
      expect(live()).toBe('');

      // A throttled tab: one late tick still shows the right time.
      vi.setSystemTime(new Date('2026-11-22T10:01:30.000Z'));
      vi.advanceTimersByTime(1000);
      await fixture.whenStable();
      expect(text(el.querySelector('[role="timer"]'))).toBe('9:29');
      expect(live()).toBe('10 minutes left.');

      vi.setSystemTime(new Date('2026-11-22T10:11:00.000Z'));
      vi.advanceTimersByTime(1000);
      await fixture.whenStable();
      expect(text(el.querySelector('[role="timer"]'))).toBe("Time's up");
      expect(live()).toBe('Time is up. The session has ended.');
      expect(expired).toBe(1);

      vi.advanceTimersByTime(5000);
      await fixture.whenStable();
      expect(expired).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('labels and batching', () => {
  it('formats dates, months and durations', () => {
    expect(formatDate('2026-07-12')).toBe('12 July 2026');
    expect(formatMonth('2026-07-12')).toBe('July 2026');
    expect(formatDuration(3909)).toBe('1:05:09');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatMinutes(600)).toBe('10 min');
    expect(formatMinutes(3900)).toBe('1 h 5 min');
  });

  it('splits draft imports into batches below the request size limit', () => {
    const draft = (n: number, size: number) => ({
      challengeId: `c${n}`,
      language: 'typescript' as const,
      code: 'x'.repeat(size),
      updatedAt: '2026-11-22T10:00:00.000Z',
    });
    // 70 000 characters is over the 64 KB code limit, so that draft is skipped (the API would refuse it).
    const batches = batchDrafts([
      draft(1, 60_000),
      draft(2, 60_000),
      draft(3, 60_000),
      draft(4, 60_000),
      draft(5, 70_000),
    ]);
    expect(batches.map((batch) => batch.map((d) => d.challengeId))).toEqual([
      ['c1', 'c2', 'c3'],
      ['c4'],
    ]);
  });
});
