import type { CodeSnippet, QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, seededShuffle, type FamilyQuestion } from '../family';
import { text } from '../helpers';

/**
 * Engineering-practices question builders. Most questions are scenarios around a
 * realistic artifact (git output, workflow YAML, pipeline logs, test code, user
 * stories, vulnerable code). Code shown as `csharp` is compiled and run by the
 * real C# runner; YAML, logs and other text are reviewed by hand, so every
 * option must be unambiguously right or wrong.
 */

const paragraphs = (question: string | readonly string[]): string[] =>
  typeof question === 'string' ? [question] : [...question];

export interface ScenarioVariant {
  readonly key: string;
  /** Overrides the family's difficulty for this variant. */
  readonly difficulty?: QuestionDifficulty;
  readonly question: string | readonly string[];
  readonly code?: CodeSnippet;
  readonly correct: string;
  readonly wrong: readonly string[];
  /** Overrides the family's hint for this variant. */
  readonly hint?: string;
  readonly why: string;
}

/** Single-answer scenario questions; options are shuffled per variant (seeded). */
export const scenarioFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly ScenarioVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty: v.difficulty ?? difficulty,
    format: 'multiple-choice',
    prompt: text(...paragraphs(v.question)),
    ...(v.code ? { code: v.code } : {}),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [v.hint ?? hint],
    explanation: text(v.why),
  }));

export interface SelectVariant {
  readonly key: string;
  readonly difficulty?: QuestionDifficulty;
  readonly question: string | readonly string[];
  readonly code?: CodeSnippet;
  /** Options that must be selected. */
  readonly right: readonly string[];
  /** Options that must not be selected. */
  readonly wrong: readonly string[];
  readonly hint?: string;
  readonly why: string;
}

/** "Select all that apply" questions; every option is clearly right or wrong. */
export const selectFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly SelectVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => {
    const texts = seededShuffle([...v.right, ...v.wrong], `${id}-${v.key}`);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const options = texts.map((t, i) => ({ id: ids[i] ?? `o${i}`, text: t }));
    return {
      difficulty: v.difficulty ?? difficulty,
      format: 'multiple-choice',
      prompt: text(...paragraphs(v.question), 'Select all that apply.'),
      ...(v.code ? { code: v.code } : {}),
      options,
      selection: 'multiple',
      answer: { correct: options.filter((o) => v.right.includes(o.text)).map((o) => o.id) },
      hints: [v.hint ?? hint],
      explanation: text(v.why),
    };
  });
