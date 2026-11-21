import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { mediaQuery } from '../../../../core/browser/media-query';
import { NotFound } from '../../../../core/not-found/not-found';
import { InstructionBlocks } from '../../../../shared/content/instruction-blocks/instruction-blocks';
import { CodeEditor } from '../../../../shared/editor/code-editor';
import { Breadcrumbs } from '../../../../shared/ui/breadcrumbs/breadcrumbs';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../../shared/ui/icon/icon';
import { SplitPane } from '../../../../shared/ui/split-pane/split-pane';
import { type TabItem, Tabs } from '../../../../shared/ui/tabs/tabs';
import { ChallengeCatalogService } from '../../data-access/challenge-catalog.service';
import { ChallengeProgressService } from '../../data-access/challenge-progress.service';
import { describeTest } from '@pracstack/challenge-runtime';
import type { SubmissionResponse } from '@pracstack/api-contracts';
import {
  BROWSER_LANGUAGES,
  LANGUAGE_LABELS,
  type LanguageId,
  supportedLanguages,
} from '@pracstack/content-model';
import { errorMessage } from '../../../../shared/async/async-state';
import { ChallengeSubmissions } from '../../data-access/challenge-submissions';
import { SubmissionPanel } from './submission-panel/submission-panel';
import { asyncResource } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { LocalRunnerService } from '../../runner/local-runner.service';
import type { RunOutcome } from '../../runner/runner.models';
import { DifficultyBadge } from '../../ui/difficulty-badge';
import { TestResults } from './test-results/test-results';

type ProblemTab = 'description' | 'tests';
type ResultsTab = 'results' | 'console' | 'submissions';
type MobileTab = 'problem' | 'code' | 'results';

@Component({
  selector: 'app-challenge-workspace',
  imports: [
    NgTemplateOutlet,
    NotFound,
    Alert,
    LoadingState,
    InstructionBlocks,
    CodeEditor,
    Breadcrumbs,
    ConfirmDialog,
    Icon,
    SplitPane,
    Tabs,
    DifficultyBadge,
    TestResults,
    SubmissionPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './challenge-workspace.html',
  styleUrl: './challenge-workspace.css',
})
export class ChallengeWorkspace {
  /** Route param, bound by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  private readonly catalog = inject(ChallengeCatalogService);
  private readonly progress = inject(ChallengeProgressService);
  private readonly runner = inject(LocalRunnerService);
  private readonly submissions = inject(ChallengeSubmissions);
  private readonly editor = viewChild(CodeEditor);

  protected readonly isNarrow = mediaQuery('(max-width: 899px)');

  protected readonly loaded = asyncResource(
    () => this.id(),
    (id) => this.catalog.getChallenge(id),
  );
  /** The loaded challenge; `undefined` while loading, on error, or when it does not exist. */
  protected readonly challenge = computed(() => {
    const state = this.loaded.state();
    return state.status === 'ready' ? state.value : undefined;
  });
  protected readonly languages = computed(() => {
    const challenge = this.challenge();
    return challenge ? supportedLanguages(challenge) : [];
  });
  /** The selected language: last used for this challenge, else the first offered. */
  protected readonly language = linkedSignal<LanguageId | undefined>(() => {
    const challenge = this.challenge();
    const offered = this.languages();
    if (!challenge) return undefined;
    const preferred = this.progress.preferredLanguage(challenge.id);
    return preferred && offered.includes(preferred) ? preferred : offered[0];
  });
  protected readonly languageLabels = LANGUAGE_LABELS;
  /** Java runs only on the server; TypeScript runs in the browser. */
  protected readonly runsInBrowser = computed(() => {
    const lang = this.language();
    return lang !== undefined && BROWSER_LANGUAGES.includes(lang);
  });
  protected readonly fileName = computed(() =>
    this.language() === 'java' ? 'Solution.java' : 'solution.ts',
  );
  private readonly setup = computed(() => {
    const lang = this.language();
    return lang ? this.challenge()?.languages[lang] : undefined;
  });

  protected readonly breadcrumbs = computed(() => [
    { label: 'Coding Challenges', link: '/challenges' },
    { label: this.challenge()?.title ?? '', link: ['/challenges', this.id()] },
    { label: 'Workspace' },
  ]);

  /** Visible tests formatted for display in the Tests tab. */
  protected readonly visibleTests = computed(() => {
    const entryPoint = this.setup()?.entryPoint ?? '';
    return (this.challenge()?.visibleTests ?? []).map((t) => ({
      description: t.description,
      ...describeTest(t, entryPoint),
    }));
  });

  /**
   * Writable signal that resets whenever the challenge changes: navigating
   * loads that challenge's saved draft (or starter code), while typing in the
   * editor still writes to it.
   */
  protected readonly code = linkedSignal(() => {
    const challenge = this.challenge();
    const lang = this.language();
    const setup = this.setup();
    if (!challenge || !lang || !setup) return '';
    return this.progress.loadDraft(challenge.id, lang) ?? setup.starterCode;
  });

  protected readonly outcome = linkedSignal<unknown, RunOutcome | null>({
    source: () => [this.challenge(), this.language()],
    computation: () => null,
  });

  protected readonly submitting = signal(false);
  protected readonly lastSubmission = linkedSignal<unknown, SubmissionResponse | null>({
    source: this.challenge,
    computation: () => null,
  });
  protected readonly submitError = linkedSignal<unknown, string | null>({
    source: this.challenge,
    computation: () => null,
  });
  protected readonly history = asyncResource(
    () => this.id(),
    async (id) => (await this.submissions.history(id)).submissions,
  );
  protected readonly running = signal(false);

  protected readonly logText = computed(() => {
    const outcome = this.outcome();
    return outcome && 'logs' in outcome ? outcome.logs.join('\n') : '';
  });

  protected readonly problemTab = signal<ProblemTab>('description');
  protected readonly problemTabs = computed<readonly TabItem[]>(() => [
    { id: 'description', label: 'Description' },
    { id: 'tests', label: 'Visible tests', count: this.visibleTests().length },
  ]);

  protected readonly resultsTab = signal<ResultsTab>('results');
  protected readonly resultsTabs = computed<readonly TabItem[]>(() => {
    const lines = this.logText() === '' ? 0 : this.logText().split('\n').length;
    return [
      { id: 'results', label: 'Test results' },
      { id: 'console', label: 'Console', count: lines > 0 ? lines : undefined },
      { id: 'submissions', label: 'Submissions' },
    ];
  });

  protected readonly mobileTab = signal<MobileTab>('problem');
  protected readonly mobileTabs: readonly TabItem[] = [
    { id: 'problem', label: 'Problem' },
    { id: 'code', label: 'Code' },
    { id: 'results', label: 'Results' },
  ];

  /** Typed setters for the generic `app-tabs` two-way binding. */
  protected readonly selectProblemTab = (id: string): void => this.problemTab.set(id as ProblemTab);
  protected readonly selectResultsTab = (id: string): void => this.resultsTab.set(id as ResultsTab);
  protected readonly selectMobileTab = (id: string): void => this.mobileTab.set(id as MobileTab);

  /**
   * Called on every edit. Saves synchronously (rather than in an `effect()`,
   * which runs on the next change-detection tick) so that reloading or closing
   * the tab right after typing never loses the last edit.
   */
  protected updateCode(code: string): void {
    this.code.set(code);
    this.persistDraft(code);
  }

  private persistDraft(code: string): void {
    const challenge = this.challenge();
    const lang = this.language();
    const setup = this.setup();
    if (challenge && lang && setup) {
      this.progress.saveDraft(challenge.id, lang, code, setup.starterCode);
    }
  }

  protected async runTests(): Promise<void> {
    const challenge = this.challenge();
    const lang = this.language();
    const setup = this.setup();
    const editor = this.editor();
    if (!challenge || !lang || !setup || !editor || this.running()) return;

    this.running.set(true);
    this.resultsTab.set('results');
    if (this.isNarrow()) this.mobileTab.set('results');
    try {
      let outcome: RunOutcome;
      if (this.runsInBrowser()) {
        const compiled = await editor.compile();
        outcome = compiled.ok
          ? await this.runner.run(compiled.js, setup.entryPoint, challenge.visibleTests)
          : { status: 'compile-error', diagnostics: compiled.diagnostics };
      } else {
        // Languages the browser cannot run are run on the server (visible tests only).
        try {
          outcome = await this.submissions.run(challenge.id, { language: lang, code: this.code() });
        } catch (err) {
          outcome = { status: 'load-error', message: errorMessage(err), logs: [] };
        }
      }

      // Ignore stale results if the learner navigated away mid-run.
      if (this.challenge() === challenge) {
        this.outcome.set(outcome);
        this.progress.recordRun(challenge.id, lang, outcome, challenge.visibleTests.length);
      }
    } finally {
      this.running.set(false);
    }
  }

  /** Grades on the server against visible and hidden tests. */
  protected async submit(): Promise<void> {
    const challenge = this.challenge();
    const lang = this.language();
    if (!challenge || !lang || this.submitting() || this.running()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.resultsTab.set('submissions');
    if (this.isNarrow()) this.mobileTab.set('results');
    try {
      const response = await this.submissions.submit(challenge.id, {
        language: lang,
        code: this.code(),
      });
      if (this.challenge() === challenge) this.lastSubmission.set(response);
    } catch (err) {
      if (this.challenge() === challenge) this.submitError.set(errorMessage(err));
    } finally {
      this.submitting.set(false);
      this.history.reload();
    }
  }

  protected selectLanguage(event: Event): void {
    const challenge = this.challenge();
    const lang = (event.target as HTMLSelectElement).value as LanguageId;
    if (!challenge || !this.languages().includes(lang)) return;
    this.progress.setPreferredLanguage(challenge.id, lang);
    this.language.set(lang);
  }

  protected reset(): void {
    const starter = this.setup()?.starterCode;
    if (starter === undefined) return;
    this.updateCode(starter);
    this.outcome.set(null);
  }

  /** Skip the confirmation when there is nothing to lose. */
  protected requestReset(dialog: ConfirmDialog): void {
    if (this.code() === this.setup()?.starterCode) this.reset();
    else dialog.open();
  }
}
