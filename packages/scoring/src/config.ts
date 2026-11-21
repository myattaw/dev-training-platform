/**
 * Every number the mastery engine uses lives here, so the algorithm can be
 * tuned without code changes. Configs are versioned: a learner's state records
 * the version it was computed with, so history stays explainable after tuning.
 * See docs/scoring.md for the rationale behind each value.
 */
export interface ScoreBand {
  /** Inclusive score range this band covers. */
  readonly min: number;
  readonly max: number;
  /** Question difficulty (1–5) the learner is offered in this band. */
  readonly targetDifficulty: number;
  /** Points for a correct answer at the target difficulty. */
  readonly gain: number;
  /** Points lost for an incorrect answer at the target difficulty. */
  readonly loss: number;
}

export interface ScoringConfig {
  readonly version: number;
  /** Contiguous bands covering 0–99. (100 means mastered and has no band.) */
  readonly bands: readonly ScoreBand[];
  /** Gain multiplier change per difficulty step above (+) or below (−) the band target. */
  readonly gainPerDifficultyStep: { readonly harder: number; readonly easier: number };
  /** Loss multiplier change per difficulty step above the target (missing a harder question costs less). */
  readonly lossReductionPerHarderStep: number;
  /** Lowest multiplier difficulty adjustments can produce. */
  readonly minDifficultyMultiplier: number;
  /** Fraction of the gain awarded for a partially correct answer. Partial answers never lose points. */
  readonly partialCredit: number;
  /** Gain multiplier by number of hints used; the last entry applies to any higher count. */
  readonly hintMultipliers: readonly number[];
  /** Once reached, the score never drops below these. */
  readonly checkpoints: readonly number[];
  /** Extra points for consecutive correct answers, starting at the `from`-th in a row. */
  readonly streakBonus: { readonly from: number; readonly perAnswer: number; readonly max: number };
  /** A miss right after a streak of at least `minStreak` costs `lossMultiplier` × the usual loss. */
  readonly slipForgiveness: { readonly minStreak: number; readonly lossMultiplier: number };
  readonly mastery: {
    /** Scores at or above this are the "mastery zone". */
    readonly zoneStart: number;
    /** Consecutive hint-free correct answers in the zone needed to reach 100. */
    readonly requiredStreak: number;
    /** Only answers at or above this difficulty count toward the streak. */
    readonly minDifficulty: number;
    /** After mastering, the score never drops below this. */
    readonly floorAfterMastery: number;
  };
  readonly maxGainPerAnswer: number;
  readonly maxLossPerAnswer: number;
  /** XP per difficulty point. XP never decreases and is independent of mastery. */
  readonly xpPerDifficulty: {
    readonly correct: number;
    readonly partial: number;
    readonly incorrect: number;
  };
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: 1,
  bands: [
    { min: 0, max: 24, targetDifficulty: 1, gain: 9, loss: 1 },
    { min: 25, max: 49, targetDifficulty: 2, gain: 8, loss: 2 },
    { min: 50, max: 69, targetDifficulty: 3, gain: 7, loss: 3 },
    { min: 70, max: 89, targetDifficulty: 4, gain: 5, loss: 4 },
    { min: 90, max: 99, targetDifficulty: 5, gain: 3, loss: 5 },
  ],
  gainPerDifficultyStep: { harder: 0.25, easier: 0.35 },
  lossReductionPerHarderStep: 0.25,
  minDifficultyMultiplier: 0.25,
  partialCredit: 0.5,
  hintMultipliers: [1, 0.6, 0.3],
  checkpoints: [50, 80],
  streakBonus: { from: 3, perAnswer: 1, max: 3 },
  slipForgiveness: { minStreak: 3, lossMultiplier: 0.5 },
  mastery: { zoneStart: 90, requiredStreak: 3, minDifficulty: 4, floorAfterMastery: 90 },
  maxGainPerAnswer: 15,
  maxLossPerAnswer: 8,
  xpPerDifficulty: { correct: 10, partial: 5, incorrect: 1 },
};

/** Returns a list of problems; an empty list means the config is usable. */
export function validateScoringConfig(config: ScoringConfig): string[] {
  const problems: string[] = [];
  const bands = [...config.bands].sort((a, b) => a.min - b.min);
  if (bands[0]?.min !== 0) problems.push('bands must start at 0');
  if (bands.at(-1)?.max !== 99) problems.push('bands must end at 99');
  bands.forEach((band, i) => {
    if (band.min > band.max) problems.push(`band ${band.min}–${band.max} is empty`);
    const next = bands[i + 1];
    if (next && next.min !== band.max + 1) {
      problems.push(`gap or overlap between ${band.max} and ${next.min}`);
    }
    if (band.gain <= 0) problems.push(`band ${band.min}–${band.max} needs a positive gain`);
    if (band.loss < 0) problems.push(`band ${band.min}–${band.max} has a negative loss`);
    if (band.targetDifficulty < 1 || band.targetDifficulty > 5) {
      problems.push(`band ${band.min}–${band.max} target difficulty must be 1–5`);
    }
  });
  if (config.hintMultipliers.length === 0) problems.push('hintMultipliers must not be empty');
  for (const c of config.checkpoints) {
    if (c <= 0 || c >= config.mastery.zoneStart)
      problems.push(`checkpoint ${c} must be between 0 and the mastery zone`);
  }
  if (config.partialCredit < 0 || config.partialCredit > 1)
    problems.push('partialCredit must be 0–1');
  if (config.mastery.requiredStreak < 1) problems.push('mastery.requiredStreak must be at least 1');
  return problems;
}
