import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Centered "nothing here" message. Project an optional action button as content. */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="heading">{{ heading() }}</p>
    @if (message()) {
      <p class="message">{{ message() }}</p>
    }
    <div class="action"><ng-content /></div>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-6) var(--space-4);
      text-align: center;
    }
    .heading {
      font-weight: var(--font-weight-bold);
    }
    .message {
      margin-top: var(--space-1);
      color: var(--color-text-secondary);
    }
    .action {
      margin-top: var(--space-3);
    }
    .action:empty {
      display: none;
    }
  `,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly message = input<string>();
}
