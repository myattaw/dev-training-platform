import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon, type IconName } from '../icon/icon';

export type AlertType = 'error' | 'warning' | 'info' | 'success';

const ICONS: Readonly<Record<AlertType, IconName>> = {
  error: 'error-circle',
  warning: 'warning',
  info: 'info',
  success: 'check-circle',
};

/**
 * Inline message box. Project an optional action (e.g. a "Try again" button)
 * with the `alertAction` attribute.
 */
@Component({
  selector: 'app-alert',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"alert alert--" + type()',
    '[attr.role]': 'type() === "error" ? "alert" : "status"',
  },
  template: `
    <app-icon class="icon" [name]="icon()" />
    <div class="content">
      @if (heading()) {
        <p class="heading">{{ heading() }}</p>
      }
      <div class="message"><ng-content /></div>
    </div>
    <div class="action"><ng-content select="[alertAction]" /></div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border: 1px solid currentColor;
      border-radius: var(--radius-md);
    }
    :host(.alert--error) {
      color: var(--color-error);
      background: var(--color-error-bg);
    }
    :host(.alert--warning) {
      color: var(--color-warning);
      background: var(--color-warning-bg);
    }
    :host(.alert--info) {
      color: var(--color-info);
      background: var(--color-info-bg);
    }
    :host(.alert--success) {
      color: var(--color-success);
      background: var(--color-success-bg);
    }
    .icon {
      margin-top: 2px;
    }
    .content {
      flex: 1;
      min-width: 0;
      color: var(--color-text);
    }
    .heading {
      font-weight: var(--font-weight-bold);
    }
    .action:empty {
      display: none;
    }
  `,
})
export class Alert {
  readonly type = input<AlertType>('info');
  readonly heading = input<string>();
  protected readonly icon = computed(() => ICONS[this.type()]);
}
