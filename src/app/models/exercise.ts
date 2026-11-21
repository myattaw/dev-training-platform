export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export const DIFFICULTIES: readonly Difficulty[] = ['Easy', 'Medium', 'Hard'];

/**
 * Instructions are structured data rather than raw HTML. That keeps them
 * type-safe, avoids `innerHTML`, and lets the UI decide how each block looks.
 * Inline `backticks` inside text are rendered as code.
 */
export type InstructionBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'code'; readonly code: string };

/** A single data-driven test: call the entry point with `input`, compare to `expected`. */
export interface TestCase {
  readonly description: string;
  readonly input: readonly unknown[];
  readonly expected: unknown;
}

export interface Exercise {
  /** URL slug, e.g. `pangram` → /exercises/pangram */
  readonly id: string;
  readonly title: string;
  /** One-line summary shown on cards. */
  readonly description: string;
  readonly difficulty: Difficulty;
  readonly topics: readonly string[];
  readonly featured: boolean;
  readonly instructions: readonly InstructionBlock[];
  readonly starterCode: string;
  /** Name of the function the learner must export. */
  readonly entryPoint: string;
  readonly tests: readonly TestCase[];
}

/**
 * Typed helper for authoring tests. Given the solution's function signature,
 * TypeScript checks every `input` tuple and `expected` value at compile time,
 * then widens them to the generic `TestCase` shape stored on `Exercise`.
 *
 * @example defineTests<(s: string) => boolean>([{ description: '…', input: ['abc'], expected: false }])
 */
export function defineTests<F extends (...args: never[]) => unknown>(
  cases: readonly { description: string; input: Parameters<F>; expected: ReturnType<F> }[],
): readonly TestCase[] {
  return cases;
}
