import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  AnswerPayload,
  ScenarioAnswerResponse,
  ScenarioProgress,
  ScenarioTaskStatus,
} from '@pracstack/api-contracts';
import {
  LANGUAGE_LABELS,
  type LanguageId,
  type Scenario,
  type ScenarioTask,
} from '@pracstack/content-model';
import { ChallengeProgressService } from '../../challenges/data-access/challenge-progress.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotFound } from '../../../core/not-found/not-found';
import { asyncResource, errorMessage } from '../../../shared/async/async-state';
import { InstructionBlocks } from '../../../shared/content/instruction-blocks/instruction-blocks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import type { Breadcrumb } from '../../../shared/ui/breadcrumbs/breadcrumbs';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';
import { DifficultyBadge } from '../../challenges/ui/difficulty-badge';
import { FillInBlank } from '../../skill-mastery/pages/practice/questions/fill-in-blank';
import { MultipleChoice } from '../../skill-mastery/pages/practice/questions/multiple-choice';
import { PredictOutput } from '../../skill-mastery/pages/practice/questions/predict-output';
import { ScenarioService } from '../data-access/scenario.service';
import { AssessmentBadge } from '../ui/assessment-badge';

const STATUS_LABELS: Readonly<Record<ScenarioTaskStatus, string>> = {
  done: 'Done',
  attempted: 'Attempted',
  'not-started': 'Not started',
};

@Component({
  selector: 'app-scenario-detail',
  imports: [
    RouterLink,
    NotFound,
    Alert,
    Badge,
    LoadingState,
    PageHeader,
    Panel,
    InstructionBlocks,
    DifficultyBadge,
    AssessmentBadge,
    MultipleChoice,
    PredictOutput,
    FillInBlank,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-detail.html',
  styleUrl: './scenario-detail.css',
})
export class ScenarioDetail {
  /** Route param, bound by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  private readonly service = inject(ScenarioService);
  protected readonly auth = inject(AuthService);
  private readonly challengeProgress = inject(ChallengeProgressService);

  protected readonly loaded = asyncResource(
    () => this.id(),
    (id) => this.service.scenario(id),
  );
  protected readonly scenario = computed<Scenario | undefined>(() => {
    const s = this.loaded.state();
    return s.status === 'ready' ? s.value : undefined;
  });

  /** Server progress; signed-out visitors can read the scenario but not save answers. */
  private readonly serverProgress = asyncResource(
    () => ({ id: this.id(), status: this.auth.status() }),
    ({ id, status }) =>
      status === 'signed-out' ? Promise.resolve(undefined) : this.service.progress(id),
  );
  /** Latest progress: from the last answer if there is one, else from the server. */
  private readonly answeredProgress = signal<ScenarioProgress | undefined>(undefined);
  protected readonly progress = computed(() => {
    const fromAnswer = this.answeredProgress();
    if (fromAnswer?.scenarioId === this.id()) return fromAnswer;
    const s = this.serverProgress.state();
    return s.status === 'ready' ? s.value : undefined;
  });

  protected readonly drafts = signal<Readonly<Record<string, AnswerPayload | null>>>({});
  protected readonly results = signal<Readonly<Record<string, ScenarioAnswerResponse>>>({});
  protected readonly busyTask = signal<string | undefined>(undefined);
  protected readonly errors = signal<Readonly<Record<string, string>>>({});
  protected readonly languageLabels = LANGUAGE_LABELS;

  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => [
    { label: 'Enterprise Scenarios', link: '/scenarios' },
    { label: this.scenario()?.title ?? '' },
  ]);

  protected statusOf(taskId: string): ScenarioTaskStatus {
    return this.progress()?.tasks.find((t) => t.taskId === taskId)?.status ?? 'not-started';
  }

  protected statusLabel(taskId: string): string {
    return STATUS_LABELS[this.statusOf(taskId)];
  }

  protected setDraft(taskId: string, answer: AnswerPayload | null): void {
    this.drafts.update((d) => ({ ...d, [taskId]: answer }));
  }

  protected async submit(task: Extract<ScenarioTask, { kind: 'question' }>): Promise<void> {
    const answer = this.drafts()[task.id];
    if (!answer) return;
    this.busyTask.set(task.id);
    this.errors.update((e) => ({ ...e, [task.id]: '' }));
    try {
      const res = await this.service.answer(this.id(), task.id, answer);
      this.results.update((r) => ({ ...r, [task.id]: res }));
      this.answeredProgress.set(res.progress);
    } catch (err) {
      this.errors.update((e) => ({ ...e, [task.id]: errorMessage(err) }));
    } finally {
      this.busyTask.set(undefined);
    }
  }

  /** Lets the learner answer again after seeing the result. */
  protected retry(taskId: string): void {
    this.results.update((r) => {
      const { [taskId]: _removed, ...rest } = r;
      void _removed;
      return rest;
    });
  }

  /** The workspace opens in the last language used for a challenge; set it to the task's. */
  protected openChallenge(challengeId: string, language: LanguageId): void {
    this.challengeProgress.setPreferredLanguage(challengeId, language);
  }

  protected signIn(): void {
    void this.auth.signIn(`/scenarios/${this.id()}`);
  }
}
