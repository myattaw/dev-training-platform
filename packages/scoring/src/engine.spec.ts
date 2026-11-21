import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORING_CONFIG,
  MAX_TIER,
  type ScoringConfig,
  tierLabel,
  validateScoringConfig,
} from './config';
import {
  applyAttempt,
  type Attempt,
  type AttemptResult,
  initialState,
  type MasteryState,
  migrateState,
  replay,
  targetDifficulty,
} from './engine';

const at = (score: number, extra: Partial<MasteryState> = {}): MasteryState => ({
  ...initialState(),
  score,
  ...extra,
});
const correct = (difficulty: number, extra: Partial<Attempt> = {}): Attempt => ({
  result: 'correct',
  difficulty,
  hintsUsed: 0,
  ...extra,
});
const incorrect = (difficulty: number): Attempt => ({
  result: 'incorrect',
  difficulty,
  hintsUsed: 0,
});
const partial = (difficulty: number): Attempt => ({ result: 'partial', difficulty, hintsUsed: 0 });

/** Plays "always answer correctly at the offered tier, no hints, never a repeat" until mastered. */
function answersToMastery(config: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
  let state = initialState(config);
  for (let n = 1; n <= 200; n++) {
    const outcome = applyAttempt(state, correct(targetDifficulty(state)), config);
    state = outcome.state;
    if (outcome.masteredNow) return n;
  }
  return Number.POSITIVE_INFINITY;
}

describe('default config', () => {
  it('is valid', () => {
    expect(validateScoringConfig(DEFAULT_SCORING_CONFIG)).toEqual([]);
  });

  it('rejects inconsistent configs', () => {
    const broken: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      tiers: [
        { gain: 6, scoreCap: 30 },
        { gain: 0, scoreCap: 20 },
        { gain: 8, scoreCap: 70 },
        { gain: 9, scoreCap: 80 },
        { gain: 10, scoreCap: 100 },
      ],
      checkpoints: [95],
    };
    expect(validateScoringConfig(broken)).toEqual(
      expect.arrayContaining([
        'tier 2 needs a positive gain',
        'tier 2 must have a higher score cap than tier 1',
        'score caps must be at most 99',
        'the mastery difficulty must be able to reach the mastery zone',
        'checkpoint 95 must be between 0 and the mastery zone',
      ]),
    );
  });

  it('names the tiers', () => {
    expect([1, 2, 3, 4, 5].map(tierLabel)).toEqual([
      'Beginner',
      'Elementary',
      'Intermediate',
      'Advanced',
      'Expert',
    ]);
  });
});

describe('difficulty tier (separate from the score)', () => {
  it('starts new learners at the first tier', () => {
    expect(targetDifficulty(initialState())).toBe(1);
  });

  it('moves up one tier after two first-time, hint-free correct answers', () => {
    const [a, b] = replay([correct(1), correct(1)]);
    expect(a?.state.tier).toBe(1);
    expect(a?.tierChange).toBe('none');
    expect(b?.state.tier).toBe(2);
    expect(b?.tierChange).toBe('up');
  });

  it('moves down one tier after two misses in a row at or below the tier', () => {
    const start = at(40, { tier: 3 });
    const [a, b] = replay([incorrect(3), incorrect(2)], DEFAULT_SCORING_CONFIG, start);
    expect(a?.state.tier).toBe(3);
    expect(b?.state.tier).toBe(2);
    expect(b?.tierChange).toBe('down');
  });

  it('never moves more than one tier per answer, and restarts its counters after a move', () => {
    const outcomes = replay([correct(1), correct(1), correct(2), correct(2), correct(3)]);
    expect(outcomes.map((o) => o.state.tier)).toEqual([1, 2, 2, 3, 3]);
  });

  it('does not oscillate: a single miss after a promotion keeps the tier', () => {
    const outcomes = replay([correct(1), correct(1), incorrect(2), correct(2)]);
    expect(outcomes.map((o) => o.state.tier)).toEqual([1, 2, 2, 2]);
  });

  it('ignores hinted answers, repeats and easier questions for promotion', () => {
    const start = at(20, { tier: 2 });
    for (const attempt of [
      correct(2, { hintsUsed: 1 }),
      correct(2, { repeat: true }),
      correct(1),
    ]) {
      const outcomes = replay([attempt, attempt], DEFAULT_SCORING_CONFIG, start);
      expect(outcomes.at(-1)?.state.tier, JSON.stringify(attempt)).toBe(2);
    }
  });

  it('does not step down for missing a question above the tier', () => {
    const outcomes = replay(
      [incorrect(4), incorrect(4)],
      DEFAULT_SCORING_CONFIG,
      at(30, { tier: 2 }),
    );
    expect(outcomes.at(-1)?.state.tier).toBe(2);
  });

  it('stays within tiers 1–5', () => {
    expect(replay([incorrect(1), incorrect(1)]).at(-1)?.state.tier).toBe(1);
    const top = at(95, { tier: MAX_TIER });
    expect(replay([correct(5), correct(5)], DEFAULT_SCORING_CONFIG, top).at(-1)?.state.tier).toBe(
      5,
    );
  });
});

describe('mastery score', () => {
  it('gains more for harder questions', () => {
    const gains = [1, 2, 3, 4, 5].map(
      (d) => applyAttempt(at(0, { tier: d }), correct(d)).scoreDelta,
    );
    expect(gains).toEqual([6, 7, 8, 9, 10]);
  });

  it('caps the score per tier, so easy questions cannot farm mastery', () => {
    const outcome = applyAttempt(at(28), correct(1));
    expect(outcome.state.score).toBe(30);
    expect(outcome.cappedByTier).toBe(true);
    const atCap = applyAttempt(at(30), correct(1));
    expect(atCap.scoreDelta).toBe(0);
    expect(atCap.xpAwarded).toBeGreaterThan(0);
    // Above the cap of an easier question, a correct answer never lowers the score.
    expect(applyAttempt(at(60), correct(1)).state.score).toBe(60);
  });

  it('reduces the gain for hints and repeats', () => {
    const full = applyAttempt(at(0, { tier: 3 }), correct(3)).scoreDelta;
    expect(applyAttempt(at(0, { tier: 3 }), correct(3, { hintsUsed: 1 })).scoreDelta).toBeLessThan(
      full,
    );
    expect(applyAttempt(at(0, { tier: 3 }), correct(3, { hintsUsed: 2 })).scoreDelta).toBeLessThan(
      applyAttempt(at(0, { tier: 3 }), correct(3, { hintsUsed: 1 })).scoreDelta,
    );
    expect(applyAttempt(at(0, { tier: 3 }), correct(3, { repeat: true })).scoreDelta).toBe(4);
  });

  it('adds a streak bonus from the third correct answer in a row, capped, hint-free only', () => {
    const streak = (n: number) => at(0, { tier: 5, correctStreak: n });
    expect(applyAttempt(streak(1), correct(5)).scoreDelta).toBe(10);
    expect(applyAttempt(streak(2), correct(5)).scoreDelta).toBe(11);
    expect(applyAttempt(streak(9), correct(5)).scoreDelta).toBe(13);
    expect(applyAttempt(streak(9), correct(5, { hintsUsed: 1 })).scoreDelta).toBe(6);
  });

  it('loses a few points for a miss, fewer for a question above the tier or after a streak', () => {
    expect(applyAttempt(at(20), incorrect(1)).scoreDelta).toBe(-2);
    expect(applyAttempt(at(60, { tier: 3 }), incorrect(3)).scoreDelta).toBe(-3);
    expect(applyAttempt(at(85, { tier: 4 }), incorrect(4)).scoreDelta).toBe(-4);
    expect(applyAttempt(at(85, { tier: 4 }), incorrect(5)).scoreDelta).toBe(-2);
    expect(applyAttempt(at(85, { tier: 4, correctStreak: 4 }), incorrect(4)).scoreDelta).toBe(-2);
  });

  it('never falls below a checkpoint or zero', () => {
    expect(applyAttempt(at(51, { checkpoint: 50, tier: 3 }), incorrect(3)).state.score).toBe(50);
    expect(applyAttempt(at(1), incorrect(1)).state.score).toBe(0);
  });

  it('gives partial answers half the gain and never takes points', () => {
    expect(applyAttempt(at(0, { tier: 3 }), partial(3)).scoreDelta).toBe(4);
    expect(applyAttempt(at(30, { tier: 3 }), partial(3)).scoreDelta).toBeGreaterThanOrEqual(0);
  });
});

describe('reaching 100', () => {
  const zone = (extra: Partial<MasteryState> = {}) => at(95, { tier: 5, ...extra });

  it('caps the score at 99 until mastery is demonstrated', () => {
    expect(applyAttempt(at(97, { tier: 5 }), correct(5)).state.score).toBe(99);
  });

  it('requires three first-time, hint-free correct answers in a row in the zone at tier 4+', () => {
    const outcomes = replay([correct(5), correct(4), correct(5)], DEFAULT_SCORING_CONFIG, zone());
    expect(outcomes.map((o) => o.state.score)).toEqual([99, 99, 100]);
    expect(outcomes[2]?.masteredNow).toBe(true);
  });

  it('does not count hinted answers, repeats or easy questions toward mastery', () => {
    for (const breaker of [
      correct(5, { hintsUsed: 1 }),
      correct(5, { repeat: true }),
      correct(3),
    ]) {
      const outcomes = replay(
        [correct(5), correct(5), breaker, correct(5)],
        DEFAULT_SCORING_CONFIG,
        zone(),
      );
      expect(
        outcomes.some((o) => o.masteredNow),
        JSON.stringify(breaker),
      ).toBe(false);
    }
  });

  it('keeps mastery once earned, with a floor of 90', () => {
    const mastered = at(100, { tier: 5, mastered: true, checkpoint: 80 });
    const after = replay(
      Array.from({ length: 10 }, () => incorrect(5)),
      DEFAULT_SCORING_CONFIG,
      mastered,
    );
    expect(after.at(-1)?.state.score).toBe(90);
    expect(after.at(-1)?.state.mastered).toBe(true);
    // Back to 100 with correct answers.
    const back = replay([correct(5), correct(5)], DEFAULT_SCORING_CONFIG, after.at(-1)!.state);
    expect(back.at(-1)?.state.score).toBe(100);
  });

  it(`takes a realistic number of answers: ${answersToMastery()} perfect answers from 0`, () => {
    const n = answersToMastery();
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(30);
  });

  it('climbs one tier per two answers, then needs sustained success at Expert', () => {
    let state = initialState();
    const path: { tier: number; score: number }[] = [];
    for (let i = 0; i < answersToMastery(); i++) {
      const tier = targetDifficulty(state);
      state = applyAttempt(state, correct(tier)).state;
      path.push({ tier, score: state.score });
    }
    expect(path.map((p) => p.tier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5]);
    expect(path.map((p) => p.score)).toEqual([6, 12, 20, 29, 40, 51, 63, 75, 88, 99, 99, 99, 100]);
  });

  it('cannot be reached by answering only easy questions, however many', () => {
    let state = initialState();
    for (let i = 0; i < 500; i++) state = applyAttempt(state, correct(3)).state;
    expect(state.score).toBe(70);
    expect(state.mastered).toBe(false);
  });
});

describe('migration from version 1', () => {
  it('keeps the score, streaks, checkpoint and mastery, and derives the tier from the old band', () => {
    const old = {
      score: 72,
      attempts: 9,
      correctStreak: 2,
      masteryStreak: 0,
      checkpoint: 50,
      mastered: false,
      configVersion: 1,
    };
    const migrated = migrateState(old);
    expect(migrated).toMatchObject({ ...old, tier: 4, tierCorrect: 0, tierMisses: 0 });
    expect(migrateState({ score: 0 }).tier).toBe(1);
    expect(migrateState({ score: 100, mastered: true }).tier).toBe(5);
  });

  it('applies attempts to old states without losing progress', () => {
    const outcome = applyAttempt(
      {
        score: 55,
        attempts: 4,
        correctStreak: 0,
        masteryStreak: 0,
        checkpoint: 50,
        mastered: false,
        configVersion: 1,
      } as MasteryState,
      correct(3),
    );
    expect(outcome.state.score).toBe(63);
    expect(outcome.state.configVersion).toBe(2);
  });
});

describe('XP', () => {
  it('is separate from mastery, scales with difficulty, and is reduced by hints and repeats', () => {
    expect(applyAttempt(at(0), correct(1)).xpAwarded).toBe(10);
    expect(applyAttempt(at(0), correct(4)).xpAwarded).toBe(40);
    expect(applyAttempt(at(0), correct(4, { hintsUsed: 1 })).xpAwarded).toBe(24);
    expect(applyAttempt(at(0), correct(4, { repeat: true })).xpAwarded).toBe(20);
    expect(applyAttempt(at(0), incorrect(4)).xpAwarded).toBe(4);
    // Still earned when the tier cap stops the score.
    expect(applyAttempt(at(30), correct(1)).xpAwarded).toBe(10);
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
          repeat: random() < 0.2,
        };
        const outcome = applyAttempt(state, attempt);
        const { state: next, scoreDelta, xpAwarded } = outcome;
        const where = `seed ${seed}, answer ${i} (${JSON.stringify(attempt)} from ${state.score}/tier ${state.tier})`;

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
        check(scoreDelta <= DEFAULT_SCORING_CONFIG.maxGainPerAnswer, `${where}: gained too much`);
        check(Math.abs(next.tier - state.tier) <= 1, `${where}: tier jumped`);
        check(next.tier >= 1 && next.tier <= 5, `${where}: tier out of range`);
        check(
          next.mastered ||
            attempt.result !== 'correct' ||
            scoreDelta === 0 ||
            next.score <=
              Math.max(state.score, DEFAULT_SCORING_CONFIG.tiers[attempt.difficulty - 1]!.scoreCap),
          `${where}: passed the tier cap`,
        );
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
