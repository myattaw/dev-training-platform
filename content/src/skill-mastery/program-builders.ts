import type { CodeSnippet, QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import type { ProgramLanguage } from '../checks/program-snippets';
import { choice, family, type FamilyQuestion } from './family';
import { text } from './helpers';

/**
 * Question family builders for the languages checked by the real Java, Python
 * and Swift runners (content/src/checks/program-snippets.ts). Shared by the
 * Python, Java, Swift, Spring Boot and Django tracks.
 *
 * Every builder takes the language first, so a track file can bind it once:
 *
 *   const b = programBuilders('python');
 *   export const listFamilies = [...b.output('py-list-slicing', 2, [...], [...])];
 *
 * Authoring rules (enforced by the checks where possible):
 * - Java programs declare `public class Main` with `public static void main(String[] args)`
 *   (other top-level types without `public`). Python and Swift programs are scripts.
 * - Output must be deterministic: no set/hash ordering of strings, no timing, no
 *   addresses (`<object at 0x…>`), no locale-dependent formatting, no randomness.
 * - Every variant explains *why*, including the misconception the wrong options target.
 * - Variants of one family test the same concept with genuinely different code, not
 *   just renamed variables.
 */

export const code = (language: ProgramLanguage, source: string): CodeSnippet => ({
  language,
  source,
});

export interface OutputVariant {
  readonly key: string;
  /** Optional context shown above the code (defaults to "What does this program print?"). */
  readonly question?: string;
  readonly code: string;
  readonly output: string;
  readonly why: string;
}

export interface CompilesVariant {
  readonly key: string;
  readonly code: string;
  readonly compiles: boolean;
  readonly why: string;
}

export interface WhichCompileVariant {
  readonly key: string;
  readonly question: string;
  /** Declarations every option can use; shown to the learner. */
  readonly prelude?: string;
  readonly options: readonly string[];
  /** The options (by text) that compile. */
  readonly correct: readonly string[];
  readonly why: string;
}

export interface BlankVariant {
  readonly key: string;
  readonly prompt: string;
  /** A program with `{{blank:id}}` placeholders; every accepted answer must compile and run. */
  readonly template: string;
  readonly blanks: Readonly<Record<string, readonly string[]>>;
  /** Blank answers compared case-sensitively (default: true for code). */
  readonly caseSensitive?: boolean;
  readonly why: string;
}

export interface CodeChoiceVariant {
  readonly key: string;
  readonly question: string;
  /**
   * Code shown with the question; it must compile and run without an error
   * (checked). Java code without a main method (a controller, a service) must
   * only compile, against the runner's Spring Boot libraries.
   */
  readonly code: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

export interface OutputChoiceVariant {
  readonly key: string;
  readonly question?: string;
  readonly code: string;
  /** The exact output (checked by running the code). */
  readonly correct: string;
  /** Plausible wrong outputs, each targeting a misconception. */
  readonly wrong: readonly string[];
  readonly why: string;
}

export interface FailsVariant {
  readonly key: string;
  readonly question: string;
  /** Code that compiles, then fails at run time (checked). */
  readonly code: string;
  /** Text the run-time error must contain, e.g. `KeyError` or `NullPointerException`. */
  readonly error: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

export interface ConceptVariant {
  readonly key: string;
  readonly question: string;
  /**
   * Optional code that is only displayed: configuration, HTTP, logs, templates
   * (use plain(), yaml(), json() or html()). Java, Python or Swift code here
   * is checked like any other code shown with a question.
   */
  readonly snippet?: CodeSnippet;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

export interface MultiVariant {
  readonly key: string;
  readonly question: string;
  /** Optional code shown with the question; Java/Python/Swift code must run (checked). */
  readonly code?: string;
  readonly correct: readonly string[];
  readonly wrong: readonly string[];
  readonly why: string;
}

/** Builders bound to one language. */
export function programBuilders(language: ProgramLanguage) {
  const snippet = (source: string) => code(language, source);
  return {
    /** "What does this program print?" — free-text answer, checked by running it. */
    output: (
      id: string,
      difficulty: QuestionDifficulty,
      hints: readonly string[],
      variants: readonly OutputVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => ({
        difficulty,
        format: 'predict-output',
        prompt: text(v.question ?? 'What does this program print?'),
        code: snippet(v.code),
        answer: { output: v.output },
        hints: [...hints],
        explanation: text(v.why),
      })),

    /** "Which output?" — multiple choice; the correct option is checked by running the code. */
    outputChoice: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly OutputChoiceVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => ({
        difficulty,
        format: 'multiple-choice',
        prompt: text(v.question ?? 'What does this program print?'),
        code: snippet(v.code),
        ...choice(
          `${id}-${v.key}`,
          `\`${v.correct}\``,
          v.wrong.map((w) => `\`${w}\``),
        ),
        codeCheck: { kind: 'output' },
        hints: [hint],
        explanation: text(v.why),
      })),

    /** "Does this compile?" — the key is checked by compiling the code. */
    compiles: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly CompilesVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => ({
        difficulty,
        format: 'multiple-choice',
        prompt: text(`Does this ${LANGUAGE_NAMES[language]} code compile?`),
        code: snippet(v.code),
        options: [
          { id: 'a', text: 'Yes, it compiles' },
          { id: 'b', text: 'No, it is a compile error' },
        ],
        selection: 'single',
        answer: { correct: [v.compiles ? 'a' : 'b'] },
        codeCheck: { kind: 'compiles' },
        hints: [hint],
        explanation: text(v.why),
      })),

    /** "Which of these compile?" — every option is compiled after the prelude. */
    whichCompile: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly WhichCompileVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        const options = v.options.map((o, i) => ({ id: ids[i] ?? `o${i}`, text: `\`${o}\`` }));
        return {
          difficulty,
          format: 'multiple-choice',
          prompt: text(v.question),
          ...(v.prelude ? { code: snippet(v.prelude) } : {}),
          options,
          selection: 'multiple',
          answer: {
            correct: options
              .filter((_, i) => v.correct.includes(v.options[i] ?? ''))
              .map((o) => o.id),
          },
          codeCheck: {
            kind: 'options-compile',
            language,
            ...(v.prelude ? { prelude: v.prelude } : {}),
          },
          hints: [hint],
          explanation: text(v.why),
        };
      }),

    /** Fill in the blanks — each accepted answer must compile and run without an error. */
    blank: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly BlankVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => ({
        difficulty,
        format: 'fill-in-blank',
        prompt: text(v.prompt),
        template: snippet(v.template),
        answer: {
          blanks: Object.fromEntries(
            Object.entries(v.blanks).map(([k, accepted]) => [
              k,
              { accepted: [...accepted], caseSensitive: v.caseSensitive ?? true },
            ]),
          ),
        },
        hints: [hint],
        explanation: text(v.why),
      })),

    /**
     * A question about working code ("what is the bug?", "what does this return
     * for…?", "which change fixes…?"). The code is run by the checker; the reasoning
     * in the options is reviewed by hand, so keep exactly one defensible answer.
     */
    codeChoice: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly CodeChoiceVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => ({
        difficulty,
        format: 'multiple-choice',
        prompt: text(v.question),
        code: snippet(v.code),
        ...choice(`${id}-${v.key}`, v.correct, v.wrong),
        hints: [hint],
        explanation: text(v.why),
      })),

    /**
     * "Why does this fail?" — the code must compile and fail at run time with
     * the named error (checked), e.g. a debugging question built on a real traceback.
     */
    fails: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly FailsVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => ({
        difficulty,
        format: 'multiple-choice',
        prompt: text(v.question),
        code: snippet(v.code),
        ...choice(`${id}-${v.key}`, v.correct, v.wrong),
        codeCheck: { kind: 'fails', error: v.error },
        hints: [hint],
        explanation: text(v.why),
      })),

    /** Select every correct statement; optional code is run by the checker. */
    multi: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly MultiVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        const texts = [...v.correct, ...v.wrong].sort(
          (a, b) =>
            // Stable but not "correct first": order by a hash of the text.
            hash(`${id}-${v.key}-${a}`) - hash(`${id}-${v.key}-${b}`),
        );
        const options = texts.map((t, i) => ({ id: ids[i] ?? `o${i}`, text: t }));
        return {
          difficulty,
          format: 'multiple-choice',
          prompt: text(v.question),
          ...(v.code !== undefined ? { code: snippet(v.code) } : {}),
          options,
          selection: 'multiple',
          answer: { correct: options.filter((o) => v.correct.includes(o.text)).map((o) => o.id) },
          hints: [hint],
          explanation: text(v.why),
        };
      }),

    /** Concept questions; optional displayed snippet (not run). Prefer checked code. */
    concept: (
      id: string,
      difficulty: QuestionDifficulty,
      hint: string,
      variants: readonly ConceptVariant[],
    ): QuestionSource[] =>
      family(id, variants, (v): FamilyQuestion => ({
        difficulty,
        format: 'multiple-choice',
        prompt: text(v.question),
        ...(v.snippet ? { code: v.snippet } : {}),
        ...choice(`${id}-${v.key}`, v.correct, v.wrong),
        hints: [hint],
        explanation: text(v.why),
      })),
  };
}

const LANGUAGE_NAMES: Readonly<Record<ProgramLanguage, string>> = {
  java: 'Java',
  python: 'Python',
  swift: 'Swift',
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
