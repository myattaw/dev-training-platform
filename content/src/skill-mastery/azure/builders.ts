import type { CodeSnippet, QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, seededShuffle, type FamilyQuestion } from '../family';
import { text } from '../helpers';

/**
 * Azure question family builders. Nothing here runs against Azure: questions are
 * scenario reasoning over artifacts (Bicep/ARM-like JSON, host.json, pipeline YAML,
 * log excerpts, C# shown as plain text because the Azure SDK packages are not
 * referenced by the C# runner). Every key is reviewed by hand, so each question
 * must have exactly one defensible answer (or, for select-all, options that are
 * each unambiguously right or wrong).
 */

export interface ScenarioVariant {
  readonly key: string;
  /** Overrides the family difficulty for this variant. */
  readonly difficulty?: QuestionDifficulty;
  readonly question: string;
  readonly code?: CodeSnippet;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
  /** Overrides the family hint for this variant. */
  readonly hint?: string;
}

/** A single-answer scenario question, optionally with an artifact; options are shuffled. */
export const scenarioFamily = (
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
    hints: [v.hint ?? hint],
    explanation: text(v.why),
  }));

export interface SelectVariant {
  readonly key: string;
  readonly difficulty?: QuestionDifficulty;
  readonly question: string;
  readonly code?: CodeSnippet;
  readonly right: readonly string[];
  readonly wrong: readonly string[];
  readonly why: string;
  readonly hint?: string;
}

/** "Select all that apply": every option must be unambiguously right or wrong. */
export const selectAllFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly SelectVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => {
    const texts = seededShuffle([...v.right, ...v.wrong], `${id}-${v.key}`);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const options = texts.map((t, i) => ({ id: ids[i] ?? `o${i}`, text: t }));
    return {
      difficulty: v.difficulty ?? difficulty,
      format: 'multiple-choice',
      prompt: text(`${v.question} Select all that apply.`),
      ...(v.code ? { code: v.code } : {}),
      options,
      selection: 'multiple',
      answer: { correct: options.filter((o) => v.right.includes(o.text)).map((o) => o.id) },
      hints: [v.hint ?? hint],
      explanation: text(v.why),
    };
  });

export interface ConfigBlankVariant {
  readonly key: string;
  readonly prompt: string;
  /** YAML or JSON with `{{blank:id}}` placeholders. */
  readonly template: CodeSnippet;
  readonly blanks: Record<string, readonly string[]>;
  readonly why: string;
}

/** Fill in a configuration keyword. Not machine-checked; accepted answers are compared case-insensitively. */
export const configBlankFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly ConfigBlankVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'fill-in-blank',
    prompt: text(v.prompt),
    template: v.template,
    answer: {
      blanks: Object.fromEntries(
        Object.entries(v.blanks).map(([k, accepted]) => [
          k,
          { accepted: [...accepted], caseSensitive: false },
        ]),
      ),
    },
    hints: [hint],
    explanation: text(v.why),
  }));
