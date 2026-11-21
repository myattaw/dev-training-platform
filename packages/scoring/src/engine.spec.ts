import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_CONFIG, type ScoringConfig, validateScoringConfig } from './config';
import {
  applyAttempt,
  type Attempt,
  type AttemptResult,
  bandFor,
  initialState,
  type MasteryState,
  replay,
  targetDifficulty,
} from './engine';

const at = (score: number, extra: Partial<MasteryState> = {}): MasteryState => ({
  ...initialState(),
  score,
  ...extra,
});
const correct = (difficulty: number, hintsUsed = 0): Attempt => ({
  result: 'correct',
  difficulty,
  hintsUsed,
});
const incorrect = (difficulty: number): Attempt => ({
  result: 'incorrect',
  difficulty,
  hintsUsed: 0,
});
const partial = (difficulty: number): Attempt => ({ result: 'partial', difficulty, hintsUsed: 0 });

/** Plays "always answer correctly at the offered difficulty, no hints" until mastered. */
function answersToMastery(config: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
  let state = initialState(config);
  for (let n = 1; n <= 200; n++) {
    const { state: next, masteredNow } = applyAttempt(
      state,
      correct(targetDifficulty(state, config)),
      config,
    );
    state = next;
    if (masteredNow) return n;
  }
  throw new Error('never mastered');
}

describe('default config', () => {
  it('is valid', () => {
    expect(validateScoringConfig(DEFAULT_SCORING_CONFIG)).toEqual([]);
  });

  it('rejects gaps, bad ranges and bad checkpoints', () => {
    const broken: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      bands: [
        { min: 0, max: 40, targetDifficulty: 1, gain: 5, loss: 1 },
        { min: 45, max: 98, targetDifficulty: 7, gain: 0, loss: 1 },
      ],
      checkpoints: [95],
    };
    expect(validateScoringConfig(broken)).toEqual([
      'bands must end at 99',
      'gap or overlap between 40 and 45',
      'band 45–98 needs a positive gain',
      'band 45–98 target difficulty must be 1–5',
      'checkpoint 95 must be between 0 and the mastery zone',
    ]);
  });
});

describe('bands and question targeting', () => {
  it.each([
    [0, 1],
    [24, 1],
    [25, 2],
    [69, 3],
    [70, 4],
    [99, 5],
    [100, 5],
  ])('score %i targets difficulty %i', (score, difficulty) => {
    expect(targetDifficulty(at(score))).toBe(difficulty);
    expect(bandFor(score).targetDifficulty).toBe(difficulty);
  });
});

describe('correct answers', () => {
  it.each([
    // [score, difficulty, hints, expected gain]
    [0, 1, 0, 9], // on target in the first band
    [0, 2, 0, 11], // one step harder: 9 × 1.25
    [30, 1, 0, 5], // one step easier: 8 × 0.65
    [30, 2, 1, 5], // one hint: 8 × 0.6
    [30, 2, 5, 2], // many hints use the last multiplier: 8 × 0.3
    [75, 1, 0, 1], // far too easy is still worth at least 1 point
  ])('at %i, difficulty %i with %i hints gains %i', (score, difficulty, hints, gain) => {
    expect(applyAttempt(at(score), correct(difficulty, hints)).scoreDelta).toBe(gain);
  });

  it('adds a streak bonus from the third correct answer in a row, capped', () => {
    const deltas = replay(Array.from({ length: 6 }, () => correct(1))).map((o) => o.scoreDelta);
    // 9, 9, then +1, +2, +3, and after 25 the band changes (8 base at difficulty 2 → 1 step easier).
    expect(deltas.slice(0, 3)).toEqual([9, 9, 10]);
  });

  it('does not add the streak bonus when hints were used', () => {
    const outcome = applyAttempt(at(30, { correctStreak: 5 }), correct(2, 1));
    expect(outcome.scoreDelta).toBe(5);
  });
});

describe('incorrect answers', () => {
  it.each([
    [10, 1, 1], // low scores lose very little
    [60, 3, 3],
    [60, 5, 2], // missing a harder question costs less: 3 × 0.5 → 2 (rounded)
    [95, 5, 5],
  ])('at %i, difficulty %i loses %i', (score, difficulty, loss) => {
    expect(applyAttempt(at(score), incorrect(difficulty)).scoreDelta).toBe(-loss);
  });

  it('forgives a slip after a streak (half the loss)', () => {
    expect(applyAttempt(at(60, { correctStreak: 3 }), incorrect(3)).scoreDelta).toBe(-2);
    expect(applyAttempt(at(60, { correctStreak: 2 }), incorrect(3)).scoreDelta).toBe(-3);
  });

  it('never drops below a reached checkpoint', () => {
    expect(applyAttempt(at(51, { checkpoint: 50 }), incorrect(3)).state.score).toBe(50);
    expect(applyAttempt(at(81, { checkpoint: 80 }), incorrect(4)).state.score).toBe(80);
  });

  it('never goes below zero', () => {
    expect(applyAttempt(at(0), incorrect(1)).state.score).toBe(0);
  });

  it('resets streaks', () => {
    const { state } = applyAttempt(at(92, { correctStreak: 4, masteryStreak: 2 }), incorrect(5));
    expect(state).toMatchObject({ correctStreak: 0, masteryStreak: 0 });
  });
});

describe('partial credit', () => {
  it('gains half and never loses points', () => {
    expect(applyAttempt(at(0), partial(1)).scoreDelta).toBe(5); // round(9 × 0.5)
    expect(applyAttempt(at(95), partial(5)).scoreDelta).toBe(2);
  });

  it('keeps the correct streak but does not count toward mastery', () => {
    const { state } = applyAttempt(at(92, { correctStreak: 4, masteryStreak: 2 }), partial(5));
    expect(state).toMatchObject({ correctStreak: 4, masteryStreak: 0 });
  });
});

describe('checkpoints', () => {
  it('reports a newly reached checkpoint', () => {
    const outcome = applyAttempt(at(47), correct(2));
    expect(outcome.state.score).toBe(55);
    expect(outcome.checkpointReached).toBe(50);
    expect(outcome.state.checkpoint).toBe(50);
  });

  it('records the highest checkpoint when jumping past several', () => {
    const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, checkpoints: [10, 20] };
    // Two steps harder than the band target: 9 × 1.5 = 13.5 → 14 points, from 6 to 20.
    const outcome = applyAttempt(at(6), { result: 'correct', difficulty: 3, hintsUsed: 0 }, config);
    expect(outcome.state.score).toBe(20);
    expect(outcome.state.checkpoint).toBe(20);
  });
});

describe('mastery', () => {
  it('caps the score at 99 until mastery is demonstrated', () => {
    const outcome = applyAttempt(at(98), correct(5));
    expect(outcome.state.score).toBe(99);
    expect(outcome.masteredNow).toBe(false);
  });

  it('requires three hint-free correct answers in a row in the zone at difficulty 4+', () => {
    const outcomes = replay([correct(5), correct(4), correct(5)], undefined, at(90));
    // Difficulty 4 is one step below the zone's target, so it earns 3 × 0.65 ≈ 2 points.
    expect(outcomes.map((o) => o.state.score)).toEqual([93, 95, 100]);
    expect(outcomes.map((o) => o.masteredNow)).toEqual([false, false, true]);
    expect(outcomes[2]!.state.mastered).toBe(true);
  });

  it('does not count easy questions, hinted answers or answers from below the zone', () => {
    const easy = replay([correct(5), correct(3), correct(5), correct(5)], undefined, at(90));
    expect(easy.at(-1)!.masteredNow).toBe(false);

    const hinted = replay([correct(5), correct(5, 1), correct(5), correct(5)], undefined, at(90));
    expect(hinted.at(-1)!.masteredNow).toBe(false);

    // The answer that crosses 90 does not count: it was made below the zone.
    const crossing = replay([correct(5), correct(5), correct(5)], undefined, at(89));
    expect(crossing.at(-1)!.masteredNow).toBe(false);
  });

  it('keeps mastery once earned, with a floor of 90', () => {
    const mastered = at(100, { mastered: true, checkpoint: 80 });
    const afterMisses = replay([incorrect(5), incorrect(5), incorrect(5)], undefined, mastered);
    expect(afterMisses.map((o) => o.state.score)).toEqual([95, 90, 90]);
    expect(afterMisses.at(-1)!.state.mastered).toBe(true);
    // Back to 100 without another streak.
    const recovered = replay(
      [correct(5), correct(5), correct(5), correct(5)],
      undefined,
      afterMisses.at(-1)!.state,
    );
    expect(recovered.at(-1)!.state.score).toBe(100);
  });

  it(`takes a realistic number of answers: ${answersToMastery()} perfect answers from 0`, () => {
    expect(answersToMastery()).toBe(13);
  });
});

describe('XP', () => {
  it('is separate from mastery, scales with difficulty and never decreases', () => {
    expect(applyAttempt(at(0), correct(3)).xpAwarded).toBe(30);
    expect(applyAttempt(at(0), correct(3, 1)).xpAwarded).toBe(18);
    expect(applyAttempt(at(0), partial(2)).xpAwarded).toBe(10);
    expect(applyAttempt(at(50), incorrect(4)).xpAwarded).toBe(4);
    // Mastered skills still earn XP for practice.
    expect(applyAttempt(at(100, { mastered: true }), correct(5)).xpAwarded).toBe(50);
  });
});

describe('invariants over random sessions (seeded, so failures are reproducible)', () => {
  function rng(seed: number): () => number {
    // mulberry32
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const results: AttemptResult[] = ['correct', 'partial', 'incorrect'];

  it('holds for 2,000 sessions of 60 random answers', () => {
    const violations: string[] = [];
    const check = (ok: boolean, message: string): void => {
      if (!ok && violations.length < 10) violations.push(message);
    };

    for (let seed = 1; seed <= 2000; seed++) {
      const random = rng(seed);
      let state = initialState();
      for (let i = 0; i < 60; i++) {
        const attempt: Attempt = {
          result: results[Math.floor(random() * 3)]!,
          difficulty: 1 + Math.floor(random() * 5),
          hintsUsed: Math.floor(random() * 3),
        };
        const outcome = applyAttempt(state, attempt);
        const { state: next, scoreDelta, xpAwarded } = outcome;
        const where = `seed ${seed}, answer ${i} (${JSON.stringify(attempt)} from ${state.score})`;

        check(next.score >= 0 && next.score <= 100, `${where}: score ${next.score} out of range`);
        check(Number.isInteger(next.score), `${where}: non-integer score`);
        check(next.score < 100 || next.mastered, `${where}: 100 without mastery`);
        check(
          next.score >= state.checkpoint,
          `${where}: fell below checkpoint ${state.checkpoint}`,
        );
        check(
          attempt.result === 'incorrect' ? scoreDelta <= 0 : scoreDelta >= 0,
          `${where}: ${attempt.result} changed the score by ${scoreDelta}`,
        );
        check(scoreDelta >= -DEFAULT_SCORING_CONFIG.maxLossPerAnswer, `${where}: lost too much`);
        check(xpAwarded >= 1, `${where}: no XP`);
        check(next.mastered || !state.mastered, `${where}: mastery lost`);
        check(
          JSON.stringify(applyAttempt(state, attempt)) === JSON.stringify(outcome),
          `${where}: not deterministic`,
        );
        state = next;
      }
    }
    expect(violations).toEqual([]);
  });
});
