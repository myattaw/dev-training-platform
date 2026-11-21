import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  model,
  output,
} from '@angular/core';
import type {
  AnswerPayload,
  RevealedAnswer,
  RunSqlResponse,
  SqlResultTable as ResultTable,
} from '@pracstack/api-contracts';
import type { SqlQueryQuestion } from '@pracstack/content-model';
import { CodeEditor } from '../../../../../shared/editor/code-editor';
import { Alert } from '../../../../../shared/ui/alert/alert';
import { Icon } from '../../../../../shared/ui/icon/icon';
import { SqlResultTable } from '../../../ui/sql-result-table';

export type SqlRunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly response: RunSqlResponse };

/**
 * A SQL question: schema and sample data, an editor, and "Run query" to try
 * queries on the sample data before submitting. Running is never graded.
 */
@Component({
  selector: 'app-sql-query',
  imports: [CodeEditor, Alert, Icon, SqlResultTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sql-query.html',
  styleUrl: './sql-query.css',
})
export class SqlQuery {
  readonly question = input.required<SqlQueryQuestion>();
  readonly answer = model<AnswerPayload | null>(null);
  readonly revealed = input<RevealedAnswer>();
  readonly runState = input<SqlRunState>({ status: 'idle' });
  /** Emitted with the query text when the learner runs it. */
  readonly run = output<string>();

  /** The editor text. Resets when the question changes. */
  protected readonly query = linkedSignal(() => {
    this.question();
    const a = this.answer();
    return a?.format === 'sql-query' ? a.query : '';
  });

  protected readonly sampleTables = computed<readonly { name: string; table: ResultTable }[]>(() =>
    this.question().sampleTables.map((t) => ({
      name: t.table,
      table: {
        columns: t.columns.map((c) => ({ name: c, type: '' })),
        rows: t.rows,
        truncated: false,
      },
    })),
  );

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
