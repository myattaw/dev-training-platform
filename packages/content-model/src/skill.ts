import type { InstructionBlock } from './instruction';

/**
 * Skill Mastery hierarchy: Technology → Topic → Skill → Questions.
 *
 * Only the catalog (technologies, topics, skills) is public. Questions are
 * served one at a time by the API, so the whole question bank, including the
 * question text, ships only in the private bundle.
 */
export interface Technology {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface Topic {
  readonly id: string;
  readonly technologyId: string;
  readonly name: string;
  readonly description: string;
}

export interface Skill {
  readonly id: string;
  readonly topicId: string;
  readonly name: string;
  readonly description: string;
}

/** 1 (introductory) to 5 (expert). Drives question selection by mastery band. */
export type QuestionDifficulty = 1 | 2 | 3 | 4 | 5;

export const QUESTION_DIFFICULTIES: readonly QuestionDifficulty[] = [1, 2, 3, 4, 5];

export type CodeLanguage = 'typescript' | 'sql' | 'html';

export interface CodeSnippet {
  readonly language: CodeLanguage;
  readonly source: string;
}

/** Fields every question has, public and authored. */
interface QuestionBase {
  /** Stable id, unique across all skills. Never reuse or rename. */
  readonly id: string;
  readonly version: number;
  readonly skillId: string;
  readonly difficulty: QuestionDifficulty;
  readonly prompt: readonly InstructionBlock[];
}

export interface ChoiceOption {
  readonly id: string;
  /** Plain text; `backticks` render as inline code. */
  readonly text: string;
}

/* ---------- Public question shapes (what a learner sees) ---------- */

export interface MultipleChoiceQuestion extends QuestionBase {
  readonly format: 'multiple-choice';
  readonly code?: CodeSnippet;
  readonly options: readonly ChoiceOption[];
  readonly selection: 'single' | 'multiple';
}

export interface PredictOutputQuestion extends QuestionBase {
  readonly format: 'predict-output';
  readonly code: CodeSnippet;
}

export interface FillInBlankQuestion extends QuestionBase {
  readonly format: 'fill-in-blank';
  /** Code containing blanks written as `{{blank:<id>}}`. */
  readonly template: CodeSnippet;
}

export type Question = MultipleChoiceQuestion | PredictOutputQuestion | FillInBlankQuestion;
export type QuestionFormat = Question['format'];

export const QUESTION_FORMATS: readonly QuestionFormat[] = [
  'multiple-choice',
  'predict-output',
  'fill-in-blank',
];

/** Public question plus how many hints exist (the hints themselves are private). */
export type PublicQuestion = Question & { readonly hintCount: number };

/* ---------- Private answer data ---------- */

export interface BlankAnswer {
  /** Any of these is correct. Compared after trimming and collapsing whitespace. */
  readonly accepted: readonly string[];
  readonly caseSensitive?: boolean;
}

export type QuestionAnswer =
  | { readonly format: 'multiple-choice'; readonly correct: readonly string[] }
  | { readonly format: 'predict-output'; readonly output: string }
  | { readonly format: 'fill-in-blank'; readonly blanks: Readonly<Record<string, BlankAnswer>> };

/** Private: grading data, hints and explanation, revealed only by the API. */
export interface QuestionGrading {
  readonly questionId: string;
  readonly version: number;
  readonly answer: QuestionAnswer;
  readonly hints: readonly string[];
  readonly explanation: readonly InstructionBlock[];
}

/* ---------- Authoring shapes (what a content author writes) ---------- */

type Authored<Q extends Question, A extends QuestionAnswer> = Omit<Q, 'skillId'> & {
  readonly answer: Omit<A, 'format'>;
  readonly hints: readonly string[];
  readonly explanation: readonly InstructionBlock[];
};

export type QuestionSource =
  | Authored<MultipleChoiceQuestion, Extract<QuestionAnswer, { format: 'multiple-choice' }>>
  | Authored<PredictOutputQuestion, Extract<QuestionAnswer, { format: 'predict-output' }>>
  | Authored<FillInBlankQuestion, Extract<QuestionAnswer, { format: 'fill-in-blank' }>>;

export interface SkillSource extends Skill {
  readonly questions: readonly QuestionSource[];
}

export interface TopicSource extends Omit<Topic, 'technologyId'> {
  readonly skills: readonly Omit<SkillSource, 'topicId'>[];
}

export interface TrackSource extends Technology {
  readonly topics: readonly TopicSource[];
}

/** Public catalog for one technology (no questions). */
export interface TrackCatalog {
  readonly technology: Technology;
  readonly topics: readonly Topic[];
  readonly skills: readonly (Skill & { readonly questionCount: number })[];
}

export const BLANK_PATTERN = /\{\{blank:([a-z0-9-]+)\}\}/g;

/** Ids of the blanks in a template, in order of appearance. */
export function blankIds(template: string): string[] {
  return [...template.matchAll(BLANK_PATTERN)].map((m) => m[1] ?? '');
}
