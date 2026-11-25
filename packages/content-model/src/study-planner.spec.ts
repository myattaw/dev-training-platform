import { describe, expect, it } from 'vitest';
import { analyzeJobDescription } from './job-analysis';
import type { ActivityRef } from './roles';
import {
  type ActivityInfo,
  type ActivityProgress,
  addDays,
  buildStudyPlan,
  daysBetween,
  formatMinutes,
  masteryState,
  type PlanRequirement,
  planRequirements,
  storedDays,
  type StudyPlanInput,
  viewStoredSchedule,
} from './study-planner';
import type { TaxonomyTerm } from './taxonomy';

const skill = (skillId: string): ActivityRef => ({ kind: 'skill', skillId });
const challenge = (challengeId: string): ActivityRef => ({
  kind: 'challenge',
  challengeId,
  language: 'csharp',
});

const TAXONOMY: readonly TaxonomyTerm[] = [
  {
    id: 'csharp',
    label: 'C#',
    category: 'language',
    aliases: [],
    practice: [skill('cs-oop'), challenge('reverse-string'), challenge('invoice-api')],
  },
  {
    id: 'sql-server',
    label: 'SQL Server',
    category: 'database',
    aliases: [],
    practice: [skill('mssql-1'), skill('mssql-2')],
  },
  {
    id: 'mvc',
    label: 'ASP.NET MVC',
    category: 'framework',
    aliases: [],
    practice: [],
    relatedPractice: [skill('aspnet-routing')],
    gap: { notCovered: 'Classic MVC is not practiced.' },
  },
  {
    id: 'docs',
    label: 'technical documentation',
    category: 'practice',
    aliases: [],
    practice: [],
    gap: { notCovered: 'Writing is not practiced.' },
  },
  { id: 'java', label: 'Java', category: 'language', aliases: [], practice: [challenge('x')] },
  {
    id: 'typescript',
    label: 'TypeScript',
    category: 'language',
    aliases: [],
    practice: [skill('ts-1')],
  },
  {
    id: 'python',
    label: 'Python',
    category: 'language',
    aliases: [],
    practice: [],
    gap: { notCovered: 'No Python.' },
  },
  { id: 'azure', label: 'Azure', category: 'cloud', aliases: [], practice: [skill('az-1')] },
];

const INFO: Record<string, ActivityInfo> = {
  'skill:cs-oop': { style: 'knowledge', minutes: 25 },
  'challenge:reverse-string:csharp': { style: 'algorithm', minutes: 20 },
  'challenge:invoice-api:csharp': { style: 'enterprise', minutes: 40 },
  'skill:mssql-1': { style: 'knowledge', minutes: 25 },
  'skill:mssql-2': { style: 'knowledge', minutes: 25 },
  'skill:aspnet-routing': { style: 'knowledge', minutes: 25 },
  'skill:ts-1': { style: 'knowledge', minutes: 25 },
  'skill:az-1': { style: 'knowledge', minutes: 25 },
};
const key = (ref: ActivityRef) =>
  ref.kind === 'skill'
    ? `skill:${ref.skillId}`
    : ref.kind === 'challenge'
      ? `challenge:${ref.challengeId}:${ref.language}`
      : ref.kind === 'scenario'
        ? `scenario:${ref.scenarioId}`
        : `web-challenge:${ref.challengeId}`;

const REQS: PlanRequirement[] = [
  { termId: 'csharp', requirement: 'required', priority: 'high' },
  { termId: 'sql-server', requirement: 'required', priority: 'high' },
  { termId: 'mvc', requirement: 'required', priority: 'high' },
  { termId: 'docs', requirement: 'responsibility', priority: 'high' },
  { termId: 'azure', requirement: 'familiarity', priority: 'low' },
];

const input = (overrides: Partial<StudyPlanInput> = {}): StudyPlanInput => ({
  requirements: REQS,
  taxonomy: TAXONOMY,
  settings: { format: 'enterprise' },
  today: '2026-03-02',
  describe: (ref) => INFO[key(ref)],
  ...overrides,
});
const keysOf = (items: readonly { key: string }[]) => items.map((i) => i.key);

describe('planRequirements', () => {
  it('keeps one member of an alternative group, at the group level', () => {
    const a = analyzeJobDescription(
      'Requirements:\n- Java, Python, or TypeScript\n- Familiarity with Azure',
      TAXONOMY,
    );
    // Default: the best-covered member (Java has a hands-on challenge).
    expect(planRequirements(a, TAXONOMY)).toEqual([
      { termId: 'java', requirement: 'required', priority: 'high' },
      { termId: 'azure', requirement: 'familiarity', priority: 'low' },
    ]);
    // The learner's choice, or their preferred language, wins.
    const [group] = a.alternatives;
    expect(planRequirements(a, TAXONOMY, { choices: { [group!.id]: 'python' } })[0]?.termId).toBe(
      'python',
    );
    expect(planRequirements(a, TAXONOMY, { language: 'typescript' })[0]?.termId).toBe('typescript');
  });
});

describe('buildStudyPlan: path mode (no interview date)', () => {
  it('orders by priority, breadth first, job-aware inside a requirement', () => {
    const plan = buildStudyPlan(input());
    expect(plan.mode).toBe('path');
    expect(keysOf(plan.path)).toEqual([
      // First item of each high-priority requirement: core technologies with practice first…
      'challenge:invoice-api:csharp', // enterprise exercise first for an enterprise interview
      'skill:mssql-1',
      'external:mvc', // not covered: external study stays in the plan
      'external:docs',
      // …then the second items.
      'skill:cs-oop',
      'skill:mssql-2',
      // Related practice and the demoted algorithm challenge come later.
      'skill:aspnet-routing',
      'challenge:reverse-string:csharp',
      'skill:az-1',
    ]);
    expect(plan.path.find((i) => i.key === 'skill:aspnet-routing')).toMatchObject({
      related: true,
    });
    expect(plan.next?.key).toBe('challenge:invoice-api:csharp');
  });

  it('puts algorithm challenges first for live coding interviews', () => {
    const plan = buildStudyPlan(input({ settings: { format: 'live-coding' } }));
    expect(keysOf(plan.path)[0]).toBe('challenge:reverse-string:csharp');
  });

  it('never includes content that does not exist', () => {
    const plan = buildStudyPlan(
      input({ describe: (ref) => (key(ref) === 'skill:mssql-2' ? undefined : INFO[key(ref)]) }),
    );
    expect(keysOf(plan.path)).not.toContain('skill:mssql-2');
  });
});

describe('buildStudyPlan: schedules', () => {
  it('fits the time budget: 7 days at 2 hours never exceeds 14 hours, or 2 hours a day', () => {
    const plan = buildStudyPlan(
      input({ settings: { format: 'enterprise', interviewDate: '2026-03-09', dailyMinutes: 120 } }),
    );
    expect(plan.mode).toBe('schedule');
    expect(plan.days).toHaveLength(7);
    expect(plan.budgetMinutes).toBe(14 * 60);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(14 * 60);
    for (const d of plan.days) expect(d.minutes).toBeLessThanOrEqual(120);
    // A review every third day and a mock interview on the last day.
    expect(keysOf(plan.days[2]!.items)).toContain('review:1');
    expect(keysOf(plan.days[6]!.items)).toContain('mock:interview');
  });

  it('lists what did not fit, most important first, when time is short', () => {
    const plan = buildStudyPlan(
      input({ settings: { format: 'enterprise', interviewDate: '2026-03-03', dailyMinutes: 60 } }),
    );
    expect(plan.days).toHaveLength(1);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(60);
    // The most important item first; leftover minutes may hold a shorter one.
    expect(plan.days[0]!.items[0]?.key).toBe('challenge:invoice-api:csharp');
    expect(plan.notFitting.map((n) => n.item.priority)[0]).toBe('high');
    expect(keysOf(plan.notFitting.map((n) => n.item))).toContain('external:mvc');
  });

  it('assumes an hour a day when no daily time is given, and says so', () => {
    const plan = buildStudyPlan(
      input({ settings: { format: 'enterprise', interviewDate: '2026-03-05' } }),
    );
    expect(plan).toMatchObject({ dailyMinutes: 60, assumedDailyMinutes: true, budgetMinutes: 180 });
  });

  it('marks items that are longer than a whole day', () => {
    const plan = buildStudyPlan(
      input({ settings: { format: 'enterprise', interviewDate: '2026-03-04', dailyMinutes: 20 } }),
    );
    expect(plan.notFitting).toContainEqual(
      expect.objectContaining({
        why: 'too-long',
        item: expect.objectContaining({ key: 'external:mvc' }),
      }),
    );
  });
});

describe('buildStudyPlan: progress', () => {
  const progress =
    (states: Record<string, ActivityProgress>) =>
    (ref: ActivityRef): ActivityProgress | undefined =>
      states[key(ref)];

  it('skips solved work, shortens strong skills, extends developing ones, and demotes mastered ones', () => {
    const plan = buildStudyPlan(
      input({
        progress: progress({
          'challenge:invoice-api:csharp': { kind: 'task', done: true, attempted: true },
          'skill:mssql-1': { kind: 'skill', state: 'developing' },
          'skill:mssql-2': { kind: 'skill', state: 'strong' },
          'skill:cs-oop': { kind: 'skill', state: 'mastered' },
          'skill:az-1': { kind: 'skill', state: 'not-assessed' },
        }),
      }),
    );
    expect(keysOf(plan.completed)).toEqual(['challenge:invoice-api:csharp']);
    expect(plan.completed[0]).toMatchObject({ verified: true, status: 'done' });
    const byKey = Object.fromEntries(plan.path.map((i) => [i.key, i]));
    expect(byKey['skill:mssql-1']).toMatchObject({ minutes: 35, mastery: 'developing' });
    expect(byKey['skill:mssql-2']).toMatchObject({ minutes: 15, mastery: 'strong' });
    expect(byKey['skill:az-1']).toMatchObject({ minutes: 25, mastery: 'not-assessed' });
    // Mastered: an optional review at the very end.
    expect(plan.path[plan.path.length - 1]).toMatchObject({ key: 'skill:cs-oop', minutes: 10 });
  });

  it('separates manual completion and skipping from server-graded work', () => {
    const plan = buildStudyPlan(
      input({ done: new Set(['external:docs']), skipped: new Set(['skill:mssql-2']) }),
    );
    expect(plan.completed).toEqual([
      expect.objectContaining({ key: 'external:docs', verified: false }),
    ]);
    expect(keysOf(plan.skipped)).toEqual(['skill:mssql-2']);
    expect(keysOf(plan.path)).not.toContain('skill:mssql-2');
  });

  it('classifies mastery from real scores without treating unassessed skills as weak', () => {
    expect(masteryState({ attempts: 0, score: 0, mastered: false })).toBe('not-assessed');
    expect(masteryState({ attempts: 2, score: 10, mastered: false })).toBe('practiced');
    expect(masteryState({ attempts: 6, score: 45, mastered: false })).toBe('developing');
    expect(masteryState({ attempts: 6, score: 80, mastered: false })).toBe('strong');
    expect(masteryState({ attempts: 20, score: 100, mastered: true })).toBe('mastered');
  });
});

describe('saved schedules', () => {
  const settings = { format: 'enterprise' as const, interviewDate: '2026-03-09', dailyMinutes: 60 };

  it('shows a saved schedule unchanged, with current statuses', () => {
    const first = buildStudyPlan(input({ settings }));
    const stored = storedDays(first);
    const later = viewStoredSchedule(
      input({ settings, today: '2026-03-04', done: new Set(['external:mvc']) }),
      stored,
    );
    expect(later.days.map((d) => keysOf(d.items))).toEqual(first.days.map((d) => keysOf(d.items)));
    expect(later.days.flatMap((d) => d.items).find((i) => i.key === 'external:mvc')?.status).toBe(
      'done',
    );
  });

  it('reschedules unfinished work from today and keeps completed work where it was', () => {
    const first = buildStudyPlan(input({ settings }));
    const stored = storedDays(first);
    const doneKey = first.days[0]!.items[0]!.key;
    const missedKey = first.days[1]!.items[0]!.key;
    const again = buildStudyPlan(
      input({ settings, today: '2026-03-05', keep: stored, done: new Set([doneKey]) }),
    );
    // Day 1 keeps its finished item; nothing unfinished stays in the past.
    expect(keysOf(again.days[0]!.items)).toEqual([doneKey]);
    expect(
      again.days
        .filter((d) => d.date < '2026-03-05')
        .flatMap((d) => d.items)
        .every((i) => i.status === 'done'),
    ).toBe(true);
    // The missed item is planned again from today.
    const future = again.days.filter((d) => d.date >= '2026-03-05').flatMap((d) => keysOf(d.items));
    expect([...future, ...keysOf(again.notFitting.map((n) => n.item))]).toContain(missedKey);
    expect(again.plannedMinutes).toBeLessThanOrEqual(4 * 60);
  });
});

describe('helpers', () => {
  it('does date math in whole days and formats durations', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(daysBetween('2026-03-02', '2026-03-09')).toBe(7);
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(120)).toBe('2 h');
  });
});
