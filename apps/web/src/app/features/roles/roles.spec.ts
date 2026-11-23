import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  ChallengeProgressResponse,
  PreparationResponse,
  ProgressResponse,
} from '@pracstack/api-contracts';
import type { ActivityRef } from '@pracstack/content-model';
import { provideTestContent } from '../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../testing/fake-api';
import { activityStatus, pathProgress, type ProgressData } from './data-access/role-progress';
import { JobAnalyzer } from './pages/analyze/job-analyzer';
import { RoleCatalog } from './pages/catalog/role-catalog';
import { RoleDetail } from './pages/detail/role-detail';

const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
const settle = () => new Promise((r) => setTimeout(r));

const NOTHING_SAVED: PreparationResponse = { targetRoleId: null, plans: [] };

const SKILL_PROGRESS: ProgressResponse = {
  technologyId: 'typescript',
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
    expect(text(basics)).toContain('Practised, not mastered');
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
    expect(progress).toContain('Skills practised, not yet mastered 1');
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
    '- 4+ years of experience with C# and TypeScript.',
    '- SQL Server (T-SQL) and ADO pipelines.',
    '- Power Automate (formerly Microsoft Flow).',
  ].join('\n');

  async function analyze(fake = api()) {
    const result = await render(JobAnalyzer, fake);
    const textarea = result.el.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('no textarea');
    textarea.value = POSTING;
    textarea.dispatchEvent(new Event('input'));
    [...result.el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => text(b) === 'Analyze')
      ?.click();
    await result.fixture.whenStable();
    await settle();
    await result.fixture.whenStable();
    return { ...result, fake };
  }

  it('says the posting is analysed in the browser and not sent', async () => {
    const { el } = await render(JobAnalyzer, api());
    expect(text(el.querySelector('app-alert'))).toContain(
      'Analysed in your browser; the text is not sent to PracStack',
    );
    expect(el.querySelector('textarea')?.getAttribute('spellcheck')).toBe('false');
  });

  it('shows detected technologies by category, with evidence and confidence', async () => {
    const { el } = await analyze();
    const term = (id: string) => el.querySelector(`[data-term="${id}"]`);
    expect(text(term('csharp'))).toContain('High confidence');
    expect(text(term('csharp'))).toContain('Practice available');
    expect(text(term('csharp')?.querySelector('.evidence'))).toBe(
      '4+ years of experience with C# and TypeScript.',
    );
    expect(text(term('sql-server'))).toContain('Not covered yet');
    expect(text(term('azure-devops'))).toContain('Low confidence');
    expect(text(term('azure-devops'))).toContain('Only with pipeline words.');
    expect(text(term('power-automate'))).toContain('Formerly Microsoft Flow.');
    expect([...el.querySelectorAll('.group-heading')].map((h) => text(h))).toEqual([
      'Languages',
      'Databases and data',
      'DevOps and tooling',
      'Business applications',
    ]);
  });

  it('lists uncovered requirements and experience requirements as information only', async () => {
    const { el } = await analyze();
    const uncovered = [...el.querySelectorAll('.uncovered li')].map((li) => text(li));
    expect(uncovered).toEqual(['SQL Server', 'Azure DevOps', 'Power Automate']);
    const experience = text(el.querySelector('.experience'));
    expect(experience).toContain('4+ years of experience with C# and TypeScript.');
    expect(text(el)).toContain('PracStack cannot satisfy years-of-experience requirements');
  });

  it('builds a preparation path from covered terms only', async () => {
    const { el } = await analyze();
    const steps = [...el.querySelectorAll('app-term-path .step-name')].map((s) => text(s));
    expect(steps).toEqual(['1C#', '2TypeScript']);
    expect([...el.querySelectorAll('app-term-path a')].map((a) => text(a))).toEqual([
      'Pangram',
      'Primitive types',
      'Union types',
    ]);
  });

  it('never sends the posting: saving a plan posts only a title and term ids', async () => {
    const fake = api().on('POST /me/preparation/plans', (body) => ({
      id: '6d1f5e9a-1c35-4a8b-9a51-1d8f0d5c3b11',
      createdAt: '2026-11-23T10:00:00.000Z',
      ...(body as object),
    }));
    const { el, fixture } = await analyze(fake);
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => text(b) === 'Save plan')
      ?.click();
    await settle();
    await fixture.whenStable();
    const save = fake.calls.find((c) => c.route === 'POST /me/preparation/plans');
    expect(Object.keys(save?.input as object).sort()).toEqual(['termIds', 'title']);
    expect((save?.input as { termIds: string[] }).termIds).toEqual([
      'csharp',
      'typescript',
      'sql-server',
      'azure-devops',
      'power-automate',
    ]);
    for (const call of fake.calls) {
      expect(JSON.stringify(call.input ?? null)).not.toContain('years of experience');
    }
    expect(text(el)).toContain('Plan saved');
  });

  it('explains empty input', async () => {
    const { el, fixture } = await render(JobAnalyzer, api());
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => text(b) === 'Analyze')
      ?.click();
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
      skills: { total: 2, mastered: 2, practised: 0, notAssessed: 0 },
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
      skills: { total: 2, mastered: 0, practised: 0, notAssessed: 2 },
      next: { groupIndex: 0, ref: skill('a') },
    });
  });
});
