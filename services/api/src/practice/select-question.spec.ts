import type { QuestionDifficulty, SplitQuestion } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { type HistoryEntry, selectQuestion } from './select-question';

/** A minimal question: only id, difficulty and family matter to the selector. */
const q = (id: string, difficulty: QuestionDifficulty, familyId = id): SplitQuestion =>
  ({
    question: {
      id,
      version: 1,
      skillId: 's',
      familyId,
      difficulty,
      format: 'multiple-choice',
      prompt: [],
      options: [],
      selection: 'single',
      hintCount: 0,
    },
    grading: {
      questionId: id,
      version: 1,
      answer: { format: 'multiple-choice', correct: [] },
      hints: [],
      explanation: [],
    },
  }) as SplitQuestion;

const seen = (...entries: [string, HistoryEntry['result']][]): HistoryEntry[] =>
  entries.map(([questionId, result]) => ({ questionId, result }));

describe('selectQuestion', () => {
  const pool = [
    q('a1', 1, 'fam-a'),
    q('a2', 1, 'fam-a'),
    q('b1', 1, 'fam-b'),
    q('c1', 2, 'fam-c'),
    q('d1', 3, 'fam-d'),
  ];

  it('serves the learner’s tier', () => {
    const pick = selectQuestion(pool, 2, [], 'seed');
    expect(pick).toMatchObject({ question: { question: { id: 'c1' } }, reason: 'new' });
    expect(pick.note).toBeUndefined();
  });

  it('is deterministic for the same state and seed, and the seed only breaks ties', () => {
    const first = selectQuestion(pool, 1, [], 'learner|skill|0').question.question.id;
    for (let i = 0; i < 5; i++)
      expect(selectQuestion(pool, 1, [], 'learner|skill|0').question.question.id).toBe(first);
    const seeds = new Set(
      Array.from(
        { length: 30 },
        (_, i) => selectQuestion(pool, 1, [], `seed-${i}`).question.question.id,
      ),
    );
    // Only tier-1 questions are ever chosen; different seeds spread across them.
    expect([...seeds].every((id) => ['a1', 'a2', 'b1'].includes(id))).toBe(true);
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('prefers a family not seen yet over another variant of a seen family', () => {
    const pick = selectQuestion(pool, 1, seen(['a1', 'correct']), 'any');
    expect(pick.question.question.id).toBe('b1');
  });

  it('then an unseen variant of a family not seen recently', () => {
    const history = seen(['x', 'correct'], ['y', 'correct'], ['b1', 'correct'], ['a1', 'correct']);
    expect(selectQuestion(pool, 1, history, 'any').question.question.id).toBe('a2');
  });

  it('brings back a missed question for review once a few others have passed', () => {
    const tooSoon = seen(['x', 'correct'], ['b1', 'incorrect']);
    const due = seen(['x', 'correct'], ['y', 'correct'], ['z', 'correct'], ['b1', 'incorrect']);
    const onlyB = [q('b1', 1), q('a1', 1, 'fam-a'), q('a2', 1, 'fam-a')];
    const allSeen = [
      ['a1', 'correct'],
      ['a2', 'correct'],
    ] as [string, HistoryEntry['result']][];
    const soon = selectQuestion(onlyB, 1, [...tooSoon, ...seen(...allSeen)], 's');
    expect(soon.reason).not.toBe('review');
    const pick = selectQuestion(onlyB, 1, [...due, ...seen(...allSeen)], 's');
    expect(pick).toMatchObject({ question: { question: { id: 'b1' } }, reason: 'review' });
    expect(pick.note).toContain('Review');
  });

  it('uses the nearest tier, and says so, when the learner’s tier has nothing new', () => {
    const history = seen(['c1', 'correct']);
    const pick = selectQuestion(pool, 2, history, 's');
    expect(pick.reason).toBe('new');
    expect(pick.question.question.difficulty).toBe(1); // easier before harder at equal distance
    expect(pick.note).toBe(
      'No new Elementary questions are left in this skill, so this one is Beginner.',
    );
  });

  it('repeats only when everything has been seen, least recently seen first, and says so', () => {
    const small = [q('p', 1), q('r', 1), q('t', 1)];
    const history = seen(['p', 'correct'], ['t', 'correct'], ['r', 'correct']);
    const pick = selectQuestion(small, 1, history, 's');
    expect(pick).toMatchObject({ question: { question: { id: 'r' } }, reason: 'repeat' });
    expect(pick.note).toContain('repeat');
  });

  it('never repeats one of the last two questions while another is available', () => {
    const small = [q('p', 1), q('r', 1)];
    const history = seen(['r', 'correct'], ['p', 'correct'], ['r', 'correct']);
    expect(selectQuestion(small, 1, history, 's').question.question.id).toBe('p');
  });

  it('serves a whole pool before repeating anything (no early repeats)', () => {
    const big = Array.from({ length: 12 }, (_, i) => q(`v${i}`, 1, `f${i % 4}`));
    const history: HistoryEntry[] = [];
    const served: string[] = [];
    for (let n = 0; n < 12; n++) {
      const pick = selectQuestion(big, 1, history, `u|s|${n}`);
      expect(pick.reason, `answer ${n}`).toBe('new');
      served.push(pick.question.question.id);
      history.unshift({ questionId: pick.question.question.id, result: 'correct' });
    }
    expect(new Set(served).size).toBe(12);
    // Families rotate: no family twice in a row.
    const families = served.map((id) => `f${Number(id.slice(1)) % 4}`);
    expect(families.some((f, i) => f === families[i - 1])).toBe(false);
    expect(selectQuestion(big, 1, history, 'u|s|12').reason).toBe('repeat');
  });

  it('fails loudly for a skill without questions', () => {
    expect(() => selectQuestion([], 1, [], 's')).toThrow('A skill has no questions.');
  });
});
