import type { QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, type FamilyQuestion } from '../family';
import { cs, text } from '../helpers';

/**
 * C# question family builders. Every snippet is compiled (and, where it is a
 * program, run) by the real C# runner: .NET 10, C# 14, nullable reference types
 * enabled, implicit usings (System, System.Collections.Generic, System.Linq,
 * System.Text, System.Threading, System.Threading.Tasks). See
 * content/src/checks/csharp-snippets.ts and its spec.
 *
 * Authoring rules:
 * - Programs use top-level statements, then any type declarations.
 * - Output must be deterministic: no hash-set ordering of strings across runs,
 *   no timing, no culture-specific formatting (the runner uses the invariant culture).
 * - Every variant explains *why*, including the misconception the wrong options target.
 */

export interface OutputVariant {
  readonly key: string;
  readonly code: string;
  readonly output: string;
  readonly why: string;
}

/** "What does this program print?" — compiled and executed by the checker. */
export const csOutputFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hints: readonly string[],
  variants: readonly OutputVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: cs(v.code),
    answer: { output: v.output },
    hints: [...hints],
    explanation: text(v.why),
  }));

export interface CompilesVariant {
  readonly key: string;
  readonly code: string;
  readonly compiles: boolean;
  readonly why: string;
}

/** "Does this compile?" — the key is checked by compiling the code (nullable enabled). */
export const csCompilesFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly CompilesVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text('Does this C# code compile?'),
    code: cs(v.code),
    options: [
      { id: 'a', text: 'Yes, it compiles' },
      { id: 'b', text: 'No, it is a compile error' },
    ],
    selection: 'single',
    answer: { correct: [v.compiles ? 'a' : 'b'] },
    csharpCheck: { kind: 'compiles' },
    hints: [hint],
    explanation: text(v.why),
  }));

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

/** "Which of these compile?" — every option is compiled after the prelude. */
export const csWhichCompileFamily = (
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
      ...(v.prelude ? { code: cs(v.prelude) } : {}),
      options,
      selection: 'multiple',
      answer: {
        correct: options.filter((_, i) => v.correct.includes(v.options[i] ?? '')).map((o) => o.id),
      },
      csharpCheck: { kind: 'options-compile', ...(v.prelude ? { prelude: v.prelude } : {}) },
      hints: [hint],
      explanation: text(v.why),
    };
  });

export interface BlankVariant {
  readonly key: string;
  readonly prompt: string;
  /** A program with `{{blank:id}}` placeholders. */
  readonly template: string;
  readonly blanks: Record<string, readonly string[]>;
  readonly why: string;
}

/** Fill in the blanks — each accepted answer must compile and run without throwing. */
export const csBlankFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly BlankVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'fill-in-blank',
    prompt: text(v.prompt),
    template: cs(v.template),
    answer: {
      blanks: Object.fromEntries(
        Object.entries(v.blanks).map(([k, accepted]) => [k, { accepted: [...accepted] }]),
      ),
    },
    hints: [hint],
    explanation: text(v.why),
  }));

export interface CodeChoiceVariant {
  readonly key: string;
  readonly question: string;
  /** Code shown with the question; it must compile (checked). */
  readonly code: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

/**
 * A question about a piece of code ("what is the bug?", "what happens when…?").
 * The code is compiled and run by the checker; the reasoning in the options is
 * reviewed by hand, so keep exactly one defensible answer.
 */
export const csCodeChoiceFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly CodeChoiceVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text(v.question),
    code: cs(v.code),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [hint],
    explanation: text(v.why),
  }));

export interface ConceptVariant {
  readonly key: string;
  readonly question: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

/** Concept questions without code. Use sparingly; prefer code that is checked. */
export const csConceptFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly ConceptVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text(v.question),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [hint],
    explanation: text(v.why),
  }));
