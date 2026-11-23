import type { InstructionBlock } from './instruction';

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
 * Languages a challenge can be solved in. TypeScript can also run in the
 * learner's browser; Java and C# run only in the server-side runner.
 */
export type LanguageId = 'typescript' | 'java' | 'csharp';

/** Every language, in display order. */
export const LANGUAGE_IDS: readonly LanguageId[] = ['typescript', 'java', 'csharp'];

export const LANGUAGE_LABELS: Readonly<Record<LanguageId, string>> = {
  typescript: 'TypeScript',
  java: 'Java',
  csharp: 'C#',
};

/** Languages whose visible tests can run in the browser. */
export const BROWSER_LANGUAGES: readonly LanguageId[] = ['typescript'];

export interface LanguageSetup {
  readonly starterCode: string;
  /**
   * What the solution must provide: for `call` tests an exported function
   * (TypeScript) or static method (Java); for `operations` tests a class.
   */
  readonly entryPoint: string;
}

/** Call the exported function with `input` and compare the result to `expected`. */
export interface CallTest {
  readonly kind: 'call';
  readonly description: string;
  readonly input: readonly unknown[];
  readonly expected: unknown;
}

/** One method call in an operations test. `expected` is checked only when present. */
export interface OperationStep {
  readonly call: string;
  readonly args: readonly unknown[];
  readonly expected?: unknown;
}

/**
 * Construct the exported class with `constructorArgs`, then call methods in
 * order. Used for stateful problems such as an LRU cache or a text editor.
 */
export interface OperationsTest {
  readonly kind: 'operations';
  readonly description: string;
  readonly constructorArgs: readonly unknown[];
  readonly steps: readonly OperationStep[];
}

export type ChallengeTest = CallTest | OperationsTest;

/**
 * The public part of a coding challenge. Everything here is shipped to the
 * browser; hidden tests live only in {@link ChallengeGrading}.
 */
export interface Challenge {
  /** Stable slug, e.g. `pangram` → /challenges/pangram. Never reuse or rename. */
  readonly id: string;
  /** Increment when instructions or tests change meaningfully. */
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
  readonly visibleTests: readonly ChallengeTest[];
}

/** Resource limits for server-side evaluation (enforced from Phase 5). */
export interface ExecutionLimits {
  readonly timeoutMs: number;
  readonly memoryMb: number;
  readonly outputKb: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = { timeoutMs: 5000, memoryMb: 256, outputKb: 64 };

/** Private grading specification. Never shipped to the browser. */
export interface ChallengeGrading {
  readonly challengeId: string;
  readonly version: number;
  readonly hiddenTests: readonly ChallengeTest[];
  readonly limits: ExecutionLimits;
}

/** What a content author writes: the public challenge plus its private grading data. */
export interface ChallengeSource {
  readonly challenge: Challenge;
  readonly hiddenTests: readonly ChallengeTest[];
  readonly limits?: Partial<ExecutionLimits>;
}

/** Catalog row: enough to list and filter without loading every challenge. */
export interface ChallengeSummary {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly category: ChallengeCategory;
  readonly difficulty: Difficulty;
  readonly tags: readonly string[];
  readonly languages: readonly LanguageId[];
  readonly visibleTestCount: number;
}

/** Languages a challenge actually supports, in a stable order. */
export function supportedLanguages(challenge: Pick<Challenge, 'languages'>): LanguageId[] {
  return (Object.keys(LANGUAGE_LABELS) as LanguageId[]).filter(
    (id) => challenge.languages[id] !== undefined,
  );
}

/**
 * Typed helper for function-style tests. Given the solution's signature,
 * TypeScript checks every `input` tuple and `expected` value.
 *
 * @example callTests<(s: string) => boolean>([{ description: '…', input: ['abc'], expected: false }])
 */
export function callTests<F extends (...args: never[]) => unknown>(
  cases: readonly { description: string; input: Parameters<F>; expected: ReturnType<F> }[],
): CallTest[] {
  return cases.map((c) => ({ kind: 'call', ...c }));
}

type Step<T> = {
  [K in keyof T & string]: T[K] extends (...args: infer A) => infer R
    ? { readonly call: K; readonly args: A; readonly expected?: R }
    : never;
}[keyof T & string];

/**
 * Typed helper for class-style tests. Method names, argument tuples and
 * expected return values are all checked against the reference class.
 *
 * @example operationTests<typeof LRUCache>([{ description: '…', constructorArgs: [2], steps: [{ call: 'get', args: [1], expected: -1 }] }])
 */
export function operationTests<C extends abstract new (...args: never[]) => object>(
  cases: readonly {
    description: string;
    constructorArgs: ConstructorParameters<C>;
    steps: readonly Step<InstanceType<C>>[];
  }[],
): OperationsTest[] {
  return cases.map((c) => ({ kind: 'operations', ...c }));
}
