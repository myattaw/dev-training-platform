import type { ChallengeSource, Difficulty, LanguageId } from './challenge';
import { LANGUAGE_IDS } from './challenge';
import type { InstructionBlock } from './instruction';
import type { CodeSnippet, PublicQuestion, QuestionGrading, QuestionSource } from './skill';
import { splitQuestion } from './split';
import {
  ID_PATTERN,
  validateInstructionBlocks,
  validateQuestionSources,
  type ValidationIssue,
} from './validate';

/**
 * Enterprise Scenarios: realistic business tasks rather than algorithm puzzles.
 *
 * A scenario gives business context, requirements, acceptance criteria and
 * artifacts (code, configuration, logs, data), then a sequence of tasks. Each
 * task is graded genuinely, in one of two ways:
 *
 * - `challenge`: write code that is compiled and run against hidden tests in
 *   the code runner (e.g. an ASP.NET Core API tested over real HTTP);
 * - `question`: a structured assessment question (multiple choice, fill in the
 *   blank, predict the output), graded by the API against a private key.
 *
 * A scenario is complete when every task is done: every challenge accepted and
 * every question answered correctly.
 */

export interface ScenarioArtifact {
  readonly id: string;
  readonly title: string;
  /** One line explaining what the artifact is. */
  readonly description: string;
  readonly snippet: CodeSnippet;
}

/** Authoring shape of a question task: a normal question, outside any skill. */
export type ScenarioQuestionSource = QuestionSource;

export type ScenarioTaskSource =
  | {
      readonly kind: 'challenge';
      readonly id: string;
      readonly title: string;
      readonly brief: readonly InstructionBlock[];
      readonly challengeId: string;
      readonly language: LanguageId;
    }
  | {
      readonly kind: 'question';
      readonly id: string;
      readonly title: string;
      readonly question: ScenarioQuestionSource;
    };

export interface ScenarioSource {
  /** Stable slug: /scenarios/<id>. Never reuse or rename. */
  readonly id: string;
  readonly version: number;
  readonly title: string;
  /** One line for the catalog. */
  readonly summary: string;
  readonly difficulty: Difficulty;
  readonly estimatedMinutes: number;
  /** Technology labels shown as tags, e.g. "C#", "ASP.NET Core". */
  readonly technologies: readonly string[];
  /** Skill Mastery skills the scenario exercises (validated). */
  readonly relatedSkillIds: readonly string[];
  readonly context: readonly InstructionBlock[];
  readonly requirements: readonly InstructionBlock[];
  readonly acceptanceCriteria: readonly string[];
  readonly artifacts: readonly ScenarioArtifact[];
  readonly tasks: readonly ScenarioTaskSource[];
  /** What the automated grading does not cover, stated plainly. */
  readonly limitations?: string;
}

/* ---------- Public and private shapes ---------- */

export type ScenarioTask =
  | Extract<ScenarioTaskSource, { kind: 'challenge' }>
  | {
      readonly kind: 'question';
      readonly id: string;
      readonly title: string;
      readonly question: PublicQuestion;
    };

/** How a scenario is graded, derived from its tasks. */
export type ScenarioAssessment = 'executable' | 'structured' | 'mixed';

/** Public: safe to ship to browsers (no answers, hints or explanations). */
export interface Scenario extends Omit<ScenarioSource, 'tasks'> {
  readonly assessment: ScenarioAssessment;
  readonly tasks: readonly ScenarioTask[];
}

export type ScenarioSummary = Pick<
  Scenario,
  | 'id'
  | 'version'
  | 'title'
  | 'summary'
  | 'difficulty'
  | 'estimatedMinutes'
  | 'technologies'
  | 'assessment'
> & { readonly taskCount: number };

/** Private grading data for a scenario's question tasks. */
export interface ScenarioGrading {
  readonly scenarioId: string;
  readonly version: number;
  /** By question id. */
  readonly questions: Readonly<Record<string, QuestionGrading>>;
}

export const SCENARIOS_FILE = 'scenarios.json';
export const scenarioFile = (id: string, version: number): string =>
  `scenarios/${id}@${version}.json`;

/** Public scenarios file: the catalog. */
export interface ScenariosFile {
  readonly scenarios: readonly ScenarioSummary[];
}

export function scenarioAssessment(tasks: readonly ScenarioTaskSource[]): ScenarioAssessment {
  const kinds = new Set(tasks.map((t) => t.kind));
  return kinds.size > 1 ? 'mixed' : kinds.has('challenge') ? 'executable' : 'structured';
}

/** Splits a scenario into its public part and its private grading data. */
export function splitScenario(source: ScenarioSource): {
  readonly scenario: Scenario;
  readonly grading: ScenarioGrading;
} {
  const questions: Record<string, QuestionGrading> = {};
  const tasks: ScenarioTask[] = source.tasks.map((task) => {
    if (task.kind === 'challenge') return task;
    // Scenario questions have no skill; the scenario id stands in for it.
    const { question, grading } = splitQuestion(task.question, `scenario:${source.id}`);
    questions[question.id] = grading;
    return { kind: 'question', id: task.id, title: task.title, question };
  });
  const { tasks: _tasks, ...rest } = source;
  void _tasks;
  return {
    scenario: { ...rest, assessment: scenarioAssessment(source.tasks), tasks },
    grading: { scenarioId: source.id, version: source.version, questions },
  };
}

export function scenarioSummary(scenario: Scenario): ScenarioSummary {
  const { id, version, title, summary, difficulty, estimatedMinutes, technologies, assessment } =
    scenario;
  return {
    id,
    version,
    title,
    summary,
    difficulty,
    estimatedMinutes,
    technologies,
    assessment,
    taskCount: scenario.tasks.length,
  };
}

/** Validates scenarios, including references to challenges and skills. */
export function validateScenarios(
  sources: readonly ScenarioSource[],
  refs: { readonly challenges: readonly ChallengeSource[]; readonly skillIds: ReadonlySet<string> },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });
  const seen = new Set<string>();
  const questionIds = new Set<string>();

  for (const s of sources) {
    const path = `scenario:${s.id}`;
    if (!ID_PATTERN.test(s.id)) error(path, 'id must be kebab-case');
    if (seen.has(s.id)) error(path, 'duplicate scenario id');
    seen.add(s.id);
    if (!Number.isInteger(s.version) || s.version < 1) error(path, 'version must be 1 or more');
    if (s.title.trim() === '' || s.summary.trim() === '')
      error(path, 'title and summary are required');
    if (!(s.estimatedMinutes > 0)) error(path, 'estimatedMinutes must be positive');
    if (s.technologies.length === 0) error(path, 'list at least one technology');
    issues.push(...validateInstructionBlocks(`${path}/context`, s.context, 'context'));
    issues.push(
      ...validateInstructionBlocks(`${path}/requirements`, s.requirements, 'requirements'),
    );
    if (s.acceptanceCriteria.length === 0) error(path, 'acceptance criteria are required');
    if (s.artifacts.length === 0) error(path, 'a scenario needs at least one artifact');
    for (const a of s.artifacts) {
      if (!ID_PATTERN.test(a.id))
        error(`${path}/artifacts`, `artifact id "${a.id}" must be kebab-case`);
      if (a.snippet.source.trim() === '') error(`${path}/artifacts/${a.id}`, 'artifact is empty');
    }
    for (const id of s.relatedSkillIds) {
      if (!refs.skillIds.has(id)) error(path, `unknown related skill "${id}"`);
    }
    if (s.tasks.length < 3) error(path, 'a scenario needs at least three tasks');
    const taskIds = new Set<string>();
    for (const task of s.tasks) {
      const taskPath = `${path}/tasks/${task.id}`;
      if (!ID_PATTERN.test(task.id)) error(taskPath, 'task id must be kebab-case');
      if (taskIds.has(task.id)) error(taskPath, 'duplicate task id');
      taskIds.add(task.id);
      if (task.title.trim() === '') error(taskPath, 'title is required');
      if (task.kind === 'challenge') {
        issues.push(...validateInstructionBlocks(`${taskPath}/brief`, task.brief, 'brief'));
        const challenge = refs.challenges.find((c) => c.challenge.id === task.challengeId);
        if (!challenge) error(taskPath, `unknown challenge "${task.challengeId}"`);
        else if (!challenge.challenge.languages[task.language]) {
          error(taskPath, `challenge "${task.challengeId}" is not offered in ${task.language}`);
        }
        if (!LANGUAGE_IDS.includes(task.language))
          error(taskPath, `unknown language ${task.language}`);
      } else {
        if (questionIds.has(task.question.id)) {
          error(taskPath, `question id "${task.question.id}" is used twice`);
        }
        questionIds.add(task.question.id);
        if (task.question.format === 'sql-query') {
          error(taskPath, 'SQL-writing questions are not supported in scenarios yet');
        }
        issues.push(...validateQuestionSources(taskPath, [task.question]));
      }
    }
  }
  return issues;
}
