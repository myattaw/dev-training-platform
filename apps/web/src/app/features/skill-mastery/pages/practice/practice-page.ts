import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AnswerPayload, AnswerResponse, NextQuestionResponse } from '@pracstack/api-contracts';
import { ApiClientError } from '../../../../core/api/api-client';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { InstructionBlocks } from '../../../../shared/content/instruction-blocks/instruction-blocks';
import { InlineText } from '../../../../shared/content/inline-text/inline-text';
import { Alert, type AlertType } from '../../../../shared/ui/alert/alert';
import { Badge } from '../../../../shared/ui/badge/badge';
import { Icon } from '../../../../shared/ui/icon/icon';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { PracticeApi } from '../../data-access/practice-api';
import { SkillCatalog } from '../../data-access/skill-catalog';
import { MasteryMeter } from '../../ui/mastery-meter';
import { FillInBlank } from './questions/fill-in-blank';
import { MultipleChoice } from './questions/multiple-choice';
import { PredictOutput } from './questions/predict-output';
import { SqlQuery, type SqlRunState } from './questions/sql-query';

type Phase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'answering'; readonly served: NextQuestionResponse }
  | {
      readonly kind: 'feedback';
      readonly served: NextQuestionResponse;
      readonly response: AnswerResponse;
    };

interface SessionTally {
  readonly answered: number;
  readonly correct: number;
  readonly xp: number;
  readonly startScore: number | undefined;
}

const RESULT_DISPLAY: Readonly<
  Record<AnswerResponse['result'], { type: AlertType; heading: string }>
> = {
  correct: { type: 'success', heading: 'Correct' },
  partial: { type: 'warning', heading: 'Partly correct' },
  incorrect: { type: 'error', heading: 'Not quite' },
};

@Component({
  selector: 'app-practice-page',
  imports: [
    RouterLink,
    NotFound,
    InstructionBlocks,
    InlineText,
    Alert,
    Badge,
    Icon,
    LoadingState,
    PageHeader,
    Panel,
    MasteryMeter,
    MultipleChoice,
    PredictOutput,
    FillInBlank,
    SqlQuery,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './practice-page.html',
  styleUrl: './practice-page.css',
})
export class PracticePage {
  /** Route params. */
  readonly technologyId = input.required<string>();
  readonly skillId = input.required<string>();

  private readonly api = inject(PracticeApi);
  private readonly catalog = inject(SkillCatalog);
  private readonly injector = inject(Injector);
  private readonly feedbackHeading = viewChild<ElementRef<HTMLElement>>('feedbackHeading');

  protected readonly location = asyncResource(
    () => ({ technologyId: this.technologyId(), skillId: this.skillId() }),
    ({ technologyId, skillId }) => this.catalog.locate(technologyId, skillId),
  );

  protected readonly phase = signal<Phase>({ kind: 'loading' });
  protected readonly draft = signal<AnswerPayload | null>(null);
  protected readonly hints = signal<readonly string[]>([]);
  protected readonly busy = signal<'submit' | 'hint' | null>(null);
  /**
   * A failed hint/answer request. The question stays on screen; `stale` means
   * it can no longer be answered (expired or changed) and must be replaced.
   */
  protected readonly actionError = signal<{
    readonly message: string;
    readonly stale: boolean;
  } | null>(null);
  protected readonly sqlRun = signal<SqlRunState>({ status: 'idle' });
  protected readonly session = signal<SessionTally>({
    answered: 0,
    correct: 0,
    xp: 0,
    startScore: undefined,
  });

  protected readonly served = computed(() => {
    const phase = this.phase();
    return phase.kind === 'answering' || phase.kind === 'feedback' ? phase.served : undefined;
  });
  protected readonly feedback = computed(() => {
    const phase = this.phase();
    return phase.kind === 'feedback' ? phase.response : undefined;
  });
  /**
   * The correct answer once graded, else `undefined`. Computed here rather
   * than with `?.` in the template, which yields `null` in Angular templates.
   */
  protected readonly revealed = computed(() => this.feedback()?.correctAnswer);

  protected readonly resultDisplay = computed(() => {
    const feedback = this.feedback();
    return feedback ? RESULT_DISPLAY[feedback.result] : undefined;
  });
  /** Score shown in the sidebar: the latest the server returned. */
  protected readonly score = computed(
    () => this.feedback()?.scoreAfter ?? this.served()?.skill.score ?? 0,
  );
  protected readonly hintsLeft = computed(
    () => (this.served()?.question.hintCount ?? 0) - this.hints().length,
  );
  protected readonly breadcrumbs = computed(() => {
    const state = this.location.state();
    const loc = state.status === 'ready' ? state.value : undefined;
    return [
      { label: 'Skill Mastery', link: '/skills' },
      { label: loc?.technology.name ?? '…', link: ['/skills', this.technologyId()] },
      { label: loc?.skill.name ?? '…', link: ['/skills', this.technologyId(), this.skillId()] },
      { label: 'Practice' },
    ];
  });

  constructor() {
    // Start (or restart) practice whenever the skill in the URL changes.
    effect(() => {
      this.skillId();
      untracked(() => {
        this.session.set({ answered: 0, correct: 0, xp: 0, startScore: undefined });
        void this.loadNext();
      });
    });
  }

  protected async loadNext(): Promise<void> {
    this.phase.set({ kind: 'loading' });
    this.draft.set(null);
    this.hints.set([]);
    this.actionError.set(null);
    this.sqlRun.set({ status: 'idle' });
    try {
      const served = await this.api.next(this.skillId());
      this.hints.set(served.hintsRevealed);
      this.session.update((s) => ({ ...s, startScore: s.startScore ?? served.skill.score }));
      this.phase.set({ kind: 'answering', served });
    } catch (err) {
      this.phase.set({ kind: 'error', message: errorMessage(err) });
    }
  }

  protected async submit(): Promise<void> {
    const served = this.served();
    const answer = this.draft();
    if (!served || !answer || this.busy() || this.feedback()) return;

    this.busy.set('submit');
    this.actionError.set(null);
    try {
      const response = await this.api.answer({ token: served.token, answer });
      this.phase.set({ kind: 'feedback', served, response });
      this.session.update((s) => ({
        ...s,
        answered: s.answered + 1,
        correct: s.correct + (response.result === 'correct' ? 1 : 0),
        xp: s.xp + response.xpAwarded,
      }));
      afterNextRender(() => this.feedbackHeading()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } catch (err) {
      this.actionError.set(this.actionMessage(err));
    } finally {
      this.busy.set(null);
    }
  }

  protected async requestHint(): Promise<void> {
    const served = this.served();
    if (!served || this.busy() || this.hintsLeft() <= 0) return;
    this.busy.set('hint');
    this.actionError.set(null);
    try {
      const { hint } = await this.api.hint(served.token);
      this.hints.update((h) => [...h, hint]);
    } catch (err) {
      this.actionError.set(this.actionMessage(err));
    } finally {
      this.busy.set(null);
    }
  }

  /** "Run query" for SQL questions: sample data only, never graded. */
  protected async runSql(query: string): Promise<void> {
    const served = this.served();
    if (!served || this.sqlRun().status === 'running') return;
    this.sqlRun.set({ status: 'running' });
    try {
      const response = await this.api.runSql(served.token, query);
      this.sqlRun.set({ status: 'done', response });
    } catch (err) {
      this.sqlRun.set({ status: 'done', response: { kind: 'error', message: errorMessage(err) } });
    }
  }

  /**
   * Ctrl/Cmd+Enter submits from anywhere in the question, except inside a
   * code editor, where it runs the code instead.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.target as HTMLElement | null)?.closest('.monaco-editor')) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.submit();
    }
  }

  private actionMessage(err: unknown): { message: string; stale: boolean } {
    const stale =
      err instanceof ApiClientError && (err.code === 'token-expired' || err.code === 'conflict');
    return { message: errorMessage(err), stale };
  }
}
