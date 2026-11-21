import { describe, expect, it } from 'vitest';
import { fixtureContent } from '../testing/fixtures';
import { selectQuestion } from './select-question';

const questions = fixtureContent().questions('demo-skill');
const pick = (target: number, recent: string[] = [], random = () => 0) =>
  selectQuestion(questions, target, recent, random).question.id;

describe('selectQuestion', () => {
  it('picks the question at the target difficulty', () => {
    expect(pick(1)).toBe('q-mcq');
    expect(pick(3)).toBe('q-output');
    expect(pick(5)).toBe('q-hard');
  });

  it('avoids questions answered recently, preferring the nearest difficulty', () => {
    expect(pick(3, ['q-output'])).toBe('q-multi'); // difficulty 2 and 4 tie; random 0 picks the first
    expect(pick(3, ['q-output'], () => 0.99)).toBe('q-blank');
  });

  it('prefers an unseen question, even further from the target, over an immediate repeat', () => {
    const allRecent = ['q-mcq', 'q-multi', 'q-output'];
    // q-blank and q-hard are not recent: distance 30/40 beats +100 for repeating.
    expect(pick(1, allRecent)).toBe('q-blank');
  });

  it('fails loudly for a skill without questions', () => {
    expect(() => selectQuestion([], 1, [], Math.random)).toThrow('A skill has no questions.');
  });
});
