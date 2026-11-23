import type {
  AnswerPayload,
  ScenarioAnswerResponse,
  ScenarioProgress,
  ScenarioProgressListResponse,
  ScenarioTaskStatus,
  UserInfo,
} from '@pracstack/api-contracts';
import type { LanguageId, Scenario, ScenarioGrading } from '@pracstack/content-model';
import { badRequest, notFound } from '../http';
import { gradeAnswer } from '../practice/grading';

/** A learner's answers to one scenario's question tasks. */
export interface ScenarioProgressRecord {
  readonly userId: string;
  readonly scenarioId: string;
  /** By task id. `correct` is sticky once true. */
  readonly questions: Readonly<
    Record<string, { readonly correct: boolean; readonly attempts: number; readonly at: string }>
  >;
  readonly completedAt?: string;
  readonly updatedAt: string;
}

export interface ScenarioProgressStore {
  getScenarioProgress(
    userId: string,
    scenarioId: string,
  ): Promise<ScenarioProgressRecord | undefined>;
  putScenarioProgress(record: ScenarioProgressRecord): Promise<void>;
  listScenarioProgress(userId: string): Promise<readonly ScenarioProgressRecord[]>;
}

export interface ScenarioContent {
  findScenario(
    id: string,
  ): { readonly scenario: Scenario; readonly grading: ScenarioGrading } | undefined;
}

export interface ScenarioDeps {
  readonly content: ScenarioContent;
  readonly store: ScenarioProgressStore;
  /** Languages each challenge has an accepted submission in, for this learner. */
  solvedLanguages(userId: string): Promise<ReadonlyMap<string, readonly LanguageId[]>>;
  readonly now: () => Date;
}

/**
 * Grades scenario question tasks (with the same grader as Skill Mastery) and
 * reports progress. Challenge tasks count as done only when the code runner
 * accepted a submission: nothing here can mark them done.
 */
export class ScenarioService {
  constructor(private readonly deps: ScenarioDeps) {}

  async answer(
    user: UserInfo,
    scenarioId: string,
    taskId: string,
    answer: AnswerPayload,
  ): Promise<ScenarioAnswerResponse> {
    const { scenario, grading } = this.find(scenarioId);
    const task = scenario.tasks.find((t) => t.id === taskId);
    if (!task) throw notFound('This scenario has no such task.');
    if (task.kind !== 'question') {
      throw badRequest('This task is graded by submitting code in the challenge workspace.');
    }
    const key = grading.questions[task.question.id];
    if (!key) throw notFound('This task cannot be graded right now.');
    const grade = gradeAnswer(task.question, key.answer, answer);

    const now = this.deps.now().toISOString();
    const before = await this.deps.store.getScenarioProgress(user.id, scenarioId);
    const previous = before?.questions[taskId];
    const questions = {
      ...before?.questions,
      [taskId]: {
        correct: (previous?.correct ?? false) || grade.result === 'correct',
        attempts: (previous?.attempts ?? 0) + 1,
        at: now,
      },
    };
    const solved = await this.deps.solvedLanguages(user.id);
    const record: ScenarioProgressRecord = {
      userId: user.id,
      scenarioId,
      questions,
      updatedAt: now,
      ...(before?.completedAt ? { completedAt: before.completedAt } : {}),
    };
    let progress = summarize(scenario, record, solved);
    const completedAt = record.completedAt ?? (progress.completed ? now : undefined);
    await this.deps.store.putScenarioProgress(completedAt ? { ...record, completedAt } : record);
    if (completedAt) progress = { ...progress, completedAt };

    return {
      result: grade.result,
      ...(grade.note ? { resultNote: grade.note } : {}),
      correctAnswer: grade.revealed,
      explanation: key.explanation,
      progress,
    };
  }

  async progress(user: UserInfo, scenarioId: string): Promise<ScenarioProgress> {
    const { scenario } = this.find(scenarioId);
    const [record, solved] = await Promise.all([
      this.deps.store.getScenarioProgress(user.id, scenarioId),
      this.deps.solvedLanguages(user.id),
    ]);
    return summarize(scenario, record, solved);
  }

  /** Scenarios with at least one answered question or one solved challenge task. */
  async list(
    user: UserInfo,
    scenarioIds: readonly string[],
  ): Promise<ScenarioProgressListResponse> {
    const [records, solved] = await Promise.all([
      this.deps.store.listScenarioProgress(user.id),
      this.deps.solvedLanguages(user.id),
    ]);
    const byId = new Map(records.map((r) => [r.scenarioId, r]));
    const scenarios: ScenarioProgress[] = [];
    for (const id of scenarioIds) {
      const found = this.deps.content.findScenario(id);
      if (!found) continue;
      const progress = summarize(found.scenario, byId.get(id), solved);
      if (progress.tasks.some((t) => t.status !== 'not-started')) scenarios.push(progress);
    }
    return { scenarios };
  }

  private find(scenarioId: string) {
    const found = this.deps.content.findScenario(scenarioId);
    if (!found) throw notFound('Unknown scenario.');
    return found;
  }
}

export function summarize(
  scenario: Scenario,
  record: ScenarioProgressRecord | undefined,
  solved: ReadonlyMap<string, readonly LanguageId[]>,
): ScenarioProgress {
  const tasks = scenario.tasks.map((task) => {
    let status: ScenarioTaskStatus;
    if (task.kind === 'challenge') {
      status = solved.get(task.challengeId)?.includes(task.language) ? 'done' : 'not-started';
    } else {
      const q = record?.questions[task.id];
      status = q?.correct ? 'done' : q ? 'attempted' : 'not-started';
    }
    return { taskId: task.id, status };
  });
  const done = tasks.filter((t) => t.status === 'done').length;
  return {
    scenarioId: scenario.id,
    tasks,
    done,
    total: tasks.length,
    completed: done === tasks.length,
    ...(record?.completedAt ? { completedAt: record.completedAt } : {}),
  };
}
