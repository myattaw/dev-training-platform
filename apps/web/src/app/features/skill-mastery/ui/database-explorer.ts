import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { SqlTable } from '@pracstack/content-model';
import { Tabs, type TabItem } from '../../../shared/ui/tabs/tabs';
import { outlineSchema } from './schema-outline';
import type { SqlResultTable as ResultTable } from '@pracstack/api-contracts';
import { SqlResultTable } from './sql-result-table';

type ExplorerTab = 'schema' | 'data';

/**
 * Compact database explorer for SQL practice: tables with their columns,
 * types and keys (collapsed by default), and sample rows one table at a time.
 * Inspired by database IDEs, so the editor can stay in view while exploring.
 */
@Component({
  selector: 'app-database-explorer',
  imports: [Tabs, SqlResultTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-tabs
      label="Database"
      idPrefix="db"
      [tabs]="tabs()"
      [selected]="tab()"
      (selectedChange)="selectTab($event)"
    />
    <div
      class="body"
      role="tabpanel"
      [id]="'db-panel-' + tab()"
      [attr.aria-labelledby]="'db-tab-' + tab()"
      tabindex="0"
    >
      @if (tab() === 'schema') {
        <ul class="tables">
          @for (t of tables(); track t.name) {
            <li>
              <button
                type="button"
                class="table-toggle"
                [attr.aria-expanded]="expanded().has(t.name)"
                (click)="toggle(t.name)"
              >
                <span class="caret" aria-hidden="true">{{
                  expanded().has(t.name) ? '▾' : '▸'
                }}</span>
                <code class="table-name">{{ t.name }}</code>
                <span class="meta text-secondary"
                  >{{ t.columns.length }} columns · {{ rowsOf(t.name) }} sample rows</span
                >
              </button>
              @if (expanded().has(t.name)) {
                <table class="columns">
                  <caption class="sr-only">
                    Columns of
                    {{
                      t.name
                    }}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Column</th>
                      <th scope="col">Type</th>
                      <th scope="col">Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of t.columns; track c.name) {
                      <tr>
                        <td>
                          <code>{{ c.name }}</code>
                        </td>
                        <td class="type">
                          {{ c.type }}{{ c.notNull && !c.primaryKey ? ' not null' : '' }}
                        </td>
                        <td class="key">
                          @if (c.primaryKey) {
                            <span class="badge pk" title="Primary key">PK</span>
                          }
                          @if (c.references; as ref) {
                            <span class="badge fk" [title]="'References ' + ref"
                              >FK → {{ ref }}</span
                            >
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <button type="button" class="btn btn--sm view-data" (click)="showData(t.name)">
                  View sample rows
                </button>
              }
            </li>
          }
        </ul>
        <details class="ddl">
          <summary>CREATE statements</summary>
          <pre><code>{{ schema() }}</code></pre>
        </details>
      } @else {
        <div class="data-picker" role="group" aria-label="Table">
          @for (t of sampleTables(); track t.table) {
            <button
              type="button"
              class="btn btn--sm"
              [class.btn--selected]="t.table === dataTable()"
              [attr.aria-pressed]="t.table === dataTable()"
              (click)="dataTable.set(t.table)"
            >
              {{ t.table }}
            </button>
          }
        </div>
        @if (selectedSample(); as sample) {
          <app-sql-result-table [table]="sample" [caption]="'Sample rows of ' + dataTable()" />
        }
      }
      <p class="note text-secondary">
        Answers are also checked against other data with the same tables: don't rely on specific
        sample values.
      </p>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: var(--space-2) var(--space-3) var(--space-3);
    }
    .tables {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tables > li + li {
      border-top: 1px solid var(--color-border-divider);
    }
    .table-toggle {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-2) var(--space-1);
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .table-toggle:hover {
      background: var(--color-surface-hover);
    }
    .caret {
      width: 12px;
      color: var(--color-text-secondary);
    }
    .table-name {
      font-weight: var(--font-weight-bold);
    }
    .meta {
      margin-left: auto;
      font-size: var(--font-size-xs);
    }
    .columns {
      width: 100%;
      margin: 0 0 var(--space-2);
      border-collapse: collapse;
      font-size: var(--font-size-sm);
    }
    .columns th {
      padding: 2px var(--space-2);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      text-align: left;
    }
    .columns td {
      padding: 2px var(--space-2);
      border-top: 1px solid var(--color-border-divider);
      vertical-align: top;
    }
    .type {
      color: var(--color-text-secondary);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .badge {
      display: inline-block;
      margin-right: var(--space-1);
      padding: 0 4px;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      white-space: nowrap;
    }
    .pk {
      background: var(--color-warning-bg);
      color: var(--color-warning);
    }
    .fk {
      background: var(--color-info-bg);
      color: var(--color-info);
    }
    .view-data {
      margin-bottom: var(--space-2);
    }
    .ddl {
      margin-top: var(--space-3);
      font-size: var(--font-size-sm);
    }
    .ddl summary {
      cursor: pointer;
      color: var(--color-text-secondary);
    }
    .ddl pre {
      margin: var(--space-2) 0 0;
      padding: var(--space-2);
      overflow-x: auto;
      border: 1px solid var(--color-border-divider);
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
      font-size: var(--font-size-xs);
    }
    .data-picker {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      margin-bottom: var(--space-2);
    }
    .btn--selected {
      border-color: var(--color-primary);
      background: var(--color-primary-subtle);
      color: var(--color-primary);
    }
    .note {
      margin: var(--space-3) 0 0;
      font-size: var(--font-size-xs);
    }
  `,
})
export class DatabaseExplorer {
  readonly schema = input.required<string>();
  readonly sampleTables = input.required<readonly SqlTable[]>();

  protected readonly tables = computed(() => outlineSchema(this.schema()));
  protected readonly tab = signal<ExplorerTab>('schema');
  protected readonly tabs = computed<readonly TabItem[]>(() => [
    { id: 'schema', label: 'Schema', count: this.tables().length },
    { id: 'data', label: 'Sample data' },
  ]);
  /** Expanded tables; the first one starts open so the shape is visible at a glance. */
  protected readonly expanded = linkedSignal<ReadonlySet<string>>(
    () =>
      new Set(
        this.tables()
          .slice(0, 1)
          .map((t) => t.name),
      ),
  );
  protected readonly dataTable = linkedSignal(() => this.sampleTables()[0]?.table ?? '');

  protected readonly selectedSample = computed<ResultTable | undefined>(() => {
    const t = this.sampleTables().find((s) => s.table === this.dataTable());
    if (!t) return undefined;
    const types = new Map(
      (this.tables().find((x) => x.name === t.table)?.columns ?? []).map((c) => [c.name, c.type]),
    );
    return {
      columns: t.columns.map((c) => ({ name: c, type: types.get(c) ?? '' })),
      rows: t.rows,
      truncated: false,
    };
  });

  protected selectTab(id: string): void {
    this.tab.set(id as ExplorerTab);
  }

  protected toggle(name: string): void {
    const next = new Set(this.expanded());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.expanded.set(next);
  }

  protected showData(name: string): void {
    this.dataTable.set(name);
    this.tab.set('data');
  }

  protected rowsOf(name: string): number {
    return this.sampleTables().find((t) => t.table === name)?.rows.length ?? 0;
  }
}
