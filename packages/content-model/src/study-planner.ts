import type { ChallengeCategory, Difficulty, LanguageId } from './challenge';
import {
  type AlternativeGroup,
  type JobAnalysis,
  REQUIREMENT_LABELS,
  REQUIREMENT_RANK,
  type RequirementLevel,
} from './job-analysis';
import { type ActivityRef, activityKey, type JobRole } from './roles';
import {
  type CoverageLevel,
  coverageOf,
  TERM_CATEGORIES,
  type TaxonomyTerm,
  type TermCategory,
  type TermResource,
} from './taxonomy';

/*
 * Interview study planner: turns the requirements of a job posting into a
 * prioritized path, or a day-by-day schedule that fits the time before the
 * interview. Pure and deterministic, like the analyzer: it runs in the
 * browser and needs no posting text (a saved plan stores only term ids,
 * levels and priorities).
 *
 * Ranking (docs/job-roles.md, "Study planner"):
 * 1. Preparation priority: required and core responsibilities first, then
 *    preferred, then familiarity and mentions.
 * 2. Breadth first: within a priority, every requirement gets its first
 *    activity before any gets its second.
 * 3. Job-aware order inside a requirement: the interview format decides
 *    whether enterprise exercises, knowledge practice or algorithm
 *    challenges come first; general algorithm challenges drop one priority
 *    for enterprise, backend, database and knowledge interviews.
 * 4. Progress: solved and completed work is not scheduled again, mastered
 *    skills become optional short reviews, skills still developing get more
 *    time. Unassessed skills are not treated as weaknesses.
 * 5. Requirements PracStack cannot practice stay in the plan as external
 *    study items, with what is not covered.
 */

export type InterviewFormat =
  | 'general'
  | 'live-coding'
  | 'backend'
  | 'full-stack'
  | 'database'
  | 'enterprise'
  | 'knowledge'
  | 'unknown';

export const INTERVIEW_FORMATS: readonly InterviewFormat[] = [
  'unknown',
  'general',
  'live-coding',
  'backend',
  'full-stack',
  'database',
  'enterprise',
  'knowledge',
];

export const INTERVIEW_FORMAT_LABELS: Readonly<Record<InterviewFormat, string>> = {
  unknown: 'Not sure yet',
  general: 'General technical interview',
  'live-coding': 'Live coding',
  backend: 'Backend development',
  'full-stack': 'Full-stack development',
  database: 'Database development',
  enterprise: 'Enterprise application development',
  knowledge: 'Technical knowledge interview',
};

export type PreparationPriority = 'high' | 'medium' | 'low';

export const PRIORITY_LABELS: Readonly<Record<PreparationPriority, string>> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

const PRIORITY_RANK: Readonly<Record<PreparationPriority, number>> = { high: 3, medium: 2, low: 1 };

/** What a plan keeps about each requirement. Never posting text. */
export interface PlanRequirement {
  readonly termId: string;
  readonly requirement: RequirementLevel;
  readonly priority: PreparationPriority;
}

/** The default priority of a requirement level. */
export function priorityOf(level: RequirementLevel): PreparationPriority {
  switch (level) {
    case 'required':
    case 'responsibility':
      return 'high';
    case 'preferred':
    case 'uncertain':
      return 'medium';
    default:
      return 'low';
  }
}

const COVERAGE_RANK: Readonly<Record<CoverageLevel, number>> = {
  executable: 4,
  conceptual: 3,
  partial: 2,
  related: 1,
  none: 0,
};

/** Term ids of the languages a learner can prefer. */
const LANGUAGE_TERMS: Readonly<Record<LanguageId, string>> = {
  typescript: 'typescript',
  java: 'java',
  csharp: 'csharp',
  python: 'python',
  swift: 'swift',
};

/**
 * The member of an alternative group to prepare: the learner's choice, else
 * their preferred language, else the member PracStack covers best (first on a tie).
 */
export function defaultChoice(
  group: AlternativeGroup,
  terms: ReadonlyMap<string, TaxonomyTerm>,
  language?: LanguageId,
): string {
  const preferred = language ? LANGUAGE_TERMS[language] : undefined;
  if (preferred && group.termIds.includes(preferred)) return preferred;
  let best = group.termIds[0] ?? '';
  let bestRank = -1;
  for (const id of group.termIds) {
    const term = terms.get(id);
    const rank = term ? COVERAGE_RANK[coverageOf(term)] : -1;
    if (rank > bestRank) {
      best = id;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * The requirements to prepare, strongest first. Of each alternative group
 * only the chosen member is kept (at the group's level); the others are
 * options, not requirements.
 */
export function planRequirements(
  analysis: JobAnalysis,
  taxonomy: readonly TaxonomyTerm[],
  options: {
    readonly choices?: Readonly<Record<string, string>>;
    readonly language?: LanguageId;
  } = {},
): PlanRequirement[] {
  const terms = new Map(taxonomy.map((t) => [t.id, t]));
  const chosen = new Map<string, RequirementLevel>();
  for (const group of analysis.alternatives) {
    const pick = options.choices?.[group.id] ?? defaultChoice(group, terms, options.language);
    if (!group.termIds.includes(pick)) continue;
    const previous = chosen.get(pick);
    if (!previous || REQUIREMENT_RANK[group.level] > REQUIREMENT_RANK[previous])
      chosen.set(pick, group.level);
  }
  const result: PlanRequirement[] = [];
  for (const t of analysis.terms) {
    let level = t.requirement;
    if (level === 'alternative') {
      const groupLevel = chosen.get(t.term.id);
      if (!groupLevel) continue;
      level = groupLevel;
    } else {
      const groupLevel = chosen.get(t.term.id);
      if (groupLevel && REQUIREMENT_RANK[groupLevel] > REQUIREMENT_RANK[level]) level = groupLevel;
    }
    result.push({ termId: t.term.id, requirement: level, priority: priorityOf(level) });
  }
  return result.sort(
    (a, b) =>
      PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
      REQUIREMENT_RANK[b.requirement] - REQUIREMENT_RANK[a.requirement],
  );
}

/* ---------------------------------------------------------------- Inferred focus */

export interface InferredFocus {
  readonly role: JobRole;
  readonly matchedTermIds: readonly string[];
  /** The interview format this kind of role suggests. */
  readonly format: InterviewFormat;
}

const ROLE_FORMATS: Readonly<Record<string, InterviewFormat>> = {
  'dotnet-backend-developer': 'backend',
  'fullstack-angular-dotnet-developer': 'full-stack',
  'csharp-dotnet-developer': 'backend',
  'aspnet-core-backend-developer': 'backend',
  'sql-server-database-developer': 'database',
  'azure-developer': 'backend',
  'aws-developer': 'backend',
  'power-platform-developer': 'knowledge',
  'enterprise-application-developer': 'enterprise',
  'power-platform-solution-architect': 'knowledge',
};

/**
 * The job role the requirements look most like (an inference, shown as one):
 * high-priority overlap counts most; at least two matching technologies.
 */
export function inferFocus(
  requirements: readonly PlanRequirement[],
  roles: readonly JobRole[],
): InferredFocus | undefined {
  const weight = new Map(requirements.map((r) => [r.termId, PRIORITY_RANK[r.priority]]));
  let best: { role: JobRole; score: number; matched: string[] } | undefined;
  for (const role of roles) {
    const matched = role.technologies.filter((id) => weight.has(id));
    if (matched.length < 2) continue;
    const score =
      matched.reduce((sum, id) => sum + (weight.get(id) ?? 0), 0) /
      Math.sqrt(role.technologies.length);
    if (!best || score > best.score) best = { role, score, matched };
  }
  return best
    ? {
        role: best.role,
        matchedTermIds: best.matched,
        format: ROLE_FORMATS[best.role.id] ?? 'general',
      }
    : undefined;
}

/* ---------------------------------------------------------------- Progress */

/**
 * How far a learner is with a skill, from server-graded answers only:
 * not assessed (never answered: not a weakness), practiced (a few answers),
 * developing, strong, mastered.
 */
export type MasteryState = 'not-assessed' | 'practiced' | 'developing' | 'strong' | 'mastered';

export const MASTERY_LABELS: Readonly<Record<MasteryState, string>> = {
  'not-assessed': 'Not assessed',
  practiced: 'Practiced',
  developing: 'Developing mastery',
  strong: 'Strong mastery',
  mastered: 'Mastered',
};

/** Answers before a score says anything. */
const MIN_ATTEMPTS_FOR_SCORE = 3;
const STRONG_SCORE = 70;

export function masteryState(progress: {
  readonly attempts: number;
  readonly score: number;
  readonly mastered: boolean;
}): MasteryState {
  if (progress.attempts === 0) return 'not-assessed';
  if (progress.mastered) return 'mastered';
  if (progress.attempts < MIN_ATTEMPTS_FOR_SCORE) return 'practiced';
  return progress.score >= STRONG_SCORE ? 'strong' : 'developing';
}

export type ActivityProgress =
  | { readonly kind: 'skill'; readonly state: MasteryState }
  /** Challenges and scenarios: done only when the server graded them solved or completed. */
  | { readonly kind: 'task'; readonly done: boolean; readonly attempted: boolean };

/* ---------------------------------------------------------------- Plan items */

/** How an activity practices: knowledge questions, a general algorithm, an enterprise exercise, a scenario. */
export type ActivityStyle = 'knowledge' | 'algorithm' | 'enterprise' | 'scenario';

export interface ActivityInfo {
  readonly style: ActivityStyle;
  /** Estimated minutes for one focused session. */
  readonly minutes: number;
}

export type PlanItemKind =
  'skill' | 'challenge' | 'scenario' | 'web-challenge' | 'external' | 'review' | 'mock';

export interface PlanItem {
  /** Activity key (`skill:…`, `challenge:…:csharp`), `external:<term>`, `review:<n>` or `mock:interview`. */
  readonly key: string;
  readonly kind: PlanItemKind;
  readonly ref?: ActivityRef;
  readonly termId?: string;
  readonly termLabel?: string;
  /** Other requirements the same activity practices. */
  readonly alsoFor: readonly string[];
  readonly minutes: number;
  readonly priority: PreparationPriority;
  readonly reason: string;
  /** Related practice only (transferable, not the requirement itself). */
  readonly related: boolean;
  readonly style?: ActivityStyle;
  readonly mastery?: MasteryState;
  readonly status: 'pending' | 'done' | 'skipped';
  /** Done because the server graded it (not a manual mark). */
  readonly verified: boolean;
  /** For external study: official documentation. */
  readonly resources?: readonly TermResource[];
}

export interface PlanDay {
  /** YYYY-MM-DD */
  readonly date: string;
  readonly items: readonly PlanItem[];
  readonly minutes: number;
  readonly capacity: number;
}

export interface NotFitting {
  readonly item: PlanItem;
  readonly why: 'no-time' | 'too-long';
}

export interface StudyPlan {
  /** `schedule` when there is an interview date, else a prioritized `path`. */
  readonly mode: 'schedule' | 'path';
  readonly days: readonly PlanDay[];
  /** Path mode: everything to do, in order. */
  readonly path: readonly PlanItem[];
  /** Schedule mode: what did not fit, most important first. */
  readonly notFitting: readonly NotFitting[];
  /** Done before or outside this schedule (verified or marked). */
  readonly completed: readonly PlanItem[];
  readonly skipped: readonly PlanItem[];
  /** Days × daily minutes (schedule mode). */
  readonly budgetMinutes?: number;
  readonly plannedMinutes: number;
  readonly dailyMinutes?: number;
  /** No daily time was given; one hour was assumed. */
  readonly assumedDailyMinutes: boolean;
  /** The first unfinished item from today on. */
  readonly next?: PlanItem;
}

export interface PlanSettings {
  /** YYYY-MM-DD; without it the plan is a prioritized path. */
  readonly interviewDate?: string;
  readonly dailyMinutes?: number;
  readonly format: InterviewFormat;
  readonly language?: LanguageId;
}

/** A saved day: activity keys and minutes only. */
export interface StoredDay {
  readonly date: string;
  readonly items: readonly { readonly key: string; readonly minutes: number }[];
}

export interface StudyPlanInput {
  readonly requirements: readonly PlanRequirement[];
  readonly taxonomy: readonly TaxonomyTerm[];
  readonly settings: PlanSettings;
  /** YYYY-MM-DD in the learner's time zone. */
  readonly today: string;
  /** Metadata of available content; undefined when it does not exist (never linked). */
  readonly describe: (ref: ActivityRef) => ActivityInfo | undefined;
  /** Server-graded progress; undefined when unknown (signed out). */
  readonly progress?: (ref: ActivityRef) => ActivityProgress | undefined;
  /** Keys marked done by the learner (external study, reviews, mock interviews). */
  readonly done?: ReadonlySet<string>;
  readonly skipped?: ReadonlySet<string>;
  /**
   * A saved schedule. Days before today and items already done keep their
   * place; everything else is planned again from today.
   */
  readonly keep?: readonly StoredDay[];
}

export const DEFAULT_DAILY_MINUTES = 60;
const MAX_DAYS = 120;
const SKILL_MINUTES: Readonly<Record<MasteryState, number>> = {
  'not-assessed': 25,
  practiced: 25,
  developing: 35,
  strong: 15,
  mastered: 10,
};
const EXTERNAL_MINUTES: Readonly<Record<PreparationPriority, number>> = {
  high: 30,
  medium: 20,
  low: 15,
};
const REVIEW_MINUTES = 20;
const MOCK_MINUTES = 45;

/** How strongly each interview format wants each style (higher first). */
const STYLE_WEIGHT: Readonly<Record<InterviewFormat, Readonly<Record<ActivityStyle, number>>>> = {
  'live-coding': { algorithm: 3, enterprise: 2, knowledge: 1, scenario: 1 },
  enterprise: { enterprise: 3, scenario: 3, knowledge: 2, algorithm: 0 },
  backend: { enterprise: 3, knowledge: 2, scenario: 2, algorithm: 1 },
  'full-stack': { enterprise: 2, knowledge: 2, algorithm: 2, scenario: 1 },
  database: { knowledge: 3, scenario: 2, enterprise: 2, algorithm: 0 },
  knowledge: { knowledge: 3, scenario: 2, enterprise: 1, algorithm: 0 },
  general: { knowledge: 2, enterprise: 2, algorithm: 2, scenario: 1 },
  unknown: { knowledge: 2, enterprise: 2, algorithm: 2, scenario: 1 },
};

/** Formats where general algorithm challenges should not compete with job-specific work. */
const DEMOTE_ALGORITHMS: ReadonlySet<InterviewFormat> = new Set([
  'enterprise',
  'backend',
  'database',
  'knowledge',
]);

/**
 * How much each kind of requirement matters for an interview format (1–3).
 * A requirement with weight 3 gets about three activities for every one of a
 * weight-1 requirement of the same priority, so the core technologies of the
 * job get depth while every requirement still gets a first activity.
 */
const BASE_CATEGORY_WEIGHT: Readonly<Record<TermCategory, number>> = {
  language: 3,
  framework: 3,
  database: 3,
  testing: 2,
  security: 2,
  architecture: 2,
  engineering: 2,
  devops: 1,
  cloud: 1,
  'business-apps': 2,
  practice: 1,
};
const FORMAT_CATEGORY_WEIGHT: Readonly<
  Partial<Record<InterviewFormat, Partial<Record<TermCategory, number>>>>
> = {
  database: { database: 3, language: 2, framework: 1 },
  enterprise: { engineering: 3 },
  'live-coding': { architecture: 3, framework: 2, database: 2 },
  knowledge: { 'business-apps': 3, practice: 2 },
  'full-stack': { devops: 2 },
};
function categoryWeight(format: InterviewFormat, category: TermCategory): number {
  return FORMAT_CATEGORY_WEIGHT[format]?.[category] ?? BASE_CATEGORY_WEIGHT[category];
}

/* ---------------------------------------------------------------- Dates */

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: string): boolean =>
  DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/* ---------------------------------------------------------------- Building */

interface Candidate {
  item: PlanItem;
  tier: number;
  /** Order of its requirement. */
  termOrder: number;
  /** Position inside its requirement. */
  inTerm: number;
  /** How much its requirement matters for this interview (1–3). */
  weight: number;
}

function reasonFor(level: RequirementLevel, label: string, extra: string | undefined): string {
  const why =
    level === 'responsibility'
      ? `${label} is a core responsibility of the job.`
      : level === 'required'
        ? `${label} is required in the posting.`
        : level === 'preferred'
          ? `${label} is a preferred qualification.`
          : level === 'familiarity'
            ? `The posting asks for familiarity with ${label}.`
            : `${label} is mentioned in the posting (${REQUIREMENT_LABELS[level].toLowerCase()}).`;
  return extra ? `${why} ${extra}` : why;
}

const MASTERY_NOTES: Readonly<Record<MasteryState, string>> = {
  'not-assessed': 'Not assessed yet: start here to find out where you stand.',
  practiced: 'You have started; a few more answers will show your level.',
  developing: 'Your score shows room to improve, so it gets extra time.',
  strong: 'You are strong already: a short refresher.',
  mastered: 'Mastered: an optional quick review.',
};

const STYLE_NOTES: Readonly<Record<ActivityStyle, string>> = {
  enterprise: 'Hands-on enterprise exercise.',
  algorithm: 'General coding practice, most useful for live coding.',
  knowledge: '',
  scenario: 'A realistic scenario.',
};

/** Ordered candidates, plus work already done or skipped. */
function candidatesOf(input: StudyPlanInput): {
  candidates: Candidate[];
  completed: PlanItem[];
  skipped: PlanItem[];
} {
  const terms = new Map(input.taxonomy.map((t) => [t.id, t]));
  const format = input.settings.format;
  const weights = STYLE_WEIGHT[format];
  const reqs = input.requirements
    .map((r, index) => ({ r, term: terms.get(r.termId), index }))
    .filter((x): x is { r: PlanRequirement; term: TaxonomyTerm; index: number } => !!x.term)
    .sort(
      (a, b) =>
        PRIORITY_RANK[b.r.priority] - PRIORITY_RANK[a.r.priority] ||
        categoryWeight(format, b.term.category) - categoryWeight(format, a.term.category) ||
        // Something to practice now before reading elsewhere.
        Number(coverageOf(b.term) !== 'none' && coverageOf(b.term) !== 'related') -
          Number(coverageOf(a.term) !== 'none' && coverageOf(a.term) !== 'related') ||
        TERM_CATEGORIES.indexOf(a.term.category) - TERM_CATEGORIES.indexOf(b.term.category) ||
        a.index - b.index,
    );

  const byKey = new Map<string, Candidate>();
  const candidates: Candidate[] = [];
  const completed: PlanItem[] = [];
  const skipped: PlanItem[] = [];
  const seenDone = new Set<string>();

  const add = (c: Candidate) => {
    const { item } = c;
    if (input.skipped?.has(item.key)) {
      skipped.push({ ...item, status: 'skipped' });
      return;
    }
    if (item.status === 'done' || input.done?.has(item.key)) {
      if (!seenDone.has(item.key)) completed.push({ ...item, status: 'done' });
      seenDone.add(item.key);
      return;
    }
    candidates.push(c);
  };

  reqs.forEach(({ r, term }, termOrder) => {
    const weight = categoryWeight(format, term.category);
    const level = coverageOf(term);
    const refs: { ref: ActivityRef; related: boolean }[] = [
      ...term.practice.map((ref) => ({ ref, related: false })),
      ...(level === 'related' || level === 'none' || level === 'partial'
        ? (term.relatedPractice ?? []).map((ref) => ({ ref, related: true }))
        : []),
    ];
    const items: Omit<Candidate, 'inTerm'>[] = [];
    for (const { ref, related } of refs) {
      const key = activityKey(ref);
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, {
          ...existing,
          item: { ...existing.item, alsoFor: [...existing.item.alsoFor, term.label] },
        });
        continue;
      }
      const info = input.describe(ref);
      if (!info) continue; // Not available: never link to missing content.
      const progress = input.progress?.(ref);
      let tier = PRIORITY_RANK[r.priority];
      let minutes = info.minutes;
      let mastery: MasteryState | undefined;
      let status: PlanItem['status'] = 'pending';
      let verified = false;
      if (progress?.kind === 'skill') {
        mastery = progress.state;
        minutes = SKILL_MINUTES[mastery];
        if (mastery === 'mastered') tier = 0;
      } else if (progress?.kind === 'task' && progress.done) {
        status = 'done';
        verified = true;
      }
      if (info.style === 'algorithm' && DEMOTE_ALGORITHMS.has(format)) tier = Math.max(1, tier - 1);
      if (related) tier = Math.max(1, tier - 1);
      const notes = [
        related
          ? `Related practice: PracStack has no direct practice for ${term.label}, and this teaches transferable skills.`
          : undefined,
        mastery ? MASTERY_NOTES[mastery] : undefined,
        STYLE_NOTES[info.style] || undefined,
      ]
        .filter(Boolean)
        .join(' ');
      items.push({
        tier,
        termOrder,
        weight,
        item: {
          key,
          kind: ref.kind,
          ref,
          termId: term.id,
          termLabel: term.label,
          alsoFor: [],
          minutes,
          priority: r.priority,
          reason: reasonFor(r.requirement, term.label, notes || undefined),
          related,
          style: info.style,
          ...(mastery ? { mastery } : {}),
          status,
          verified,
        },
      });
    }
    // Inside a requirement: the styles this interview needs first, then content order.
    const ordered = items
      .map((c, i) => ({ c, i }))
      .sort(
        (a, b) =>
          Number(a.c.item.related) - Number(b.c.item.related) ||
          weights[b.c.item.style ?? 'knowledge'] - weights[a.c.item.style ?? 'knowledge'] ||
          a.i - b.i,
      )
      .map(({ c }, inTerm) => ({ ...c, inTerm }));
    // Not (fully) covered: external study stays in the plan.
    const external =
      level === 'none' ||
      level === 'related' ||
      level === 'partial' ||
      (term.gap !== undefined && r.priority === 'high');
    if (external && term.gap) {
      ordered.push({
        tier: PRIORITY_RANK[r.priority],
        termOrder,
        weight,
        inTerm: level === 'none' || level === 'related' ? 0 : ordered.length,
        item: {
          key: `external:${term.id}`,
          kind: 'external',
          termId: term.id,
          termLabel: term.label,
          alsoFor: [],
          minutes: EXTERNAL_MINUTES[r.priority],
          priority: r.priority,
          reason: reasonFor(
            r.requirement,
            term.label,
            `Not covered by PracStack: ${term.gap.notCovered}`,
          ),
          related: false,
          status: 'pending',
          verified: false,
          ...(term.gap.resources?.length ? { resources: term.gap.resources } : {}),
        },
      });
    }
    for (const c of ordered) {
      byKey.set(c.item.key, c);
    }
  });

  for (const c of byKey.values()) add(c);
  // Priority tier, then breadth first (each requirement's first item, then second…).
  // Priority tier, then weighted breadth first: a weight-3 requirement's third
  // activity comes before a weight-1 requirement's second.
  candidates.sort(
    (a, b) =>
      b.tier - a.tier ||
      a.inTerm / a.weight - b.inTerm / b.weight ||
      b.weight - a.weight ||
      a.termOrder - b.termOrder,
  );
  return { candidates, completed, skipped };
}

function synthetic(
  key: string,
  kind: 'review' | 'mock',
  minutes: number,
  reason: string,
  done: ReadonlySet<string> | undefined,
): PlanItem {
  return {
    key,
    kind,
    alsoFor: [],
    minutes,
    priority: 'high',
    reason,
    related: false,
    status: done?.has(key) ? 'done' : 'pending',
    verified: false,
  };
}

/** Builds the plan: a prioritized path, or a schedule that never exceeds the time available. */
export function buildStudyPlan(input: StudyPlanInput): StudyPlan {
  const { candidates, completed, skipped } = candidatesOf(input);
  const { settings } = input;

  if (!settings.interviewDate || !isIsoDate(settings.interviewDate)) {
    const path = candidates.map((c) => c.item);
    return {
      mode: 'path',
      days: [],
      path,
      notFitting: [],
      completed,
      skipped,
      plannedMinutes: path.reduce((s, i) => s + i.minutes, 0),
      assumedDailyMinutes: false,
      ...(path[0] ? { next: path[0] } : {}),
    };
  }

  const daily = Math.max(
    15,
    Math.min(12 * 60, Math.round(settings.dailyMinutes ?? DEFAULT_DAILY_MINUTES)),
  );
  const assumed = settings.dailyMinutes === undefined;
  // Study days: today up to the day before the interview (today only, if it is today or past).
  const kept = (input.keep ?? []).filter((d) => isIsoDate(d.date));
  const firstDay = kept.length > 0 && kept[0]!.date < input.today ? kept[0]!.date : input.today;
  const studyDays = Math.min(
    MAX_DAYS,
    Math.max(1, daysBetween(input.today, settings.interviewDate)),
  );
  const dates: string[] = [];
  for (let d = firstDay; d < input.today; d = addDays(d, 1)) dates.push(d);
  for (let i = 0; i < studyDays; i++) dates.push(addDays(input.today, i));

  // What the saved schedule keeps: past days' finished work, and anything finished.
  const doneKeys = new Set(completed.map((i) => i.key));
  const all = new Map<string, PlanItem>();
  for (const c of candidates) all.set(c.item.key, c.item);
  for (const i of completed) all.set(i.key, i);
  const placed = new Map<string, PlanItem[]>(dates.map((d) => [d, []]));
  const used = new Map<string, number>(dates.map((d) => [d, 0]));
  const keptKeys = new Set<string>();
  for (const day of kept) {
    const list = placed.get(day.date);
    if (!list) continue;
    for (const { key } of day.items) {
      const item =
        all.get(key) ??
        (key.startsWith('review:') || key.startsWith('mock:')
          ? synthetic(key, key.startsWith('mock:') ? 'mock' : 'review', 0, '', input.done)
          : undefined);
      if (!item) continue;
      const done = doneKeys.has(key) || item.status === 'done';
      if (!done) continue; // Unfinished work is planned again.
      list.push({ ...item, status: 'done' });
      keptKeys.add(key);
      used.set(day.date, (used.get(day.date) ?? 0) + item.minutes);
    }
  }

  const future = dates.filter((d) => d >= input.today);
  const capacity = (d: string) => (d >= input.today ? daily : 0);
  // Reserve time for a review every third day and a mock interview on the last day.
  const reserved = new Map<string, PlanItem>();
  if (future.length >= 3) {
    for (let i = 2; i < future.length - 1; i += 3) {
      const key = `review:${(i + 1) / 3}`;
      reserved.set(
        future[i]!,
        synthetic(
          key,
          'review',
          Math.min(REVIEW_MINUTES, daily),
          'Review: go back over the questions you missed and explain the answers out loud.',
          input.done,
        ),
      );
    }
  }
  const last = future[future.length - 1];
  if (last && (future.length >= 2 || daily >= 90)) {
    reserved.set(
      last,
      synthetic(
        'mock:interview',
        'mock',
        Math.min(MOCK_MINUTES, daily),
        'Mock interview: solve one practiced exercise against the clock and explain your reasoning out loud.',
        input.done,
      ),
    );
  }
  const free = (d: string) =>
    capacity(d) -
    (used.get(d) ?? 0) -
    (reserved.get(d) && !keptKeys.has(reserved.get(d)!.key) ? reserved.get(d)!.minutes : 0);

  const notFitting: NotFitting[] = [];
  for (const c of candidates) {
    if (keptKeys.has(c.item.key)) continue;
    const day = future.find((d) => free(d) >= c.item.minutes);
    if (!day) {
      notFitting.push({ item: c.item, why: c.item.minutes > daily ? 'too-long' : 'no-time' });
      continue;
    }
    placed.get(day)!.push(c.item);
    used.set(day, (used.get(day) ?? 0) + c.item.minutes);
  }
  for (const [day, item] of reserved) {
    if (keptKeys.has(item.key)) continue;
    placed.get(day)!.push(item);
    used.set(day, (used.get(day) ?? 0) + item.minutes);
  }

  const days: PlanDay[] = dates.map((date) => {
    const items = placed.get(date) ?? [];
    return {
      date,
      items,
      minutes: items.reduce((s, i) => s + i.minutes, 0),
      capacity: capacity(date),
    };
  });
  const next = days
    .filter((d) => d.date >= input.today)
    .flatMap((d) => d.items)
    .find((i) => i.status === 'pending');
  return {
    mode: 'schedule',
    days,
    path: [],
    notFitting,
    completed: completed.filter((i) => !keptKeys.has(i.key)),
    skipped,
    budgetMinutes: future.length * daily,
    plannedMinutes: days.filter((d) => d.date >= input.today).reduce((s, d) => s + d.minutes, 0),
    dailyMinutes: daily,
    assumedDailyMinutes: assumed,
    ...(next ? { next } : {}),
  };
}

/** The schedule to save: keys and minutes per day (no titles, reasons or posting text). */
export function storedDays(plan: StudyPlan): StoredDay[] {
  return plan.days.map((d) => ({
    date: d.date,
    items: d.items.map((i) => ({ key: i.key, minutes: i.minutes })),
  }));
}

/**
 * A saved schedule as it was saved, with today's statuses: nothing moves
 * until the learner reschedules. Items whose content no longer exists are
 * left out.
 */
export function viewStoredSchedule(input: StudyPlanInput, stored: readonly StoredDay[]): StudyPlan {
  const { candidates, completed, skipped } = candidatesOf(input);
  const all = new Map<string, PlanItem>();
  for (const c of candidates) all.set(c.item.key, c.item);
  for (const i of completed) all.set(i.key, i);
  for (const i of skipped) all.set(i.key, i);
  const daily = input.settings.dailyMinutes ?? DEFAULT_DAILY_MINUTES;
  const scheduled = new Set<string>();
  const days: PlanDay[] = stored.map((d) => {
    const items: PlanItem[] = [];
    for (const { key, minutes } of d.items) {
      const known = all.get(key);
      const item =
        known ??
        (key.startsWith('review:')
          ? synthetic(
              key,
              'review',
              minutes,
              'Review: go back over the questions you missed and explain the answers out loud.',
              input.done,
            )
          : key.startsWith('mock:')
            ? synthetic(
                key,
                'mock',
                minutes,
                'Mock interview: solve one practiced exercise against the clock and explain your reasoning out loud.',
                input.done,
              )
            : undefined);
      if (!item) continue;
      scheduled.add(key);
      items.push({ ...item, minutes });
    }
    return {
      date: d.date,
      items,
      minutes: items.reduce((s, i) => s + i.minutes, 0),
      capacity: daily,
    };
  });
  const next = days
    .filter((d) => d.date >= input.today)
    .flatMap((d) => d.items)
    .find((i) => i.status === 'pending');
  return {
    mode: 'schedule',
    days,
    path: [],
    notFitting: candidates
      .filter((c) => !scheduled.has(c.item.key))
      .map((c) => ({ item: c.item, why: 'no-time' as const })),
    completed: completed.filter((i) => !scheduled.has(i.key)),
    skipped: skipped.filter((i) => !scheduled.has(i.key)),
    budgetMinutes: stored.filter((d) => d.date >= input.today).length * daily,
    plannedMinutes: days.filter((d) => d.date >= input.today).reduce((s, d) => s + d.minutes, 0),
    dailyMinutes: daily,
    assumedDailyMinutes: input.settings.dailyMinutes === undefined,
    ...(next ? { next } : {}),
  };
}

/** Unfinished items on days before today (a reason to reschedule). */
export function missedItems(plan: StudyPlan, today: string): PlanItem[] {
  return plan.days
    .filter((d) => d.date < today)
    .flatMap((d) => d.items)
    .filter((i) => i.status === 'pending');
}

/** "1 h 30 min", "45 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/* ---------------------------------------------------------------- Activity metadata */

/** Minutes for one challenge attempt by difficulty. */
export const CHALLENGE_MINUTES: Readonly<Record<Difficulty, number>> = {
  easy: 20,
  medium: 40,
  hard: 60,
};
/** Minutes for one Skill Mastery session (about ten questions). */
export const SKILL_SESSION_MINUTES = 25;

/** What the planner needs to know about content, from the public catalogs. */
export interface ActivityLookup {
  readonly hasSkill: (skillId: string) => boolean;
  readonly challenge: (id: string) =>
    | {
        readonly category: ChallengeCategory;
        readonly difficulty: Difficulty;
        readonly languages: readonly LanguageId[];
      }
    | undefined;
  readonly scenario: (id: string) => { readonly estimatedMinutes: number } | undefined;
  /** Web challenges (optional, so lookups from before them still work). */
  readonly webChallenge?: (
    id: string,
  ) => { readonly estimatedMinutes: number; readonly frameworks: readonly string[] } | undefined;
}

/**
 * Style and duration of an activity, or undefined when it does not exist
 * (or not in the requested language), so the planner never links to it.
 */
export function describeActivity(
  ref: ActivityRef,
  lookup: ActivityLookup,
): ActivityInfo | undefined {
  switch (ref.kind) {
    case 'skill':
      return lookup.hasSkill(ref.skillId)
        ? { style: 'knowledge', minutes: SKILL_SESSION_MINUTES }
        : undefined;
    case 'challenge': {
      const c = lookup.challenge(ref.challengeId);
      if (!c || (ref.language && !c.languages.includes(ref.language))) return undefined;
      return {
        style: c.category === 'enterprise' ? 'enterprise' : 'algorithm',
        minutes: CHALLENGE_MINUTES[c.difficulty],
      };
    }
    case 'scenario': {
      const s = lookup.scenario(ref.scenarioId);
      return s ? { style: 'scenario', minutes: s.estimatedMinutes } : undefined;
    }
    case 'web-challenge': {
      const w = lookup.webChallenge?.(ref.challengeId);
      if (!w || (ref.framework && !w.frameworks.includes(ref.framework))) return undefined;
      return { style: 'enterprise', minutes: w.estimatedMinutes };
    }
  }
}
