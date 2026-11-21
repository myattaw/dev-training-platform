import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SqlResultTable as ResultTable } from '@pracstack/api-contracts';

/** A query result (or sample table) as a compact data grid. NULL is shown distinctly. */
@Component({
  selector: 'app-sql-result-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scroll" tabindex="0" [attr.aria-label]="caption()">
      <table>
        <caption class="sr-only">
          {{
            caption()
          }}
        </caption>
        <thead>
          <tr>
            @for (column of table().columns; track $index) {
              <th scope="col">
                {{ column.name }}
                @if (showTypes()) {
                  <span class="type">{{ column.type }}</span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of table().rows; track $index) {
            <tr>
              @for (value of row; track $index) {
                @if (value === null) {
                  <td class="null">NULL</td>
                } @else {
                  <td [class.number]="isNumeric(value)">{{ value }}</td>
                }
              }
            </tr>
          } @empty {
            <tr>
              <td class="empty" [attr.colspan]="table().columns.length || 1">No rows</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <p class="meta text-secondary">
      {{ table().rows.length }} {{ table().rows.length === 1 ? 'row' : 'rows' }}
      @if (table().truncated) {
        · only the first {{ table().rows.length }} are shown
      }
    </p>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .scroll {
      max-height: 320px;
      overflow: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
    }
    .scroll:focus-visible {
      outline-offset: 1px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
    }
    th {
      position: sticky;
      top: 0;
      padding: 4px var(--space-3);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface-muted);
      font-weight: var(--font-weight-bold);
      text-align: left;
      white-space: nowrap;
    }
    .type {
      margin-left: 4px;
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-normal);
    }
    td {
      padding: 3px var(--space-3);
      border-bottom: 1px solid var(--color-border-divider);
      white-space: nowrap;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .null,
    .empty {
      color: var(--color-text-secondary);
      font-style: italic;
    }
    .meta {
      margin-top: var(--space-1);
      font-size: var(--font-size-xs);
    }
  `,
})
export class SqlResultTable {
  readonly table = input.required<ResultTable>();
  readonly caption = input('Query result');
  readonly showTypes = input(false);

  protected isNumeric(value: string | number | boolean): boolean {
    return (
      typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))
    );
  }
}
