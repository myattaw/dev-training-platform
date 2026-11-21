import { DEFAULT_SCORING_CONFIG, type ScoreBand, type ScoringConfig } from './config';

export type AttemptResult = 'correct' | 'partial' | 'incorrect';

export interface Attempt {
  readonly result: AttemptResult;
  /** Difficulty of the question answered, 1–5. */
  readonly difficulty: number;
  readonly hintsUsed: number;
}

/** Per-learner, per-skill state. Stored by the server; never computed only in the browser. */
export interface MasteryState {
  /** 0–100. 100 means demonstrated mastery. */
  readonly score: number;
  readonly attempts: number;
  readonly correctStreak: number;
  /** Consecutive hint-free correct answers in the mastery zone at sufficient difficulty. */
  readonly masteryStreak: number;
  /** Highest checkpoint reached; the score never falls below it. */
  readonly checkpoint: number;
  /** True once the learner has reached 100. Never reset. */
  readonly mastered: boolean;
  /** Config version that produced this state. */
  readonly configVersion: number;
}

export interface AttemptOutcome {
  readonly state: MasteryState;
  readonly scoreDelta: number;
  readonly xpAwarded: number;
  /** Set when this attempt reached a new checkpoint. */
  readonly checkpointReached?: number;
  /** True only on the attempt that first reached 100. */
  readonly masteredNow: boolean;
}

export function initialState(config: ScoringConfig = DEFAULT_SCORING_CONFIG): MasteryState {
  return {
    score: 0,
    attempts: 0,
    correctStreak: 0,
    masteryStreak: 0,
    checkpoint: 0,
    mastered: false,
    configVersion: config.version,
  };
}

/** The band for a score. A score of 100 uses the top band. */
export function bandFor(score: number, config: ScoringConfig = DEFAULT_SCORING_CONFIG): ScoreBand {
  const clamped = Math.min(99, Math.max(0, score));
  const band = config.bands.find((b) => clamped >= b.min && clamped <= b.max);
  if (!band) throw new Error(`No scoring band covers ${clamped}; validate the config.`);
  return band;
}

/** The question difficulty to offer next. */
export function targetDifficulty(
  state: MasteryState,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  return bandFor(state.score, config).targetDifficulty;
}

/**
 * Applies one answer to a mastery state. Pure and deterministic: the same
 * inputs always give the same output, so outcomes can be recomputed and audited.
 */
export function applyAttempt(
  state: MasteryState,
  attempt: Attempt,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): AttemptOutcome {
  const band = bandFor(state.score, config);
  const steps = attempt.difficulty - band.targetDifficulty;
  const inZone = state.score >= config.mastery.zoneStart;
  const floor = Math.max(state.checkpoint, state.mastered ? config.mastery.floorAfterMastery : 0);

  let score = state.score;
  let correctStreak = state.correctStreak;
  let masteryStreak = state.masteryStreak;

  switch (attempt.result) {
    case 'correct': {
      correctStreak += 1;
      const countsForMastery =
        inZone && attempt.hintsUsed === 0 && attempt.difficulty >= config.mastery.minDifficulty;
      masteryStreak = countsForMastery ? masteryStreak + 1 : 0;
      score += gainFor(band.gain, steps, attempt.hintsUsed, correctStreak, config);
      break;
    }
    case 'partial': {
      // Not a demonstration of mastery, but not a mistake either: no loss, streak kept.
      masteryStreak = 0;
      score += Math.round(
        gainFor(band.gain, steps, attempt.hintsUsed, 0, config) * config.partialCredit,
      );
      break;
    }
    case 'incorrect': {
      score -= lossFor(band.loss, steps, state.correctStreak, config);
      correctStreak = 0;
      masteryStreak = 0;
      break;
    }
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
      configVersion: config.version,
    },
    scoreDelta: score - state.score,
    xpAwarded: xpFor(attempt, config),
    ...(reached.length > 0 ? { checkpointReached: checkpoint } : {}),
    masteredNow,
  };
}

function gainFor(
  base: number,
  steps: number,
  hintsUsed: number,
  streak: number,
  config: ScoringConfig,
): number {
  const { harder, easier } = config.gainPerDifficultyStep;
  const difficulty = Math.max(
    config.minDifficultyMultiplier,
    steps >= 0 ? 1 + harder * steps : 1 + easier * steps,
  );
  const hints = hintMultiplier(hintsUsed, config);
  const { from, perAnswer, max } = config.streakBonus;
  const bonus = streak >= from ? Math.min(max, (streak - from + 1) * perAnswer) : 0;
  const gain = Math.round(base * difficulty * hints) + (hintsUsed === 0 ? bonus : 0);
  return Math.min(config.maxGainPerAnswer, Math.max(1, gain));
}

function lossFor(base: number, steps: number, streakBefore: number, config: ScoringConfig): number {
  const difficulty =
    steps > 0
      ? Math.max(config.minDifficultyMultiplier, 1 - config.lossReductionPerHarderStep * steps)
      : 1;
  const slip =
    streakBefore >= config.slipForgiveness.minStreak ? config.slipForgiveness.lossMultiplier : 1;
  return Math.min(config.maxLossPerAnswer, Math.round(base * difficulty * slip));
}

/** XP rewards effort: always at least 1, scaled by difficulty, reduced by hints (except for misses). */
function xpFor(attempt: Attempt, config: ScoringConfig): number {
  const per = config.xpPerDifficulty[attempt.result];
  const hints = attempt.result === 'incorrect' ? 1 : hintMultiplier(attempt.hintsUsed, config);
  return Math.max(1, Math.round(per * attempt.difficulty * hints));
}

function hintMultiplier(hintsUsed: number, config: ScoringConfig): number {
  const index = Math.min(Math.max(0, hintsUsed), config.hintMultipliers.length - 1);
  return config.hintMultipliers[index] ?? 1;
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
