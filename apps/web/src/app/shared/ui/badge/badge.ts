import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeColor = 'grey' | 'blue' | 'green' | 'amber' | 'red';

/** Small rectangular label, e.g. difficulty or a tag. */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"badge--" + color()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 6px;
      border: 1px solid currentColor;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      line-height: 1;
      white-space: nowrap;
    }
    :host(.badge--grey) {
      color: var(--color-text-secondary);
      background: var(--color-surface-muted);
      border-color: var(--color-border);
    }
    :host(.badge--blue) {
      color: var(--color-info);
      background: var(--color-info-bg);
    }
    :host(.badge--green) {
      color: var(--color-success);
      background: var(--color-success-bg);
    }
    :host(.badge--amber) {
      color: var(--color-warning);
      background: var(--color-warning-bg);
    }
    :host(.badge--red) {
      color: var(--color-error);
      background: var(--color-error-bg);
    }
  `,
})
export class Badge {
  readonly color = input<BadgeColor>('grey');
}
