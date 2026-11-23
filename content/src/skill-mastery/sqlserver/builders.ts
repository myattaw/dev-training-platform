import type {
  CodeSnippet,
  InstructionBlock,
  QuestionDifficulty,
  QuestionSource,
} from '@pracstack/content-model';
import { choice, family, seededShuffle, type FamilyQuestion } from '../family';
import { sql, text } from '../helpers';

/**
 * SQL Server (T-SQL) question family builders.
 *
 * There is no SQL Server engine in PracStack yet (it needs Microsoft's licence
 * terms accepted), so nothing here is executed: every answer key is reviewed by
 * hand. Keep exactly one defensible answer for single choice, and make every
 * option of a multiple-selection question unambiguously right or wrong.
 *
 * - `code` is shown with the question: a string is T-SQL, or pass a snippet
 *   (for example `plain(...)` for an execution plan or an error log).
 * - `data` is shown as a code block in the prompt: small tables, plans, messages.
 */

interface VariantBase {
  readonly key: string;
  readonly difficulty: QuestionDifficulty;
  readonly question: string;
  /** Tables, plan excerpts or messages shown above the code. */
  readonly data?: string;
  readonly code?: string | CodeSnippet;
  /** Overrides the family hint. */
  readonly hint?: string;
  readonly why: string;
}

const promptOf = (v: VariantBase): InstructionBlock[] => [
  { kind: 'paragraph', text: v.question },
  ...(v.data ? [{ kind: 'code' as const, code: v.data }] : []),
];

const codeOf = (v: VariantBase): { code?: CodeSnippet } =>
  v.code === undefined ? {} : { code: typeof v.code === 'string' ? sql(v.code) : v.code };

export interface SingleVariant extends VariantBase {
  readonly correct: string;
  readonly wrong: readonly string[];
}

/** Single-answer multiple choice; options are shuffled (seeded, stable). */
export const tsqlChoiceFamily = (
  id: string,
  hint: string,
  variants: readonly SingleVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty: v.difficulty,
    format: 'multiple-choice',
    prompt: promptOf(v),
    ...codeOf(v),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [v.hint ?? hint],
    explanation: text(v.why),
  }));

export interface MultiVariant extends VariantBase {
  /** Options that are correct. */
  readonly right: readonly string[];
  /** Options that are wrong. */
  readonly wrong: readonly string[];
}

/** "Select all that apply"; options are shuffled (seeded, stable). */
export const tsqlMultiFamily = (
  id: string,
  hint: string,
  variants: readonly MultiVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => {
    const texts = seededShuffle([...v.right, ...v.wrong], `${id}-${v.key}`);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const options = texts.map((t, i) => ({ id: ids[i] ?? `o${i}`, text: t }));
    return {
      difficulty: v.difficulty,
      format: 'multiple-choice',
      prompt: promptOf({ ...v, question: `${v.question} Select all that apply.` }),
      ...codeOf(v),
      options,
      selection: 'multiple',
      answer: { correct: options.filter((o) => v.right.includes(o.text)).map((o) => o.id) },
      hints: [v.hint ?? hint],
      explanation: text(v.why),
    };
  });

export interface BlankVariant {
  readonly key: string;
  readonly difficulty: QuestionDifficulty;
  readonly prompt: string;
  /** T-SQL with `{{blank:id}}` placeholders. */
  readonly template: string;
  /** Every acceptable spelling; compared case-insensitively. */
  readonly blanks: Readonly<Record<string, readonly string[]>>;
  readonly why: string;
}

/** Fill in the blanks. T-SQL is not executed, so list every accepted spelling. */
export const tsqlBlankFamily = (
  id: string,
  hint: string,
  variants: readonly BlankVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty: v.difficulty,
    format: 'fill-in-blank',
    prompt: text(v.prompt),
    template: sql(v.template),
    answer: {
      blanks: Object.fromEntries(
        Object.entries(v.blanks).map(([k, accepted]) => [k, { accepted: [...accepted] }]),
      ),
    },
    hints: [hint],
    explanation: text(v.why),
  }));
