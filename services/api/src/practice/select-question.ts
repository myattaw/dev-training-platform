import type { SplitQuestion } from '@pracstack/content-model';
import { MAX_TIER, MIN_TIER, tierLabel } from '@pracstack/scoring';

/** One past answer for this skill. Lists are most recent first. */
export interface HistoryEntry {
  readonly questionId: string;
  readonly result: 'correct' | 'partial' | 'incorrect';
}

export type SelectionReason = 'new' | 'review' | 'repeat';

export interface Selection {
  readonly question: SplitQuestion;
  readonly reason: SelectionReason;
  /** Shown to the learner when the choice needs explaining (other tier, review, repeat). */
  readonly note?: string;
}

/** Missed questions come back for review once at least this many other answers have passed. */
export const REVIEW_AFTER = 3;
/** A family seen within this many answers counts as "recent". */
const RECENT_FAMILY = 3;
/** Never serve one of the last this-many questions again if anything else exists. */
const NO_IMMEDIATE_REPEAT = 2;

/**
 * Chooses the next question for a skill. Deterministic: the same questions,
 * tier, history and seed always give the same question (ties are broken by a
 * hash of the seed and the question id, not by Math.random).
 *
 * Preference, at the learner's tier first:
 *   0. a variant of a family never seen;
 *   1. an unseen variant of a family not seen in the last 3 answers;
 *   2. review: a question last answered wrongly, at least 3 answers ago;
 *   3. any unseen variant.
 * If the tier has none of these left, the nearest tier with an unseen or
 * review question is used (and the learner is told). Only then does a
 * question repeat (least recently seen first), and the learner is told that too.
 * See docs/scoring.md.
 */
export function selectQuestion(
  questions: readonly SplitQuestion[],
  tier: number,
  history: readonly HistoryEntry[],
  seed: string,
): Selection {
  if (questions.length === 0) throw new Error('A skill has no questions.');

  const lastSeen = new Map<string, number>();
  const lastResult = new Map<string, HistoryEntry['result']>();
  const familyLastSeen = new Map<string, number>();
  const familyOf = new Map(questions.map((q) => [q.question.id, q.question.familyId]));
  history.forEach((entry, index) => {
    if (!lastSeen.has(entry.questionId)) {
      lastSeen.set(entry.questionId, index);
      lastResult.set(entry.questionId, entry.result);
    }
    const family = familyOf.get(entry.questionId);
    if (family !== undefined && !familyLastSeen.has(family)) familyLastSeen.set(family, index);
  });

  const rank = (q: SplitQuestion): number | undefined => {
    const seen = lastSeen.get(q.question.id);
    const familySeen = familyLastSeen.get(q.question.familyId);
    if (seen === undefined) {
      if (familySeen === undefined) return 0;
      return familySeen >= RECENT_FAMILY ? 1 : 3;
    }
    if (lastResult.get(q.question.id) !== 'correct' && seen >= REVIEW_AFTER) return 2;
    return undefined; // only as a repeat
  };

  const byTier = new Map<number, SplitQuestion[]>();
  for (const q of questions) {
    const list = byTier.get(q.question.difficulty) ?? [];
    list.push(q);
    byTier.set(q.question.difficulty, list);
  }
  const order = hashOrder(seed);
  const best = (pool: readonly SplitQuestion[], maxRank: number) => {
    let found: { q: SplitQuestion; r: number } | undefined;
    for (const q of pool) {
      const r = rank(q);
      if (r === undefined || r > maxRank) continue;
      if (!found || r < found.r || (r === found.r && order(q) < order(found.q))) found = { q, r };
    }
    return found;
  };
  const reasonFor = (r: number): SelectionReason => (r === 2 ? 'review' : 'new');
  const reviewNote = 'Review: you missed this question earlier.';

  // 1. Something new (or due for review) at the learner's tier.
  const here = best(byTier.get(tier) ?? [], 3);
  if (here) {
    return {
      question: here.q,
      reason: reasonFor(here.r),
      ...(here.r === 2 ? { note: reviewNote } : {}),
    };
  }

  // 2. Nothing new left at this tier: the nearest tier that still has something.
  for (const other of tiersByDistance(tier)) {
    const near = best(byTier.get(other) ?? [], 3);
    if (near) {
      return {
        question: near.q,
        reason: reasonFor(near.r),
        note: `No new ${tierLabel(tier)} questions are left in this skill, so this one is ${tierLabel(other)}.`,
      };
    }
  }

  // 3. Everything has been seen: repeat, least recently seen first, at the nearest tier.
  for (const t of [tier, ...tiersByDistance(tier)]) {
    const pool = byTier.get(t) ?? [];
    if (pool.length === 0) continue;
    const fresh = pool.filter(
      (q) => (lastSeen.get(q.question.id) ?? Infinity) >= NO_IMMEDIATE_REPEAT,
    );
    const candidates = fresh.length > 0 ? fresh : pool;
    const oldest = [...candidates].sort(
      (a, b) =>
        (lastSeen.get(b.question.id) ?? 0) - (lastSeen.get(a.question.id) ?? 0) ||
        order(a) - order(b),
    )[0]!;
    return {
      question: oldest,
      reason: 'repeat',
      note: "You have answered every question in this skill, so this is a repeat. Repeats earn reduced credit and don't count toward mastery.",
    };
  }
  throw new Error('unreachable: the skill has questions');
}

/** Other tiers, nearest first; easier before harder at the same distance. */
function tiersByDistance(tier: number): number[] {
  const result: number[] = [];
  for (let d = 1; d <= MAX_TIER - MIN_TIER; d++) {
    if (tier - d >= MIN_TIER) result.push(tier - d);
    if (tier + d <= MAX_TIER) result.push(tier + d);
  }
  return result;
}

/** A deterministic ordering of questions for a seed (FNV-1a over seed + id). */
function hashOrder(seed: string): (q: SplitQuestion) => number {
  const cache = new Map<string, number>();
  return (q) => {
    let value = cache.get(q.question.id);
    if (value === undefined) {
      let h = 0x811c9dc5;
      for (const ch of `${seed}|${q.question.id}`) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      value = h;
      cache.set(q.question.id, value);
    }
    return value;
  };
}
