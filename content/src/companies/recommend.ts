import {
  COMPETENCIES,
  type CompanyQuestionAssociation,
  type CompanyRecommendation,
  type Competency,
  type ExternalProblemReference,
  isCompetency,
  type RecommendationConfidence,
} from '@pracstack/content-model';

/*
 * Deterministic, explainable recommendations: no machine learning, no
 * keyword search. Editor-curated recommendations come first, in the editor's
 * order. The remaining places are filled by ranking PracStack challenges on
 * the competencies they share with the company's reported problems (as tagged
 * by editors), weighted by the source's frequency column, with broad
 * competencies counting less. Same input, same output.
 */

export interface RecommendableChallenge {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
}

export interface CuratedRecommendation {
  readonly challengeId: string;
  readonly sourceProblemId?: string;
  readonly reason: string;
  readonly similarityTags: readonly Competency[];
  readonly confidence: RecommendationConfidence;
}

export interface RecommendInput {
  readonly companyId: string;
  readonly references: readonly ExternalProblemReference[];
  readonly associations: readonly CompanyQuestionAssociation[];
  /** Practisable challenges that may be recommended by ranking. */
  readonly challenges: readonly RecommendableChallenge[];
  readonly curated?: readonly CuratedRecommendation[];
  readonly limit?: number;
}

export const DEFAULT_RECOMMENDATION_LIMIT = 8;
/** Below this score a match is too weak to show. */
export const MIN_SCORE = 0.5;
/** Competencies almost every problem touches; they count half. */
const BROAD: ReadonlySet<Competency> = new Set(['strings', 'arrays']);
/** Used when the source gives no frequency. */
const DEFAULT_FREQUENCY = 50;

export interface ScoredMatch {
  readonly challengeId: string;
  readonly score: number;
  readonly sourceProblemId: string;
  readonly sharedTags: readonly Competency[];
}

/** Scores one challenge against a company's references. Exported for tests. */
export function scoreChallenge(
  challenge: RecommendableChallenge,
  references: readonly ExternalProblemReference[],
  frequency: ReadonlyMap<string, number>,
): ScoredMatch | undefined {
  const tags = new Set(challenge.tags.filter(isCompetency));
  let total = 0;
  let specific = false;
  let best: { ref: ExternalProblemReference; score: number; shared: Competency[] } | undefined;
  for (const ref of [...references].sort((a, b) => a.id.localeCompare(b.id))) {
    const shared = ref.editorialTags.filter((t) => tags.has(t));
    if (shared.length === 0) continue;
    const weight = (frequency.get(ref.id) ?? DEFAULT_FREQUENCY) / 100;
    const score = shared.reduce((sum, t) => sum + (BROAD.has(t) ? 0.5 : 1), 0) * weight;
    total += score;
    if (shared.some((t) => !BROAD.has(t))) specific = true;
    if (!best || score > best.score) best = { ref, score, shared };
  }
  // Sharing only broad competencies ("string manipulation") is not a reason to recommend.
  if (!best || !specific || total < MIN_SCORE) return undefined;
  return {
    challengeId: challenge.id,
    score: Math.round(total * 1000) / 1000,
    sourceProblemId: best.ref.id,
    // Specific competencies first, so the reason names what matters.
    sharedTags: [...best.shared].sort((a, b) => Number(BROAD.has(a)) - Number(BROAD.has(b))),
  };
}

/** "a", "a and b", "a, b and c" */
export function listLabels(tags: readonly Competency[]): string {
  const labels = tags.map((t) => COMPETENCIES[t]);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function recommend(input: RecommendInput): CompanyRecommendation[] {
  const limit = input.limit ?? DEFAULT_RECOMMENDATION_LIMIT;
  const titles = new Map(input.references.map((r) => [r.id, r.title]));
  const frequency = new Map<string, number>();
  for (const a of input.associations) {
    if (a.companyId !== input.companyId) continue;
    const f = a.reportedFrequency ?? DEFAULT_FREQUENCY;
    frequency.set(a.problemId, Math.max(frequency.get(a.problemId) ?? 0, f));
  }
  const references = input.references.filter((r) => frequency.has(r.id));

  const result: CompanyRecommendation[] = [];
  const used = new Set<string>();
  for (const c of input.curated ?? []) {
    if (used.has(c.challengeId) || result.length >= limit) continue;
    used.add(c.challengeId);
    result.push({
      companyId: input.companyId,
      challengeId: c.challengeId,
      ...(c.sourceProblemId ? { sourceProblemId: c.sourceProblemId } : {}),
      reason: c.reason,
      similarityTags: c.similarityTags,
      confidence: c.confidence,
      origin: 'curated',
      editorialReviewStatus: 'reviewed',
    });
  }

  const ranked = input.challenges
    .filter((c) => !used.has(c.id))
    .map((c) => scoreChallenge(c, references, frequency))
    .filter((m): m is ScoredMatch => m !== undefined)
    .sort((a, b) => b.score - a.score || a.challengeId.localeCompare(b.challengeId));

  for (const match of ranked) {
    if (result.length >= limit) break;
    const title = titles.get(match.sourceProblemId) ?? match.sourceProblemId;
    result.push({
      companyId: input.companyId,
      challengeId: match.challengeId,
      sourceProblemId: match.sourceProblemId,
      reason: `Practises ${listLabels(match.sharedTags)}, like “${title}”.`,
      similarityTags: match.sharedTags,
      confidence: match.score >= 1.5 ? 'medium' : 'low',
      origin: 'computed',
      editorialReviewStatus: 'unreviewed',
    });
  }
  return result;
}
