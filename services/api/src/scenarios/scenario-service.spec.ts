import type { UserInfo } from '@pracstack/api-contracts';
import { SCENARIOS } from '@pracstack/content';
import { type LanguageId, splitScenario } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import {
  type ScenarioProgressRecord,
  type ScenarioProgressStore,
  ScenarioService,
} from './scenario-service';

const split = SCENARIOS.map(splitScenario);
const content = {
  findScenario: (id: string) => split.find((s) => s.scenario.id === id),
};

class MemoryStore implements ScenarioProgressStore {
  readonly records = new Map<string, ScenarioProgressRecord>();
  getScenarioProgress(userId: string, scenarioId: string) {
    return Promise.resolve(this.records.get(`${userId}/${scenarioId}`));
  }
  putScenarioProgress(record: ScenarioProgressRecord) {
    this.records.set(`${record.userId}/${record.scenarioId}`, record);
    return Promise.resolve();
  }
  listScenarioProgress(userId: string) {
    return Promise.resolve([...this.records.values()].filter((r) => r.userId === userId));
  }
}

const user: UserInfo = { id: 'u1', displayName: 'Ada', mode: 'local-dev' } as UserInfo;
const other: UserInfo = { id: 'u2', displayName: 'Bob', mode: 'local-dev' } as UserInfo;

function setup(solved: Record<string, LanguageId[]> = {}) {
  const store = new MemoryStore();
  const service = new ScenarioService({
    content,
    store,
    solvedLanguages: () => Promise.resolve(new Map(Object.entries(solved))),
    now: () => new Date('2026-11-23T12:00:00Z'),
  });
  return { store, service };
}

/** A scenario with both kinds of task, and the private key of its questions. */
const mixed = split.find((s) => s.scenario.assessment === 'mixed')!;
const questionTasks = mixed.scenario.tasks.filter((t) => t.kind === 'question');
const challengeTask = mixed.scenario.tasks.find((t) => t.kind === 'challenge')!;

/** The right answer for a question task, built from the private key. */
function rightAnswer(taskId: string) {
  const task = questionTasks.find((t) => t.id === taskId)!;
  const key = mixed.grading.questions[task.question.id]!.answer;
  switch (key.format) {
    case 'multiple-choice':
      return { format: 'multiple-choice' as const, selected: key.correct };
    case 'predict-output':
      return { format: 'predict-output' as const, output: key.output };
    case 'fill-in-blank':
      return {
        format: 'fill-in-blank' as const,
        blanks: Object.fromEntries(Object.entries(key.blanks).map(([k, v]) => [k, v.accepted[0]!])),
      };
    default:
      throw new Error('unexpected format');
  }
}

describe('ScenarioService', () => {
  it('has real scenarios of every assessment kind to test against', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(7);
    expect(new Set(split.map((s) => s.scenario.assessment))).toEqual(
      new Set(['mixed', 'structured']),
    );
    expect(questionTasks.length).toBeGreaterThan(1);
  });

  it('grades a question task with the private key and reveals the answer and explanation', async () => {
    const { service } = setup();
    const task = questionTasks[0]!;
    const res = await service.answer(user, mixed.scenario.id, task.id, rightAnswer(task.id));
    expect(res.result).toBe('correct');
    expect(res.explanation.length).toBeGreaterThan(0);
    expect(res.progress.tasks.find((t) => t.taskId === task.id)?.status).toBe('done');
  });

  it('records a wrong answer as attempted, and a later right answer as done (sticky)', async () => {
    const { service } = setup();
    const task = questionTasks.find((t) => t.question.format === 'multiple-choice')!;
    const key = mixed.grading.questions[task.question.id]!.answer;
    if (key.format !== 'multiple-choice' || task.question.format !== 'multiple-choice') return;
    const wrong = task.question.options.find((o) => !key.correct.includes(o.id))!.id;
    const first = await service.answer(user, mixed.scenario.id, task.id, {
      format: 'multiple-choice',
      selected: [wrong],
    });
    expect(first.result).toBe('incorrect');
    expect(first.progress.tasks.find((t) => t.taskId === task.id)?.status).toBe('attempted');
    await service.answer(user, mixed.scenario.id, task.id, rightAnswer(task.id));
    const third = await service.answer(user, mixed.scenario.id, task.id, {
      format: 'multiple-choice',
      selected: [wrong],
    });
    expect(third.progress.tasks.find((t) => t.taskId === task.id)?.status).toBe('done');
  });

  it('never marks a challenge task done from an answer; only an accepted submission counts', async () => {
    const { service } = setup();
    await expect(
      service.answer(user, mixed.scenario.id, challengeTask.id, {
        format: 'multiple-choice',
        selected: ['a'],
      }),
    ).rejects.toThrow(/challenge workspace/);
    if (challengeTask.kind !== 'challenge') return;
    const notSolved = await service.progress(user, mixed.scenario.id);
    expect(notSolved.tasks.find((t) => t.taskId === challengeTask.id)?.status).toBe('not-started');
    // Solved in another language does not count.
    const otherLanguage = await setup({
      [challengeTask.challengeId]: ['typescript'],
    }).service.progress(user, mixed.scenario.id);
    expect(otherLanguage.tasks.find((t) => t.taskId === challengeTask.id)?.status).toBe(
      'not-started',
    );
    const solved = await setup({
      [challengeTask.challengeId]: [challengeTask.language],
    }).service.progress(user, mixed.scenario.id);
    expect(solved.tasks.find((t) => t.taskId === challengeTask.id)?.status).toBe('done');
  });

  it('completes the scenario when every task is done, and records when', async () => {
    if (challengeTask.kind !== 'challenge') return;
    const { service } = setup({ [challengeTask.challengeId]: [challengeTask.language] });
    let last;
    for (const task of questionTasks) {
      last = await service.answer(user, mixed.scenario.id, task.id, rightAnswer(task.id));
    }
    expect(last?.progress).toMatchObject({
      completed: true,
      done: mixed.scenario.tasks.length,
      completedAt: '2026-11-23T12:00:00.000Z',
    });
  });

  it('keeps learners apart and lists only started scenarios', async () => {
    const { service } = setup();
    const task = questionTasks[0]!;
    await service.answer(user, mixed.scenario.id, task.id, rightAnswer(task.id));
    const ids = split.map((s) => s.scenario.id);
    expect((await service.list(user, ids)).scenarios.map((s) => s.scenarioId)).toEqual([
      mixed.scenario.id,
    ]);
    expect((await service.list(other, ids)).scenarios).toEqual([]);
  });

  it('rejects unknown scenarios and tasks, and answers of the wrong format', async () => {
    const { service } = setup();
    await expect(service.progress(user, 'nope')).rejects.toThrow(/Unknown scenario/);
    await expect(
      service.answer(user, mixed.scenario.id, 'nope', { format: 'predict-output', output: '' }),
    ).rejects.toThrow(/no such task/);
    const task = questionTasks.find((t) => t.question.format !== 'predict-output')!;
    await expect(
      service.answer(user, mixed.scenario.id, task.id, { format: 'predict-output', output: 'x' }),
    ).rejects.toThrow(/expects/);
  });
});
