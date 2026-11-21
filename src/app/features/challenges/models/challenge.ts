import type { InstructionBlock } from '../../../shared/content/instruction-blocks/instruction-block.model';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export type ChallengeCategory =
  'strings' | 'arrays' | 'data-structures' | 'graphs' | 'parsing' | 'system-design';

export const CATEGORY_LABELS: Readonly<Record<ChallengeCategory, string>> = {
  strings: 'Strings',
  arrays: 'Arrays',
  'data-structures': 'Data structures',
  graphs: 'Graphs',
  parsing: 'Parsing',
  'system-design': 'System design',
};

/**
 * Languages a challenge can be solved in. Java will be added together with a
 * server-side runner; the browser can only run TypeScript.
 */
export type LanguageId = 'typescript';

export const LANGUAGE_LABELS: Readonly<Record<LanguageId, string>> = {
  typescript: 'TypeScript',
};

export interface LanguageSetup {
  readonly starterCode: string;
  /** Name of the function the solution must export. */
  readonly entryPoint: string;
}

/** A single data-driven test: call the entry point with `input`, compare to `expected`. */
export interface TestCase {
  readonly description: string;
  readonly input: readonly unknown[];
  readonly expected: unknown;
}

/**
 * The public part of a coding challenge: everything here is safe to ship to
 * the browser. Hidden grading tests will live in a separate, server-only
 * specification and must never be added to this type.
 */
export interface Challenge {
  /** Stable URL slug, e.g. `pangram` → /challenges/pangram */
  readonly id: string;
  /** Incremented whenever instructions or tests change meaningfully. */
  readonly version: number;
  readonly title: string;
  /** One-line summary shown in tables. */
  readonly summary: string;
  readonly category: ChallengeCategory;
  readonly difficulty: Difficulty;
  readonly tags: readonly string[];
  readonly instructions: readonly InstructionBlock[];
  readonly languages: Readonly<Partial<Record<LanguageId, LanguageSetup>>>;
  /** Tests learners can see and run in the browser. */
  readonly visibleTests: readonly TestCase[];
}

/** Languages a challenge actually supports, in a stable order. */
export function supportedLanguages(challenge: Challenge): LanguageId[] {
  return (Object.keys(LANGUAGE_LABELS) as LanguageId[]).filter(
    (id) => challenge.languages[id] !== undefined,
  );
}

/**
 * Typed helper for authoring tests. Given the solution's function signature,
 * TypeScript checks every `input` tuple and `expected` value at compile time,
 * then widens them to the generic `TestCase` shape stored on `Challenge`.
 *
 * @example defineTests<(s: string) => boolean>([{ description: '…', input: ['abc'], expected: false }])
 */
export function defineTests<F extends (...args: never[]) => unknown>(
  cases: readonly { description: string; input: Parameters<F>; expected: ReturnType<F> }[],
): readonly TestCase[] {
  return cases;
}
