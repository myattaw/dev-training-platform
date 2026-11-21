import type { SplitQuestion } from '@pracstack/content-model';

/**
 * Chooses the next question for a skill.
 *
 * Each candidate gets a cost; the cheapest wins and ties are broken randomly:
 * - 10 per difficulty level away from the target (from the scoring band);
 * - +100 if answered in the last 3 attempts, +20 in the last 6, so learners
 *   don't see the same question again right away (unless the skill has few).
 */
export function selectQuestion(
  questions: readonly SplitQuestion[],
  targetDifficulty: number,
  recentQuestionIds: readonly string[],
  random: () => number,
): SplitQuestion {
  if (questions.length === 0) throw new Error('A skill has no questions.');

  const cost = (q: SplitQuestion): number => {
    const distance = Math.abs(q.question.difficulty - targetDifficulty) * 10;
    const index = recentQuestionIds.indexOf(q.question.id);
    const recency = index === -1 ? 0 : index < 3 ? 100 : index < 6 ? 20 : 0;
    return distance + recency;
  };

  const costs = questions.map(cost);
  const best = Math.min(...costs);
  const cheapest = questions.filter((_, i) => costs[i] === best);
  return cheapest[Math.floor(random() * cheapest.length)] ?? cheapest[0]!;
}
