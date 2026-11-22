import type { SkillProgress } from '@pracstack/api-contracts';
import type { Skill } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { recommend } from './recommend';

const skill = (id: string, prerequisites?: string[]): Skill => ({
  id,
  topicId: 't',
  name: id.toUpperCase(),
  description: '',
  ...(prerequisites ? { prerequisites } : {}),
});
const skills = [skill('a'), skill('b', ['a']), skill('c', ['b']), skill('d')];
const p = (skillId: string, score: number, mastered = false): SkillProgress => ({
  skillId,
  score,
  tier: 1,
  mastered,
  attempts: score === 0 ? 0 : 5,
});
const map = (...list: SkillProgress[]) => new Map(list.map((x) => [x.skillId, x]));

describe('recommend', () => {
  it('starts a new learner on the first skill without prerequisites', () => {
    expect(recommend(skills, map())).toEqual({
      next: { skill: skills[0], reason: 'A good place to start: it builds on nothing else.' },
    });
  });

  it('resumes the first started skill and suggests the next one whose prerequisites are ready', () => {
    const r = recommend(skills, map(p('a', 60), p('b', 10)));
    expect(r.resume?.id).toBe('a');
    // b is started; c needs b (not ready yet); d has no prerequisites.
    expect(r.next?.skill.id).toBe('d');
  });

  it('explains a recommendation that builds on a skill the learner is past the basics of', () => {
    const r = recommend(skills, map(p('a', 100, true)));
    expect(r.resume).toBeUndefined();
    expect(r.next).toEqual({
      skill: skills[1],
      reason: 'You are past the basics of A, which it builds on.',
    });
  });

  it('recommends nothing once every skill is mastered', () => {
    const all = map(...skills.map((s) => p(s.id, 100, true)));
    expect(recommend(skills, all)).toEqual({});
  });
});
