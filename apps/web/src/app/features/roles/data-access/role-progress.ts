import { inject, Injectable } from '@angular/core';
import type { ChallengeProgress, ScenarioProgress, SkillProgress } from '@pracstack/api-contracts';
import type { ActivityRef } from '@pracstack/content-model';
import { AuthService } from '../../../core/auth/auth.service';
import { PracticeApi } from '../../skill-mastery/data-access/practice-api';
import type { ActivityIndex } from './role-content';

/*
 * Role progress, computed only from server data the app already fetches:
 * skill scores per technology (GET /api/skill-mastery/progress) and solved
 * challenges (GET /api/challenges/progress), and Enterprise Scenario tasks
 * (GET /api/scenarios/progress). See docs/job-roles.md.
 */

export type ActivityStatus =
  /** Skill: the server marked it mastered. */
  | 'mastered'
  /** Skill: answered at least once, not mastered. */
  | 'practiced'
  /** Skill: never answered. */
  | 'not-assessed'
  /** Challenge: a submission passed every test (in the activity's language, if it has one). */
  | 'solved'
  /** Challenge: submitted, not solved (in that language). */
  | 'attempted'
  | 'not-solved'
  /** Scenario: every task done. */
  | 'completed'
  /** Scenario: some tasks done or attempted. */
  | 'in-progress'
  | 'not-started'
  /** Not trackable: signed out, or the content does not exist yet. */
  | 'unknown';

export interface ProgressData {
  readonly skills: ReadonlyMap<string, SkillProgress>;
  readonly challenges: ReadonlyMap<string, ChallengeProgress>;
  /** Started scenarios only; absent while loading. */
  readonly scenarios?: ReadonlyMap<string, ScenarioProgress>;
}

export function activityStatus(ref: ActivityRef, data: ProgressData | undefined): ActivityStatus {
  if (!data) return 'unknown';
  switch (ref.kind) {
    case 'skill': {
      const p = data.skills.get(ref.skillId);
      if (!p || p.attempts === 0) return 'not-assessed';
      return p.mastered ? 'mastered' : 'practiced';
    }
    case 'challenge': {
      const p = data.challenges.get(ref.challengeId);
      if (!p) return 'not-solved';
      const solved = ref.language ? p.languagesSolved.includes(ref.language) : p.solved;
      return solved ? 'solved' : p.attempts > 0 ? 'attempted' : 'not-solved';
    }
    case 'scenario': {
      if (!data.scenarios) return 'unknown';
      const p = data.scenarios.get(ref.scenarioId);
      if (!p) return 'not-started';
      return p.completed ? 'completed' : 'in-progress';
    }
  }
}

export const isDone = (status: ActivityStatus): boolean =>
  status === 'mastered' || status === 'solved' || status === 'completed';

export interface PathProgress {
  /** Competencies with at least one activity / all competencies. */
  readonly competenciesWithPractice: number;
  readonly competencies: number;
  readonly skills: {
    readonly total: number;
    readonly mastered: number;
    readonly practiced: number;
    readonly notAssessed: number;
  };
  readonly challenges: { readonly total: number; readonly solved: number };
  readonly scenarios: { readonly total: number; readonly completed: number };
  /** First activity, in path order, that is not mastered, solved or completed. */
  readonly next?: { readonly groupIndex: number; readonly ref: ActivityRef };
}

/**
 * Separate counts, deliberately not combined into one "readiness" number:
 * mastering skills and solving challenges are different evidence, and none of
 * it is professional experience.
 */
export function pathProgress(
  groups: readonly { readonly activities: readonly ActivityRef[] }[],
  data: ProgressData | undefined,
): PathProgress {
  const skills = { total: 0, mastered: 0, practiced: 0, notAssessed: 0 };
  const challenges = { total: 0, solved: 0 };
  const scenarios = { total: 0, completed: 0 };
  let next: PathProgress['next'];
  groups.forEach((group, groupIndex) => {
    for (const ref of group.activities) {
      const status = activityStatus(ref, data);
      if (ref.kind === 'skill') {
        skills.total++;
        if (status === 'mastered') skills.mastered++;
        else if (status === 'practiced') skills.practiced++;
        else skills.notAssessed++;
      } else if (ref.kind === 'challenge') {
        challenges.total++;
        if (status === 'solved') challenges.solved++;
      } else {
        scenarios.total++;
        if (status === 'completed') scenarios.completed++;
      }
      if (!next && !isDone(status)) next = { groupIndex, ref };
    }
  });
  return {
    competenciesWithPractice: groups.filter((g) => g.activities.length > 0).length,
    competencies: groups.length,
    skills,
    challenges,
    scenarios,
    ...(next ? { next } : {}),
  };
}

/** Loads skill progress for the technologies an activity list touches. */
@Injectable({ providedIn: 'root' })
export class RoleProgressLoader {
  private readonly practice = inject(PracticeApi);
  private readonly auth = inject(AuthService);

  /** Undefined when signed out (nothing to track). */
  async skills(
    refs: readonly ActivityRef[],
    index: ActivityIndex,
  ): Promise<ReadonlyMap<string, SkillProgress> | undefined> {
    if (!this.auth.canUseApi()) return undefined;
    const technologies = new Set(
      refs.flatMap((r) => {
        const technologyId = r.kind === 'skill' ? index.skills.get(r.skillId)?.technologyId : '';
        return technologyId ? [technologyId] : [];
      }),
    );
    const responses = await Promise.all([...technologies].map((id) => this.practice.progress(id)));
    return new Map(responses.flatMap((r) => r.skills.map((s) => [s.skillId, s] as const)));
  }
}
