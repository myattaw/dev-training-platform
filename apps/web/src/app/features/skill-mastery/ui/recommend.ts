import type { SkillProgress } from '@pracstack/api-contracts';
import type { Skill } from '@pracstack/content-model';

/** A prerequisite counts as "ready" once the learner is past the basics of it. */
export const PREREQUISITE_READY_SCORE = 50;

export interface Recommendations {
  /** The first skill (in curriculum order) that is started but not mastered. */
  readonly resume?: Skill;
  /** The next skill to start, and why. */
  readonly next?: { readonly skill: Skill; readonly reason: string };
}

/**
 * Picks what to practice in a technology, from the curriculum order, the
 * skills' prerequisites and the learner's progress. Advisory only: every
 * skill stays open.
 */
export function recommend(
  skills: readonly Skill[],
  progress: ReadonlyMap<string, SkillProgress>,
): Recommendations {
  const started = (id: string) => (progress.get(id)?.attempts ?? 0) > 0;
  const ready = (id: string) => {
    const p = progress.get(id);
    return !!p && (p.mastered || p.score >= PREREQUISITE_READY_SCORE);
  };
  const name = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

  const resume = skills.find((s) => started(s.id) && !progress.get(s.id)?.mastered);
  const fresh = skills.filter((s) => !started(s.id) && s.id !== resume?.id);

  const byReady = fresh.find((s) => (s.prerequisites ?? []).every(ready));
  const byStarted = fresh.find((s) => (s.prerequisites ?? []).every(started));
  const skill = byReady ?? byStarted ?? fresh[0];

  let next: Recommendations['next'];
  if (skill) {
    const prerequisites = skill.prerequisites ?? [];
    const reason =
      prerequisites.length === 0
        ? 'A good place to start: it builds on nothing else.'
        : skill === byReady
          ? `You are past the basics of ${prerequisites.map(name).join(' and ')}, which it builds on.`
          : `It builds on ${prerequisites.map(name).join(' and ')}; practicing ${prerequisites.length > 1 ? 'those' : 'that'} first will help.`;
    next = { skill, reason };
  }
  return { ...(resume ? { resume } : {}), ...(next ? { next } : {}) };
}
