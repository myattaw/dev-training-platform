/**
 * Every number the mastery engine uses lives here, so the algorithm can be
 * tuned without code changes. Configs are versioned: a learner's state records
 * the version it was computed with, so history stays explainable after tuning.
 * See docs/scoring.md for the rationale behind each value.
 *
 * Version 2 separates two things version 1 mixed up:
 * - the DIFFICULTY TIER of the questions a learner gets (1–5), which moves by
 *   explicit promotion/demotion rules based on recent answers; and
 * - the MASTERY SCORE (0–100), which answers raise or lower, capped per tier so
 *   that easy questions cannot carry a learner to mastery.
 */

/** Names of the difficulty tiers, shown to learners instead of "Level X of 5". */
export const DIFFICULTY_TIERS = [
  { tier: 1, label: 'Beginner' },
  { tier: 2, label: 'Elementary' },
  { tier: 3, label: 'Intermediate' },
  { tier: 4, label: 'Advanced' },
  { tier: 5, label: 'Expert' },
] as const;

export const MIN_TIER = 1;
export const MAX_TIER = 5;

export function tierLabel(tier: number): string {
  return DIFFICULTY_TIERS.find((t) => t.tier === tier)?.label ?? `Tier ${tier}`;
}

export interface TierRules {
  /** Mastery points for a correct, hint-free answer at this difficulty. */
  readonly gain: number;
  /** Highest score answers at this difficulty can reach (the anti-farming cap). */
  readonly scoreCap: number;
}

export interface ScoringConfig {
  readonly version: number;
  /** Rules per question difficulty, index 0 = difficulty 1. */
  readonly tiers: readonly TierRules[];
  readonly progression: {
    /** Consecutive qualifying correct answers that move the learner up one tier. */
    readonly promoteAfter: number;
    /** Consecutive incorrect answers that move the learner down one tier. */
    readonly demoteAfter: number;
  };
  /** Points lost for an incorrect answer, by the score the learner had. */
  readonly loss: readonly { readonly fromScore: number; readonly points: number }[];
  /** Loss multiplier when the missed question was above the learner's tier. */
  readonly harderMissMultiplier: number;
  /** Fraction of the gain awarded for a partially correct answer. Partial answers never lose points. */
  readonly partialCredit: number;
  /** Gain multiplier by number of hints used; the last entry applies to any higher count. */
  readonly hintMultipliers: readonly number[];
  /** Gain and XP multiplier for a question answered correctly before (a repeat). */
  readonly repeatMultiplier: number;
  /** Once reached, the score never drops below these. */
  readonly checkpoints: readonly number[];
  /** Extra points for consecutive correct answers, starting at the `from`-th in a row. */
  readonly streakBonus: { readonly from: number; readonly perAnswer: number; readonly max: number };
  /** A miss right after a streak of at least `minStreak` costs `lossMultiplier` × the usual loss. */
  readonly slipForgiveness: { readonly minStreak: number; readonly lossMultiplier: number };
  readonly mastery: {
    /** Scores at or above this are the "mastery zone". */
    readonly zoneStart: number;
    /** Consecutive hint-free, first-time correct answers in the zone needed to reach 100. */
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
  version: 2,
  tiers: [
    { gain: 6, scoreCap: 30 },
    { gain: 7, scoreCap: 50 },
    { gain: 8, scoreCap: 70 },
    { gain: 9, scoreCap: 90 },
    { gain: 10, scoreCap: 99 },
  ],
  progression: { promoteAfter: 2, demoteAfter: 2 },
  loss: [
    { fromScore: 0, points: 2 },
    { fromScore: 50, points: 3 },
    { fromScore: 80, points: 4 },
  ],
  harderMissMultiplier: 0.5,
  partialCredit: 0.5,
  hintMultipliers: [1, 0.6, 0.3],
  repeatMultiplier: 0.5,
  checkpoints: [50, 80],
  streakBonus: { from: 3, perAnswer: 1, max: 3 },
  slipForgiveness: { minStreak: 3, lossMultiplier: 0.5 },
  mastery: { zoneStart: 90, requiredStreak: 3, minDifficulty: 4, floorAfterMastery: 90 },
  maxGainPerAnswer: 15,
  maxLossPerAnswer: 6,
  xpPerDifficulty: { correct: 10, partial: 5, incorrect: 1 },
};

/** Returns a list of problems; an empty list means the config is usable. */
export function validateScoringConfig(config: ScoringConfig): string[] {
  const problems: string[] = [];
  if (config.tiers.length !== MAX_TIER) problems.push(`tiers must have ${MAX_TIER} entries`);
  config.tiers.forEach((t, i) => {
    if (t.gain <= 0) problems.push(`tier ${i + 1} needs a positive gain`);
    const previous = config.tiers[i - 1];
    if (previous && t.scoreCap <= previous.scoreCap)
      problems.push(`tier ${i + 1} must have a higher score cap than tier ${i}`);
  });
  if ((config.tiers.at(-1)?.scoreCap ?? 0) > 99) problems.push('score caps must be at most 99');
  // Answers at the mastery difficulty must be able to reach the mastery zone.
  if ((config.tiers[config.mastery.minDifficulty - 1]?.scoreCap ?? 0) < config.mastery.zoneStart)
    problems.push('the mastery difficulty must be able to reach the mastery zone');
  if (config.progression.promoteAfter < 1 || config.progression.demoteAfter < 1)
    problems.push('promotion and demotion need at least one answer');
  if (config.loss[0]?.fromScore !== 0) problems.push('loss must start at score 0');
  if (config.hintMultipliers.length === 0) problems.push('hintMultipliers must not be empty');
  for (const c of config.checkpoints) {
    if (c <= 0 || c >= config.mastery.zoneStart)
      problems.push(`checkpoint ${c} must be between 0 and the mastery zone`);
  }
  if (config.partialCredit < 0 || config.partialCredit > 1)
    problems.push('partialCredit must be 0–1');
  if (config.repeatMultiplier < 0 || config.repeatMultiplier > 1)
    problems.push('repeatMultiplier must be 0–1');
  if (config.mastery.requiredStreak < 1) problems.push('mastery.requiredStreak must be at least 1');
  return problems;
}
