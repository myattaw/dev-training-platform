import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon, type IconName } from '../icon/icon';

export type StatusType = 'success' | 'error' | 'warning' | 'info' | 'in-progress' | 'neutral';

const ICON_BY_TYPE: Record<StatusType, IconName> = {
  success: 'check-circle',
  error: 'error-circle',
  warning: 'warning',
  info: 'info',
  'in-progress': 'in-progress',
  neutral: 'not-started',
};

/** Icon + text status, e.g. "✓ Passed". Color is never the only signal: the text carries meaning. */
@Component({
  selector: 'app-status-indicator',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"status status--" + type()' },
  template: `<app-icon [name]="icon()" /><span class="label"><ng-content /></span>`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    :host(.status--success) {
      color: var(--color-success);
    }
    :host(.status--error) {
      color: var(--color-error);
    }
    :host(.status--warning) {
      color: var(--color-warning);
    }
    :host(.status--info),
    :host(.status--in-progress) {
      color: var(--color-info);
    }
    :host(.status--neutral) {
      color: var(--color-text-secondary);
    }
  `,
})
export class StatusIndicator {
  readonly type = input.required<StatusType>();
  protected readonly icon = computed(() => ICON_BY_TYPE[this.type()]);
}
