import { DEFAULT_SCORING_CONFIG, MAX_TIER, MIN_TIER, type ScoringConfig } from './config';

export type AttemptResult = 'correct' | 'partial' | 'incorrect';

export interface Attempt {
  readonly result: AttemptResult;
  /** Difficulty of the question answered, 1–5. */
  readonly difficulty: number;
  readonly hintsUsed: number;
  /**
   * The learner had already answered this exact question correctly before.
   * Repeats earn reduced credit and never count toward promotion or mastery.
   */
  readonly repeat?: boolean;
}

/** Per-learner, per-skill state. Stored by the server; never computed only in the browser. */
export interface MasteryState {
  /** 0–100. 100 means demonstrated mastery. */
  readonly score: number;
  readonly attempts: number;
  readonly correctStreak: number;
  /** Consecutive hint-free, first-time correct answers in the mastery zone at sufficient difficulty. */
  readonly masteryStreak: number;
  /** Highest checkpoint reached; the score never falls below it. */
  readonly checkpoint: number;
  /** True once the learner has reached 100. Never reset. */
  readonly mastered: boolean;
  /** Difficulty tier (1–5) of the questions the learner is offered. Separate from the score. */
  readonly tier: number;
  /** Consecutive qualifying correct answers at the current tier (toward promotion). */
  readonly tierCorrect: number;
  /** Consecutive incorrect answers at the current tier or below (toward demotion). */
  readonly tierMisses: number;
  /** Config version that produced this state. */
  readonly configVersion: number;
}

export type TierChange = 'up' | 'down' | 'none';

export interface AttemptOutcome {
  readonly state: MasteryState;
  readonly scoreDelta: number;
  readonly xpAwarded: number;
  /** Set when this attempt reached a new checkpoint. */
  readonly checkpointReached?: number;
  /** True only on the attempt that first reached 100. */
  readonly masteredNow: boolean;
  readonly tierChange: TierChange;
  /** True when the score could not rise because the question's tier caps it below the score. */
  readonly cappedByTier: boolean;
}

export function initialState(config: ScoringConfig = DEFAULT_SCORING_CONFIG): MasteryState {
  return {
    score: 0,
    attempts: 0,
    correctStreak: 0,
    masteryStreak: 0,
    checkpoint: 0,
    mastered: false,
    tier: MIN_TIER,
    tierCorrect: 0,
    tierMisses: 0,
    configVersion: config.version,
  };
}

/**
 * Brings a stored state up to the current shape. States from version 1 had no
 * tier: they get the tier version 1 would have offered at their score, so a
 * returning learner continues at a familiar difficulty. Scores, streaks,
 * checkpoints and mastery are kept unchanged.
 */
export function migrateState(state: Partial<MasteryState> & { score: number }): MasteryState {
  if (typeof state.tier === 'number') return state as MasteryState;
  const legacyTier = [24, 49, 69, 89, 99].findIndex((max) => Math.min(99, state.score) <= max) + 1;
  return {
    attempts: 0,
    correctStreak: 0,
    masteryStreak: 0,
    checkpoint: 0,
    mastered: false,
    configVersion: 1,
    ...state,
    tier: legacyTier || MIN_TIER,
    tierCorrect: 0,
    tierMisses: 0,
  };
}

/** The difficulty tier to offer next. */
export function targetDifficulty(state: MasteryState): number {
  return clampTier(migrateState(state).tier);
}

/**
 * Applies one answer to a mastery state. Pure and deterministic: the same
 * inputs always give the same output, so outcomes can be recomputed and audited.
 * The rules are documented in docs/scoring.md.
 */
export function applyAttempt(
  stored: MasteryState,
  attempt: Attempt,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): AttemptOutcome {
  const state = migrateState(stored);
  const difficulty = clampTier(attempt.difficulty);
  const rules = config.tiers[difficulty - 1] ?? config.tiers[0]!;
  const repeat = attempt.repeat === true;
  const hintFree = attempt.hintsUsed === 0;
  const floor = Math.max(state.checkpoint, state.mastered ? config.mastery.floorAfterMastery : 0);

  let score = state.score;
  let correctStreak = state.correctStreak;
  let masteryStreak = state.masteryStreak;
  let tierCorrect = state.tierCorrect;
  let tierMisses = state.tierMisses;
  let cappedByTier = false;

  switch (attempt.result) {
    case 'correct': {
      correctStreak += 1;
      tierMisses = 0;
      // Only first-time, hint-free answers at or above the current tier show readiness for more.
      tierCorrect = hintFree && !repeat && difficulty >= state.tier ? tierCorrect + 1 : tierCorrect;
      const inZone = state.score >= config.mastery.zoneStart;
      const countsForMastery =
        inZone && hintFree && !repeat && difficulty >= config.mastery.minDifficulty;
      masteryStreak = countsForMastery ? masteryStreak + 1 : 0;
      const gain = gainFor(rules.gain, attempt.hintsUsed, repeat, correctStreak, config);
      ({ score, cappedByTier } = raise(score, gain, rules.scoreCap, state.mastered));
      break;
    }
    case 'partial': {
      // Not a demonstration of mastery, but not a mistake either: no loss, streak kept.
      masteryStreak = 0;
      const gain = Math.round(
        gainFor(rules.gain, attempt.hintsUsed, repeat, 0, config) * config.partialCredit,
      );
      ({ score, cappedByTier } = raise(score, gain, rules.scoreCap, state.mastered));
      break;
    }
    case 'incorrect': {
      score -= lossFor(state.score, difficulty > state.tier, state.correctStreak, config);
      correctStreak = 0;
      masteryStreak = 0;
      tierCorrect = 0;
      // A miss on a question above the learner's tier is expected, not a reason to step down.
      tierMisses = difficulty <= state.tier ? tierMisses + 1 : tierMisses;
      break;
    }
  }

  // Tier moves one step at a time, and its counters restart after every move.
  let tier = state.tier;
  let tierChange: TierChange = 'none';
  if (tierCorrect >= config.progression.promoteAfter && tier < MAX_TIER) {
    tier += 1;
    tierChange = 'up';
  } else if (tierMisses >= config.progression.demoteAfter && tier > MIN_TIER) {
    tier -= 1;
    tierChange = 'down';
  }
  if (tierChange !== 'none') {
    tierCorrect = 0;
    tierMisses = 0;
  }

  // Reaching 100 must be earned with a streak in the mastery zone (unless already mastered once).
  const masteredNow = !state.mastered && masteryStreak >= config.mastery.requiredStreak;
  const mastered = state.mastered || masteredNow;
  const ceiling = mastered ? 100 : 99;
  score = masteredNow ? 100 : Math.min(ceiling, Math.max(floor, score));

  const reached = config.checkpoints.filter((c) => score >= c && c > state.checkpoint);
  const checkpoint = Math.max(state.checkpoint, ...reached);

  return {
    state: {
      score,
      attempts: state.attempts + 1,
      correctStreak,
      masteryStreak: masteredNow ? 0 : masteryStreak,
      checkpoint,
      mastered,
      tier,
      tierCorrect,
      tierMisses,
      configVersion: config.version,
    },
    scoreDelta: score - state.score,
    xpAwarded: xpFor(attempt, config),
    ...(reached.length > 0 ? { checkpointReached: checkpoint } : {}),
    masteredNow,
    tierChange,
    cappedByTier,
  };
}

/** Adds a gain without passing the tier's cap; a score already above the cap stays where it is. */
function raise(
  score: number,
  gain: number,
  cap: number,
  mastered: boolean,
): { score: number; cappedByTier: boolean } {
  const limit = mastered ? 100 : cap;
  if (score >= limit) return { score, cappedByTier: gain > 0 };
  const next = Math.min(limit, score + gain);
  return { score: next, cappedByTier: score + gain > limit };
}

function gainFor(
  base: number,
  hintsUsed: number,
  repeat: boolean,
  streak: number,
  config: ScoringConfig,
): number {
  const hints = hintMultiplier(hintsUsed, config);
  const again = repeat ? config.repeatMultiplier : 1;
  const { from, perAnswer, max } = config.streakBonus;
  const bonus =
    streak >= from && hintsUsed === 0 && !repeat
      ? Math.min(max, (streak - from + 1) * perAnswer)
      : 0;
  const gain = Math.round(base * hints * again) + bonus;
  return Math.min(config.maxGainPerAnswer, Math.max(1, gain));
}

function lossFor(
  score: number,
  harderThanTier: boolean,
  streakBefore: number,
  config: ScoringConfig,
): number {
  const base = [...config.loss].reverse().find((l) => score >= l.fromScore)?.points ?? 0;
  const harder = harderThanTier ? config.harderMissMultiplier : 1;
  const slip =
    streakBefore >= config.slipForgiveness.minStreak ? config.slipForgiveness.lossMultiplier : 1;
  return Math.min(config.maxLossPerAnswer, Math.max(1, Math.round(base * harder * slip)));
}

/** XP rewards effort: always at least 1, scaled by difficulty, reduced by hints and repeats. */
function xpFor(attempt: Attempt, config: ScoringConfig): number {
  const per = config.xpPerDifficulty[attempt.result];
  const hints = attempt.result === 'incorrect' ? 1 : hintMultiplier(attempt.hintsUsed, config);
  const again = attempt.repeat && attempt.result !== 'incorrect' ? config.repeatMultiplier : 1;
  return Math.max(1, Math.round(per * clampTier(attempt.difficulty) * hints * again));
}

function hintMultiplier(hintsUsed: number, config: ScoringConfig): number {
  const index = Math.min(Math.max(0, hintsUsed), config.hintMultipliers.length - 1);
  return config.hintMultipliers[index] ?? 1;
}

function clampTier(tier: number): number {
  return Math.min(MAX_TIER, Math.max(MIN_TIER, Math.round(tier)));
}

/** Applies a sequence of attempts from a starting state. Useful for tests, docs and replays. */
export function replay(
  attempts: readonly Attempt[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  start: MasteryState = initialState(config),
): AttemptOutcome[] {
  const outcomes: AttemptOutcome[] = [];
  let state = start;
  for (const attempt of attempts) {
    const outcome = applyAttempt(state, attempt, config);
    outcomes.push(outcome);
    state = outcome.state;
  }
  return outcomes;
}
