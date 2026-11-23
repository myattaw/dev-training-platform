import type {
  CodeSnippet,
  InstructionBlock,
  QuestionDifficulty,
  QuestionSource,
  ScenarioTaskSource,
} from '@pracstack/content-model';
import { choice } from '../skill-mastery/family';
import { text } from '../skill-mastery/helpers';

/**
 * Builders for scenario tasks. Question ids are global, so every id is
 * prefixed with the scenario id by the caller. C# shown with `cs(...)` is
 * compiled (and run, if it is a program) by the content checks; use `plain`
 * for code that needs NuGet packages (EF Core, Azure SDK) or is pseudo-code.
 */

type Prompt = string | readonly InstructionBlock[];
const blocks = (p: Prompt): InstructionBlock[] => (typeof p === 'string' ? text(p) : [...p]);

interface Common {
  readonly id: string;
  readonly difficulty: QuestionDifficulty;
  readonly prompt: Prompt;
  readonly hint: string;
  readonly why: Prompt;
}

/** Single answer; options are shuffled (seeded by id). */
export const single = (
  q: Common & {
    readonly code?: CodeSnippet;
    readonly correct: string;
    readonly wrong: readonly string[];
  },
): QuestionSource => ({
  id: q.id,
  version: 1,
  difficulty: q.difficulty,
  format: 'multiple-choice',
  prompt: blocks(q.prompt),
  ...(q.code ? { code: q.code } : {}),
  ...choice(q.id, q.correct, q.wrong),
  hints: [q.hint],
  explanation: blocks(q.why),
});

/** Select all that apply; options keep their order. */
export const multiple = (
  q: Common & {
    readonly code?: CodeSnippet;
    readonly options: readonly { readonly text: string; readonly correct: boolean }[];
  },
): QuestionSource => {
  const ids = 'abcdefgh';
  const options = q.options.map((o, i) => ({ id: ids[i] ?? `o${i}`, text: o.text }));
  return {
    id: q.id,
    version: 1,
    difficulty: q.difficulty,
    format: 'multiple-choice',
    prompt: blocks(q.prompt),
    ...(q.code ? { code: q.code } : {}),
    options,
    selection: 'multiple',
    answer: { correct: options.filter((_, i) => q.options[i]?.correct).map((o) => o.id) },
    hints: [q.hint],
    explanation: blocks(q.why),
  };
};

/** What does this C# program print? (compiled and run by the content checks) */
export const predict = (
  q: Common & { readonly code: CodeSnippet; readonly output: string },
): QuestionSource => ({
  id: q.id,
  version: 1,
  difficulty: q.difficulty,
  format: 'predict-output',
  prompt: blocks(q.prompt),
  code: q.code,
  answer: { output: q.output },
  hints: [q.hint],
  explanation: blocks(q.why),
});

/** Fill in the blanks (`{{blank:id}}`); C# templates are compiled with every accepted answer. */
export const blanks = (
  q: Common & {
    readonly template: CodeSnippet;
    readonly accepted: Readonly<Record<string, readonly string[]>>;
    readonly caseSensitive?: boolean;
  },
): QuestionSource => ({
  id: q.id,
  version: 1,
  difficulty: q.difficulty,
  format: 'fill-in-blank',
  prompt: blocks(q.prompt),
  template: q.template,
  answer: {
    blanks: Object.fromEntries(
      Object.entries(q.accepted).map(([k, accepted]) => [
        k,
        { accepted: [...accepted], ...(q.caseSensitive ? { caseSensitive: true } : {}) },
      ]),
    ),
  },
  hints: [q.hint],
  explanation: blocks(q.why),
});

export const questionTask = (
  id: string,
  title: string,
  question: QuestionSource,
): ScenarioTaskSource => ({ kind: 'question', id, title, question });

export const challengeTask = (
  id: string,
  title: string,
  challengeId: string,
  brief: Prompt,
): ScenarioTaskSource => ({
  kind: 'challenge',
  id,
  title,
  brief: blocks(brief),
  challengeId,
  language: 'csharp',
});
