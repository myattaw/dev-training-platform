import type { InstructionBlock } from '@pracstack/content-model';
import type { AnswerPayload, AnswerResult, RevealedAnswer } from './index';

/*
 * Enterprise Scenarios. The scenarios themselves are public content files
 * (scenarios.json, scenarios/<id>@<version>.json); these routes grade question
 * tasks and report progress. Challenge tasks are graded by the normal
 * challenge submission route; a challenge task is done when that challenge has
 * an accepted submission in the task's language.
 */

export type ScenarioTaskStatus = 'done' | 'attempted' | 'not-started';

export interface ScenarioTaskProgress {
  readonly taskId: string;
  readonly status: ScenarioTaskStatus;
}

export interface ScenarioProgress {
  readonly scenarioId: string;
  readonly tasks: readonly ScenarioTaskProgress[];
  readonly done: number;
  readonly total: number;
  readonly completed: boolean;
  /** When the last task was completed (ISO), once the scenario is complete. */
  readonly completedAt?: string;
}

/** GET /api/scenarios/progress: every scenario the learner has started. */
export interface ScenarioProgressListResponse {
  readonly scenarios: readonly ScenarioProgress[];
}

/** POST /api/scenarios/:scenarioId/answer */
export interface ScenarioAnswerRequest {
  readonly taskId: string;
  readonly answer: AnswerPayload;
}

export interface ScenarioAnswerResponse {
  readonly result: AnswerResult;
  readonly resultNote?: string;
  readonly correctAnswer: RevealedAnswer;
  readonly explanation: readonly InstructionBlock[];
  readonly progress: ScenarioProgress;
}
