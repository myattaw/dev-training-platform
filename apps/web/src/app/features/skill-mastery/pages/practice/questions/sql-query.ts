import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { AnswerPayload, RevealedAnswer, RunSqlResponse } from '@pracstack/api-contracts';
import { SQL_DIALECT_LABELS, type SqlQueryQuestion } from '@pracstack/content-model';
import { mediaQuery } from '../../../../../core/browser/media-query';
import { CodeEditor } from '../../../../../shared/editor/code-editor';
import { SplitPane } from '../../../../../shared/ui/split-pane/split-pane';
import { type TabItem, Tabs } from '../../../../../shared/ui/tabs/tabs';
import { DatabaseExplorer } from '../../../ui/database-explorer';
import { Alert } from '../../../../../shared/ui/alert/alert';
import { Icon } from '../../../../../shared/ui/icon/icon';
import { SqlResultTable } from '../../../ui/sql-result-table';

type OutputTab = 'results' | 'feedback';
type MobileTab = 'question' | 'database' | 'editor' | 'output';

export type SqlRunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly response: RunSqlResponse };

/**
 * A SQL question as an IDE-style workspace: the prompt (projected as
 * `[prompt]`) next to a database explorer, a large editor with "Run query"
 * (sample data only, never graded), the submit buttons (`[actions]`), and a
 * Results / Feedback panel (`[feedback]`). Narrow screens get one tab per area.
 */
@Component({
  selector: 'app-sql-query',
  imports: [
    NgTemplateOutlet,
    CodeEditor,
    Alert,
    Icon,
    SqlResultTable,
    DatabaseExplorer,
    SplitPane,
    Tabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sql-query.html',
  styleUrl: './sql-query.css',
})
export class SqlQuery {
  readonly question = input.required<SqlQueryQuestion>();
  protected readonly dialectLabel = computed(() => SQL_DIALECT_LABELS[this.question().dialect]);
  readonly answer = model<AnswerPayload | null>(null);
  readonly revealed = input<RevealedAnswer>();
  readonly runState = input<SqlRunState>({ status: 'idle' });
  /** Emitted with the query text when the learner runs it. */
  readonly run = output<string>();
  /** The answer has been graded: show the Feedback tab. */
  readonly hasFeedback = input(false);

  protected readonly isNarrow = mediaQuery('(max-width: 899px)');
  protected readonly outputTab = signal<OutputTab>('results');
  protected readonly outputTabs = computed<readonly TabItem[]>(() => [
    { id: 'results', label: 'Results' },
    { id: 'feedback', label: 'Feedback' },
  ]);
  protected readonly mobileTab = signal<MobileTab>('question');
  protected readonly mobileTabs: readonly TabItem[] = [
    { id: 'question', label: 'Question' },
    { id: 'database', label: 'Database' },
    { id: 'editor', label: 'Editor' },
    { id: 'output', label: 'Output' },
  ];

  constructor() {
    // Show what just happened: results after a run, feedback after submitting.
    effect(() => {
      const done = this.runState().status === 'done';
      untracked(() => {
        if (!done) return;
        this.outputTab.set('results');
        if (this.isNarrow()) this.mobileTab.set('output');
      });
    });
    effect(() => {
      const graded = this.hasFeedback();
      untracked(() => {
        this.outputTab.set(graded ? 'feedback' : 'results');
        if (graded && this.isNarrow()) this.mobileTab.set('output');
      });
    });
    // A new question starts on the question tab.
    effect(() => {
      this.question();
      untracked(() => this.mobileTab.set('question'));
    });
  }

  protected selectOutput(id: string): void {
    this.outputTab.set(id as OutputTab);
  }

  protected selectMobile(id: string): void {
    this.mobileTab.set(id as MobileTab);
  }

  /** The editor text. Resets when the question changes. */
  protected readonly query = linkedSignal(() => {
    this.question();
    const a = this.answer();
    return a?.format === 'sql-query' ? a.query : '';
  });

  protected readonly reference = computed(() => {
    const r = this.revealed();
    return r?.format === 'sql-query' ? r.referenceQuery : undefined;
  });

  protected onQueryChange(query: string): void {
    this.query.set(query);
    this.answer.set(query.trim() === '' ? null : { format: 'sql-query', query });
  }

  protected runQuery(): void {
    if (this.query().trim() !== '' && this.runState().status !== 'running')
      this.run.emit(this.query());
  }
}
