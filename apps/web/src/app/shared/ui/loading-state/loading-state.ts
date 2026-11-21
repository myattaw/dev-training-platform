import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StatusIndicator } from '../status-indicator/status-indicator';

/** Inline "Loading …" message, announced politely to screen readers. */
@Component({
  selector: 'app-loading-state',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
  template: `<app-status-indicator type="in-progress">{{ label() }}</app-status-indicator>`,
  styles: `
    :host {
      display: block;
      padding: var(--space-4);
      color: var(--color-text-secondary);
    }
  `,
})
export class LoadingState {
  readonly label = input('Loading…');
}
