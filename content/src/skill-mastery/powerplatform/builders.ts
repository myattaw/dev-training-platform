import type { CodeSnippet, QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, type FamilyQuestion } from '../family';
import { text } from '../helpers';

/**
 * Power Platform question family builders.
 *
 * PracStack has no connection to a Microsoft tenant, so nothing here runs:
 * every question is scenario reasoning about an artifact shown as plain text
 * (Power Fx, flow definitions, expressions, Dataverse designs, security role
 * matrices, DAX, small data tables). Answer keys are reviewed by hand, so every
 * single-choice question has exactly one defensible answer and every
 * multiple-selection option is unambiguously right or wrong.
 */

export interface ScenarioVariant {
  readonly key: string;
  /** Overrides the family difficulty for this variant. */
  readonly difficulty?: QuestionDifficulty;
  readonly question: string;
  /** The artifact the question is about (use `plain(...)`). */
  readonly code?: CodeSnippet;
  readonly correct: string;
  readonly wrong: readonly string[];
  /** Teaches the concept and names the misconception behind the tempting wrong option. */
  readonly why: string;
}

/** A single-answer scenario question; options are shuffled per variant (seeded). */
export const ppChoiceFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly ScenarioVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty: v.difficulty ?? difficulty,
    format: 'multiple-choice',
    prompt: text(v.question),
    ...(v.code ? { code: v.code } : {}),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [hint],
    explanation: text(v.why),
  }));

export interface SelectVariant {
  readonly key: string;
  readonly difficulty?: QuestionDifficulty;
  readonly question: string;
  readonly code?: CodeSnippet;
  /** Options in display order; `true` marks a correct one. */
  readonly options: readonly (readonly [string, boolean])[];
  readonly why: string;
}

/** "Select all that apply": every option is unambiguously right or wrong. */
export const ppSelectFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly SelectVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const options = v.options.map(([t], i) => ({ id: ids[i] ?? `o${i}`, text: t }));
    return {
      difficulty: v.difficulty ?? difficulty,
      format: 'multiple-choice',
      prompt: text(`${v.question} Select all that apply.`),
      ...(v.code ? { code: v.code } : {}),
      options,
      selection: 'multiple',
      answer: { correct: options.filter((_, i) => v.options[i]?.[1]).map((o) => o.id) },
      hints: [hint],
      explanation: text(v.why),
    };
  });
