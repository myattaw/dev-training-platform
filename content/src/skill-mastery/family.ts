import type { QuestionSource } from '@pracstack/content-model';

/**
 * Question families: one concept, several variants.
 *
 * A family is written once as a template and a list of variants. Each variant
 * has a stable `key`, so its question id (`<family>-<key>`) never changes when
 * variants are added, removed or reordered, and learners' history stays valid.
 * Every variant goes through the same validation as hand-written questions
 * (SQL reference queries are executed, TypeScript is compiled and run), so a
 * generated question is only published if it is checked.
 *
 * The practice server prefers families a learner has not seen, so variants
 * add depth without making the same exercise come back in a row.
 */

/** A question without the fields the family fills in. */
export type FamilyQuestion = QuestionSource extends infer Q
  ? Q extends QuestionSource
    ? Omit<Q, 'id' | 'family' | 'version'> & { readonly version?: number }
    : never
  : never;

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function family<V extends { readonly key: string }>(
  familyId: string,
  variants: readonly V[],
  build: (variant: V) => FamilyQuestion,
): QuestionSource[] {
  const keys = new Set<string>();
  return variants.map((variant) => {
    if (!KEY.test(variant.key))
      throw new Error(`family ${familyId}: variant key "${variant.key}" must be kebab-case`);
    if (keys.has(variant.key))
      throw new Error(`family ${familyId}: duplicate variant key "${variant.key}"`);
    keys.add(variant.key);
    return {
      version: 1,
      ...build(variant),
      id: `${familyId}-${variant.key}`,
      family: familyId,
    } as QuestionSource;
  });
}

/**
 * A deterministic pseudo-random generator (mulberry32) seeded from a string,
 * so generated content is identical on every build.
 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffles a copy of `items`, the same way for the same seed. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * A single-answer multiple-choice question whose options are shuffled per
 * variant (seeded, so stable across builds): the right answer is not always
 * the first option.
 */
export function choice(
  seed: string,
  correct: string,
  wrong: readonly string[],
): {
  readonly options: { id: string; text: string }[];
  readonly selection: 'single';
  readonly answer: { correct: string[] };
} {
  const texts = seededShuffle([correct, ...wrong], seed);
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const options = texts.map((text, i) => ({ id: ids[i] ?? `o${i}`, text }));
  return {
    options,
    selection: 'single',
    answer: { correct: [options[texts.indexOf(correct)]?.id ?? 'a'] },
  };
}
