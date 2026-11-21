import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Difficulty } from '../../models/exercise';

@Component({
  selector: 'app-difficulty-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ difficulty() }}`,
  host: { '[class]': 'difficulty().toLowerCase()' },
  styles: `
    :host {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      border: 1px solid currentColor;
    }
    :host(.easy) { color: var(--success); background: var(--success-bg); }
    :host(.medium) { color: var(--warning); background: var(--warning-bg); }
    :host(.hard) { color: var(--danger); background: var(--danger-bg); }
  `,
})
export class DifficultyBadge {
  readonly difficulty = input.required<Difficulty>();
}
