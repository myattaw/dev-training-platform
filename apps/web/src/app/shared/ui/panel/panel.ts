import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The basic white content surface.
 *
 * Content slots:
 * - `[panelActions]`  buttons on the right of the header
 * - default           body
 * - `[panelFooter]`   optional footer, separated by a divider
 *
 * `flush` removes body padding (for tables that span the full width).
 */
@Component({
  selector: 'app-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.flush]': 'flush()' },
  template: `
    @if (heading()) {
      <header class="head">
        <div class="titles">
          <h2 class="title" [id]="headingId()">
            {{ heading() }}
            @if (counter() !== undefined) {
              <span class="counter">({{ counter() }})</span>
            }
          </h2>
          @if (description()) {
            <p class="description">{{ description() }}</p>
          }
        </div>
        <div class="actions"><ng-content select="[panelActions]" /></div>
      </header>
    }
    <div class="body"><ng-content /></div>
    <div class="footer"><ng-content select="[panelFooter]" /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      min-width: 0;
    }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }
    .title {
      font-size: var(--font-size-md);
    }
    .counter {
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-normal);
    }
    .description {
      margin-top: 2px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .actions {
      display: flex;
      gap: var(--space-2);
      flex: none;
    }
    .actions:empty {
      display: none;
    }
    .body {
      flex: 1;
      padding: 0 var(--space-4) var(--space-4);
      min-width: 0;
    }
    :host(.flush) .body {
      padding: 0;
    }
    :host(.flush) .head {
      border-bottom: 1px solid var(--color-border-divider);
    }
    .footer {
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--color-border-divider);
      text-align: center;
    }
    .footer:empty {
      display: none;
    }
  `,
})
export class Panel {
  readonly heading = input<string>();
  readonly headingId = input<string>();
  readonly description = input<string>();
  readonly counter = input<number>();
  readonly flush = input(false);
}
