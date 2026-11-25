import type { PlanSettings as SavedSettings } from '@pracstack/api-contracts';
import {
  type ActivityLookup,
  type ActivityProgress,
  type ActivityRef,
  addDays,
  masteryState,
  type PlanItem,
  type PlanSettings,
} from '@pracstack/content-model';
import { type ActivityIndex, resolveActivity } from './role-content';
import type { ProgressData } from './role-progress';

/*
 * Glue between the study planner (@pracstack/content-model study-planner.ts)
 * and the app: content metadata from the public catalogs, progress from the
 * server, and display helpers.
 */

/** Content metadata for the planner, from the public catalogs (never links missing content). */
export function activityLookup(index: ActivityIndex): ActivityLookup {
  return {
    hasSkill: (id) => index.skills.has(id),
    challenge: (id) => index.challenges.get(id),
    scenario: (id) => index.scenarios?.get(id),
    webChallenge: (id) => index.webChallenges?.get(id),
  };
}

/** Server-graded progress for the planner; undefined when unknown (signed out). */
export function plannerProgress(
  data: ProgressData | undefined,
): ((ref: ActivityRef) => ActivityProgress | undefined) | undefined {
  if (!data) return undefined;
  return (ref) => {
    switch (ref.kind) {
      case 'skill': {
        const p = data.skills.get(ref.skillId);
        return {
          kind: 'skill',
          state: p ? masteryState(p) : 'not-assessed',
        };
      }
      case 'challenge': {
        const p = data.challenges.get(ref.challengeId);
        const done = p
          ? ref.language
            ? p.languagesSolved.includes(ref.language)
            : p.solved
          : false;
        return { kind: 'task', done, attempted: (p?.attempts ?? 0) > 0 };
      }
      case 'scenario': {
        if (!data.scenarios) return undefined;
        const p = data.scenarios.get(ref.scenarioId);
        return { kind: 'task', done: p?.completed ?? false, attempted: p !== undefined };
      }
      case 'web-challenge': {
        if (!data.webChallenges) return undefined;
        const p = data.webChallenges.get(ref.challengeId);
        const done = p
          ? ref.framework
            ? p.frameworksSolved.includes(ref.framework)
            : p.solved
          : false;
        return { kind: 'task', done, attempted: (p?.attempts ?? 0) > 0 };
      }
    }
  };
}

/** Today in the learner's time zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "Mon, Mar 2". */
export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Quick interview-date choices. */
export const DATE_PRESETS: readonly { readonly label: string; readonly days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In 1 week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
  { label: 'In 1 month', days: 30 },
];

export const presetDate = (today: string, days: number): string => addDays(today, days);

export const TIME_PRESETS: readonly { readonly label: string; readonly minutes: number }[] = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
];

/** Interview details as entered (all optional except the format). */
export type InterviewSettings = SavedSettings;

export const EMPTY_SETTINGS: InterviewSettings = { format: 'unknown' };

/** The planner's settings from interview details. */
export function plannerSettings(s: InterviewSettings): PlanSettings {
  return {
    format: s.format,
    ...(s.interviewDate ? { interviewDate: s.interviewDate } : {}),
    ...(s.dailyMinutes ? { dailyMinutes: s.dailyMinutes } : {}),
    ...(s.language ? { language: s.language } : {}),
  };
}

/** What a plan item is called and where it leads. */
export interface ItemView {
  readonly title: string;
  readonly detail: string;
  readonly link?: readonly string[];
}

export function itemView(item: PlanItem, index: ActivityIndex): ItemView {
  if (item.ref) {
    const a = resolveActivity(item.ref, index);
    return { title: a.title, detail: a.detail, ...(a.link ? { link: a.link } : {}) };
  }
  switch (item.kind) {
    case 'external':
      return {
        title: `Study ${item.termLabel ?? 'this'} outside PracStack`,
        detail: 'External study',
      };
    case 'review':
      return { title: 'Review your mistakes', detail: 'Review' };
    case 'mock':
      return { title: 'Mock interview', detail: 'Practice interview' };
    default:
      return { title: item.key, detail: '' };
  }
}

/** Items the learner marks done themselves (nothing server-graded). */
export const isManual = (item: PlanItem): boolean =>
  item.kind === 'external' || item.kind === 'review' || item.kind === 'mock';
