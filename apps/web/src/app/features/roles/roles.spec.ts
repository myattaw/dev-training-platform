import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  ChallengeProgressResponse,
  PreparationResponse,
  ProgressResponse,
  SavedPlan,
} from '@pracstack/api-contracts';
import { type ActivityRef, addDays } from '@pracstack/content-model';
import { provideTestContent } from '../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../testing/fake-api';
import { activityStatus, pathProgress, type ProgressData } from './data-access/role-progress';
import { localToday } from './data-access/study-plan';
import { JobAnalyzer } from './pages/analyze/job-analyzer';
import { SavedPlanPage } from './pages/plan/saved-plan';
import { RoleCatalog } from './pages/catalog/role-catalog';
import { RoleDetail } from './pages/detail/role-detail';

const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
const settle = () => new Promise((r) => setTimeout(r));

const NOTHING_SAVED: PreparationResponse = { targetRoleId: null, plans: [] };

const SKILL_PROGRESS: ProgressResponse = {
  technologyId: 'typescript',
  sqlComingSoon: [],
  skills: [
    { skillId: 'primitives', score: 90, tier: 4, mastered: true, attempts: 12 },
    { skillId: 'unions', score: 40, tier: 2, mastered: false, attempts: 4 },
  ],
};

const CHALLENGE_PROGRESS: ChallengeProgressResponse = {
  challenges: [
    {
      challengeId: 'pangram',
      solved: true,
      attempts: 2,
      lastSubmittedAt: '2026-11-22T10:00:00.000Z',
      languagesSolved: ['typescript'],
    },
    {
      challengeId: 'merge-intervals',
      solved: false,
      attempts: 1,
      lastSubmittedAt: '2026-11-22T10:00:00.000Z',
      languagesSolved: [],
    },
  ],
};

function api(preparation: PreparationResponse = NOTHING_SAVED): FakeApiClient {
  return new FakeApiClient()
    .on('GET /me/preparation', () => preparation)
    .on('GET /skill-mastery/progress', () => SKILL_PROGRESS)
    .on('GET /challenges/progress', () => CHALLENGE_PROGRESS);
}

async function render<T>(component: Type<T>, fake: FakeApiClient, inputs = {}) {
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [provideRouter([]), provideTestContent(), provideFakeApi(fake)],
  }).compileComponents();
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  await settle();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('RoleCatalog', () => {
  it('lists roles with status badges and practice coverage, highlighting the target role', async () => {
    const { el } = await render(RoleCatalog, api({ targetRoleId: 'ts-developer', plans: [] }));
    const rows = [...el.querySelectorAll('table[aria-labelledby="roles-heading"] tbody tr')];
    expect(rows.map((r) => text(r.querySelector('.name a')))).toEqual([
      'TypeScript Developer',
      'SQL Server Developer',
    ]);
    expect(text(rows[0])).toContain('3 of 4 competencies');
    expect(text(rows[0])).toContain('Available');
    expect(text(rows[0])).toContain('Your target');
    expect(rows[0]?.classList).toContain('target');
    expect(text(rows[1])).toContain('Coming soon');
    expect(text(rows[1])).toContain('No path yet');
    expect(text(rows[1])).toContain('SQL Server, TypeScript');
    expect(text(el.querySelector('app-alert'))).toContain('Your target role');
  });

  it('filters by technology and search text from the URL', async () => {
    const { el } = await render(RoleCatalog, api(), { tech: 'sql-server' });
    const names = () => [...el.querySelectorAll('tbody .name a')].map((a) => text(a));
    expect(names()).toEqual(['SQL Server Developer']);
    expect(text(el.querySelector('.match-count'))).toBe('1 role');
    const options = [...el.querySelectorAll('select option')].map((o) => text(o));
    expect(options).toEqual(['Any technology', 'SQL Server', 'TypeScript']);
  });

  it('searches titles, summaries and technology names', async () => {
    const { el } = await render(RoleCatalog, api(), { q: 'typed front' });
    expect([...el.querySelectorAll('tbody .name a')].map((a) => text(a))).toEqual([
      'TypeScript Developer',
    ]);
  });

  it('lists saved plans with their technologies', async () => {
    const { el } = await render(
      RoleCatalog,
      api({
        targetRoleId: null,
        plans: [
          {
            id: '6d1f5e9a-1c35-4a8b-9a51-1d8f0d5c3b11',
            title: 'Claims team',
            termIds: ['csharp', 'sql-server'],
            createdAt: '2026-11-23T10:00:00.000Z',
          },
        ],
      }),
    );
    const row = el.querySelector('table[aria-labelledby="plans-heading"] tbody tr');
    expect(text(row)).toContain('Claims team');
    expect(text(row)).toContain('C#, SQL Server');
    expect(text(row)).toContain('23 November 2026');
  });
});

describe('RoleDetail', () => {
  it('shows competencies in order, with links, statuses and honest gaps', async () => {
    const { el } = await render(RoleDetail, api(), { roleId: 'ts-developer' });
    const competencies = [...el.querySelectorAll('.competency')];
    expect(competencies.map((c) => text(c.querySelector('.competency-name')))).toEqual([
      '1Basics',
      '2Narrowing',
      '3Problem solving',
      '4Testing',
    ]);
    const basics = competencies[0];
    const links = [...(basics?.querySelectorAll('a') ?? [])];
    expect(links.map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['Primitive types', '/skills/typescript/primitives'],
      ['Union types', '/skills/typescript/unions'],
    ]);
    expect(text(basics)).toContain('Mastered');
    expect(text(basics)).toContain('Practiced, not mastered');
    const problems = competencies[2];
    expect(text(problems)).toContain('Coding challenge · TypeScript');
    expect(problems?.querySelector('a')?.getAttribute('href')).toBe(
      '/challenges/pangram/workspace',
    );
    expect(text(problems)).toContain('Solved');
    expect(text(problems)).toContain('Attempted, not solved');
    expect(text(competencies[3])).toContain('No practice on PracStack yet');
  });

  it('shows separate progress counts, never a single readiness score', async () => {
    const { el } = await render(RoleDetail, api(), { roleId: 'ts-developer' });
    const progress = [...el.querySelectorAll('.progress > div')]
      .map((d) => `${text(d.querySelector('dt'))} ${text(d.querySelector('dd'))}`)
      .join(' | ');
    expect(progress).toContain('Content coverage 3 of 4 competencies have practice on PracStack');
    expect(progress).toContain('Skills mastered 1 of 3');
    expect(progress).toContain('Skills practiced, not yet mastered 1');
    expect(progress).toContain('Skills not yet assessed 1');
    expect(progress).toContain('Challenges solved 1 of 2');
    expect(el.textContent).not.toMatch(/readiness|ready for the job|%/i);
    expect(text(el.querySelector('app-experience-note'))).toContain('not professional experience');
  });

  it('suggests the first activity that is not mastered or solved', async () => {
    const { el } = await render(RoleDetail, api(), { roleId: 'ts-developer' });
    const panel = [...el.querySelectorAll('app-panel')].find((p) =>
      text(p.querySelector('h2'))?.startsWith('Suggested next activity'),
    );
    expect(text(panel?.querySelector('.next-title'))).toBe('Union types');
    expect(text(panel)).toContain('TypeScript skill · Basics');
  });

  it('sets and removes the target role', async () => {
    let target: string | null = null;
    const fake = api()
      .on('GET /me/preparation', () => ({ targetRoleId: target, plans: [] }))
      .on('PUT /me/preparation/target-role', (body) => {
        target = (body as { roleId: string | null }).roleId;
        return { targetRoleId: target, plans: [] };
      });
    const { el, fixture } = await render(RoleDetail, fake, { roleId: 'ts-developer' });
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label);
    button('Set as my target role')?.click();
    await settle();
    await fixture.whenStable();
    expect(fake.calls.find((c) => c.route === 'PUT /me/preparation/target-role')?.input).toEqual({
      roleId: 'ts-developer',
    });
    expect(text(el.querySelector('[headerBadge]'))).toContain('Your target role');
    button('Remove as target')?.click();
    await settle();
    await fixture.whenStable();
    expect(target).toBeNull();
  });

  it('explains a coming-soon role and links related practice through its technologies', async () => {
    const { el } = await render(RoleDetail, api(), { roleId: 'sql-developer' });
    expect(text(el.querySelector('h1'))).toBe('SQL Server Developer');
    expect(text(el)).toContain('There is no preparation path for this role yet');
    expect(text(el)).toContain('Related practice available now');
    expect([...el.querySelectorAll('app-activity-list a')].map((a) => text(a))).toEqual([
      'Primitive types',
      'Union types',
    ]);
    expect(el.querySelector('.competency')).toBeNull();
    expect([...el.querySelectorAll('button')].map((b) => text(b))).not.toContain(
      'Set as my target role',
    );
  });

  it('shows a not-found state for unknown roles', async () => {
    const { el } = await render(RoleDetail, api(), { roleId: 'nope' });
    expect(text(el)).toContain('Role not found');
  });
});

describe('JobAnalyzer', () => {
  const POSTING = [
    'Platform engineer',
    '',
    'Requirements:',
    '- 4+ years of experience with C# and TypeScript.',
    '- SQL Server (T-SQL) and ADO pipelines.',
    '- Power Automate (formerly Microsoft Flow) is a plus.',
  ].join('\n');

  const click = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label)?.click();

  async function analyze(fake = api(), posting = POSTING) {
    const result = await render(JobAnalyzer, fake);
    const textarea = result.el.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('no textarea');
    textarea.value = posting;
    textarea.dispatchEvent(new Event('input'));
    click(result.el, 'Analyze');
    await result.fixture.whenStable();
    await settle();
    await result.fixture.whenStable();
    return { ...result, fake };
  }

  async function openTab(el: HTMLElement, fixture: { whenStable(): Promise<unknown> }, id: string) {
    el.querySelector<HTMLButtonElement>(`#results-tab-${id}`)?.click();
    await fixture.whenStable();
  }

  it('says the posting is analyzed in the browser and not sent', async () => {
    const { el } = await render(JobAnalyzer, api());
    expect(text(el.querySelector('app-alert'))).toContain(
      'Analyzed in your browser; the posting is not sent to PracStack',
    );
    expect(el.querySelector('textarea')?.getAttribute('spellcheck')).toBe('false');
  });

  it('collapses the posting after analysis, and editing it marks the results stale', async () => {
    const { el, fixture } = await analyze();
    expect(el.querySelector('textarea')).toBeNull();
    expect(text(el)).toContain('Job description analyzed');
    click(el, 'Edit job description');
    await fixture.whenStable();
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.value).toContain('Platform engineer');
    textarea.value = `${textarea.value}\n- Kubernetes`;
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(text(el)).toContain('The job description changed');
    expect(el.querySelector('app-study-plan-view')).toBeNull();
    click(el, 'Analyze');
    await fixture.whenStable();
    expect(el.querySelector('app-study-plan-view')).not.toBeNull();
  });

  it('shows the study plan first, with a summary of coverage', async () => {
    const { el } = await analyze();
    expect(el.querySelector('#results-tab-plan')?.getAttribute('aria-selected')).toBe('true');
    const stat = (label: string) =>
      text(
        [...el.querySelectorAll('.stat')]
          .find((d) => text(d.querySelector('dt')) === label)
          ?.querySelector('dd'),
      );
    expect(stat('Requirements to prepare')).toBe('5');
    expect(stat('Direct practice')).toBe('2');
    expect(stat('Partly or related')).toBe('1');
    expect(stat('Not covered')).toBe('2');
    // Without a date: a prioritized path, most important first.
    expect(text(el.querySelector('.budget'))).toContain('Add an interview date');
    // Progress counts: the solved challenge is done, the mastered skill becomes a final review.
    const keys = [...el.querySelectorAll('.item')].map((i) => i.getAttribute('data-key'));
    expect(keys).toEqual([
      'external:sql-server',
      'external:azure-devops',
      'skill:unions',
      'external:power-automate',
      'skill:primitives',
    ]);
    expect(text(el.querySelector('details.extra'))).toContain('Already done (1)');
    expect(text(el.querySelector('[data-key="skill:unions"]'))).toContain('Developing mastery');
    // Not covered at all: kept as external study with its reason.
    expect(text(el.querySelector('[data-key="external:azure-devops"]'))).toContain(
      'Not covered by PracStack: Pipelines are not practiced.',
    );
  });

  it('fits the schedule into the interview date and daily time', async () => {
    const { el, fixture } = await analyze();
    click(el, 'In 3 days');
    click(el, '30 min');
    await fixture.whenStable();
    const days = [...el.querySelectorAll('.day')];
    expect(days).toHaveLength(3);
    expect(text(el.querySelector('.budget'))).toContain('available (3 days × 30 min)');
    for (const day of days) {
      const minutes = [...day.querySelectorAll('.item-meta')]
        .map((m) => Number(/^(\d+) min/.exec(text(m) ?? '')?.[1] ?? 0))
        .reduce((a, b) => a + b, 0);
      expect(minutes).toBeLessThanOrEqual(30);
    }
  });

  it('lists requirements with level, priority and coverage; evidence is collapsed', async () => {
    const { el, fixture } = await analyze();
    await openTab(el, fixture, 'requirements');
    const row = (id: string) => el.querySelector(`tr[data-term="${id}"]`);
    expect(text(row('csharp'))).toContain('Required');
    expect(text(row('csharp'))).toContain('High priority');
    expect(text(row('csharp'))).toContain('Hands-on practice');
    expect(text(row('power-automate'))).toContain('Preferred');
    expect(text(row('power-automate'))).toContain('Medium priority');
    expect(text(row('azure-devops'))).toContain('Ambiguous');
    expect(row('csharp')?.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(text(row('csharp')?.querySelector('details'))).toContain(
      '4+ years of experience with C# and TypeScript.',
    );
    expect(text(row('csharp')?.querySelector('details'))).toContain('high confidence');
    expect(text(el)).toContain('PracStack cannot verify degrees, years of experience');
  });

  it('explains coverage gaps: why, related practice, what is not covered, where to study', async () => {
    const { el, fixture } = await analyze();
    await openTab(el, fixture, 'gaps');
    const gap = el.querySelector('.gap[data-term="sql-server"]');
    expect(text(gap)).toContain('Related practice only');
    expect(text(gap)).toContain('Required in the posting');
    expect(text(gap)).toContain('Union types');
    expect(text(gap)).toContain('T-SQL is not practiced.');
    const link = gap?.querySelector<HTMLAnchorElement>('a[href^="https://"]');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('lets the learner choose between alternatives', async () => {
    const { el, fixture } = await analyze(api(), 'Requirements:\n- C# or TypeScript');
    await openTab(el, fixture, 'requirements');
    expect(text(el.querySelector('.alternatives'))).toContain('One of: C#, TypeScript');
    const select = el.querySelector<HTMLSelectElement>('.alternatives select')!;
    expect(select.value).toBe('csharp');
    select.value = 'typescript';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(text(el.querySelector('tr[data-term="csharp"]'))).toContain('Not in the plan');
    expect(text(el.querySelector('tr[data-term="typescript"]'))).toContain('High priority');
  });

  it('never sends the posting: a saved plan holds requirements, settings, keys and marks only', async () => {
    const fake = api().on('POST /me/preparation/plans', (body) => ({
      id: '6d1f5e9a-1c35-4a8b-9a51-1d8f0d5c3b11',
      createdAt: '2026-11-23T10:00:00.000Z',
      ...(body as object),
    }));
    const { el, fixture } = await analyze(fake);
    click(el, 'In 1 week');
    await fixture.whenStable();
    click(el, 'Save plan');
    await settle();
    await fixture.whenStable();
    const save = fake.calls.find((c) => c.route === 'POST /me/preparation/plans');
    const input = save?.input as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual([
      'done',
      'requirements',
      'schedule',
      'settings',
      'skipped',
      'termIds',
      'title',
    ]);
    expect(input['termIds']).toEqual([
      'csharp',
      'typescript',
      'sql-server',
      'azure-devops',
      'power-automate',
    ]);
    for (const call of fake.calls) {
      const sent = JSON.stringify(call.input ?? null);
      expect(sent).not.toContain('years of experience');
      expect(sent).not.toContain('Platform engineer');
    }
    expect(text(el)).toContain('Plan saved');
  });

  it('explains empty input', async () => {
    const { el, fixture } = await render(JobAnalyzer, api());
    click(el, 'Analyze');
    await fixture.whenStable();
    expect(text(el)).toContain('Nothing to analyze yet');
  });
});

describe('pathProgress', () => {
  const skill = (skillId: string): ActivityRef => ({ kind: 'skill', skillId });
  const groups = [
    { activities: [skill('a'), skill('b')] },
    { activities: [] },
    {
      activities: [
        { kind: 'challenge', challengeId: 'c', language: 'csharp' } as ActivityRef,
        { kind: 'scenario', scenarioId: 's' } as ActivityRef,
      ],
    },
  ];

  it('counts coverage, skills and challenges separately and finds the next activity', () => {
    const data: ProgressData = {
      skills: new Map([
        ['a', { skillId: 'a', score: 95, tier: 5, mastered: true, attempts: 9 }],
        ['b', { skillId: 'b', score: 95, tier: 5, mastered: true, attempts: 9 }],
      ]),
      challenges: new Map([
        [
          'c',
          {
            challengeId: 'c',
            solved: true,
            attempts: 1,
            lastSubmittedAt: 't',
            languagesSolved: ['java'],
          },
        ],
      ]),
    };
    // Solved in Java does not count for a C# activity.
    expect(pathProgress(groups, data)).toEqual({
      competenciesWithPractice: 2,
      competencies: 3,
      skills: { total: 2, mastered: 2, practiced: 0, notAssessed: 0 },
      challenges: { total: 1, solved: 0 },
      scenarios: { total: 1, completed: 0 },
      next: { groupIndex: 2, ref: groups[2]?.activities[0] },
    });
  });

  it('tracks scenarios once their progress has loaded, and counts completed ones as done', () => {
    const base: ProgressData = { skills: new Map(), challenges: new Map() };
    const scenario = groups[2]!.activities[1]!;
    expect(activityStatus(scenario, base)).toBe('unknown');
    expect(activityStatus(scenario, { ...base, scenarios: new Map() })).toBe('not-started');
    const progress = (completed: boolean) => ({
      ...base,
      scenarios: new Map([
        ['s', { scenarioId: 's', tasks: [], done: completed ? 3 : 1, total: 3, completed }],
      ]),
    });
    expect(activityStatus(scenario, progress(false))).toBe('in-progress');
    expect(activityStatus(scenario, progress(true))).toBe('completed');
    expect(pathProgress([groups[2]!], progress(true)).scenarios).toEqual({
      total: 1,
      completed: 1,
    });
  });

  it('treats everything as not assessed without progress data, starting at the first activity', () => {
    expect(pathProgress(groups, undefined)).toMatchObject({
      skills: { total: 2, mastered: 0, practiced: 0, notAssessed: 2 },
      next: { groupIndex: 0, ref: skill('a') },
    });
  });
});

describe('SavedPlanPage', () => {
  const ID = '6d1f5e9a-1c35-4a8b-9a51-1d8f0d5c3b11';
  const today = localToday();
  const yesterday = addDays(today, -1);
  const PLAN: SavedPlan = {
    id: ID,
    title: 'Contoso interview',
    termIds: ['typescript', 'sql-server'],
    createdAt: '2026-11-20T10:00:00.000Z',
    settings: {
      format: 'backend',
      interviewDate: addDays(today, 3),
      dailyMinutes: 60,
      company: 'Contoso',
    },
    requirements: [
      { termId: 'typescript', requirement: 'required', priority: 'high' },
      { termId: 'sql-server', requirement: 'required', priority: 'high' },
    ],
    schedule: [
      {
        date: yesterday,
        items: [
          { key: 'external:sql-server', minutes: 30 },
          { key: 'skill:unions', minutes: 35 },
        ],
      },
      { date: today, items: [{ key: 'skill:primitives', minutes: 10 }] },
    ],
    done: ['external:sql-server'],
    skipped: [],
  };
  const fake = () =>
    api({ targetRoleId: null, plans: [PLAN] })
      .on(`PATCH /me/preparation/plans/${ID}`, (body) => ({ ...PLAN, ...(body as object) }))
      .on('GET /companies', () => ({
        companies: [],
        total: 0,
        page: 1,
        pageSize: 25,
        letters: [],
      }));
  const click = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label)?.click();

  it('shows the saved schedule as saved, with done work and a resume link', async () => {
    const { el } = await render(SavedPlanPage, fake(), { planId: ID });
    const days = [...el.querySelectorAll('.day')].map((d) =>
      [...d.querySelectorAll('.item')].map((i) => i.getAttribute('data-key')),
    );
    expect(days).toEqual([['external:sql-server', 'skill:unions'], ['skill:primitives']]);
    expect(text(el.querySelector('[data-key="external:sql-server"]'))).toContain('Marked done');
    expect(text(el)).toContain('Resume your preparation');
    expect(text(el)).toContain('Contoso is not in the company catalog');
  });

  it('offers to reschedule missed work, keeping completed work where it was', async () => {
    const api = fake();
    const { el, fixture } = await render(SavedPlanPage, api, { planId: ID });
    expect(text(el)).toContain('1 activity was not finished on schedule');
    click(el, 'Reschedule unfinished work');
    await settle();
    await fixture.whenStable();
    const patch = api.calls.find((c) => c.route === `PATCH /me/preparation/plans/${ID}`);
    const schedule = (patch?.input as { schedule: SavedPlan['schedule'] }).schedule!;
    expect(schedule[0]).toEqual({
      date: yesterday,
      items: [{ key: 'external:sql-server', minutes: 30 }],
    });
    const later = schedule.filter((d) => d.date >= today).flatMap((d) => d.items.map((i) => i.key));
    expect(later).toContain('skill:unions');
    for (const d of schedule.filter((x) => x.date >= today))
      expect(d.items.reduce((s, i) => s + i.minutes, 0)).toBeLessThanOrEqual(60);
  });

  it('records marks and renames through PATCH', async () => {
    const api = fake();
    const { el, fixture } = await render(SavedPlanPage, api, { planId: ID });
    el.querySelector<HTMLButtonElement>('[data-key="skill:unions"] .btn--link')?.click();
    await settle();
    const title = el.querySelector<HTMLInputElement>('#plan-title')!;
    title.value = 'Contoso round 2';
    title.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    click(el, 'Rename');
    await settle();
    const patches = api.calls.filter((c) => c.route === `PATCH /me/preparation/plans/${ID}`);
    expect(patches.map((c) => c.input)).toEqual([
      { skipped: ['skill:unions'] },
      { title: 'Contoso round 2' },
    ]);
  });

  it('shows not found for a plan that is not the learner’s', async () => {
    const { el } = await render(SavedPlanPage, fake(), { planId: 'someone-else' });
    expect(text(el)).toContain('Plan not found');
  });
});
