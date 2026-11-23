import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type Breadcrumb, Breadcrumbs } from '../breadcrumbs/breadcrumbs';

/**
 * Page title row: optional breadcrumbs, an `<h1>`, a description, and
 * right-aligned actions projected with `[headerActions]`. Extra inline content
 * after the title (e.g. a badge) can be projected with `[headerBadge]`.
 */
@Component({
  selector: 'app-page-header',
  imports: [Breadcrumbs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (breadcrumbs().length > 0) {
      <app-breadcrumbs class="crumbs" [items]="breadcrumbs()" />
    }
    <div class="row">
      <div class="titles">
        <div class="title-line">
          <ng-content select="[headerIcon]" />
          <h1>
            {{ heading() }}
            @if (counter() !== undefined) {
              <span class="counter">({{ counter() }})</span>
            }
          </h1>
          <ng-content select="[headerBadge]" />
        </div>
        @if (description()) {
          <p class="description">{{ description() }}</p>
        }
      </div>
      <div class="actions"><ng-content select="[headerActions]" /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--space-5);
    }
    .crumbs {
      display: block;
      margin-bottom: var(--space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .title-line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
    }
    h1 {
      font-size: var(--font-size-xl);
    }
    .counter {
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-normal);
    }
    .description {
      margin-top: var(--space-1);
      color: var(--color-text-secondary);
      max-width: 80ch;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class PageHeader {
  readonly heading = input.required<string>();
  readonly description = input<string>();
  readonly counter = input<number>();
  readonly breadcrumbs = input<readonly Breadcrumb[]>([]);
}
