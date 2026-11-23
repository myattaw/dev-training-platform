import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ActivityView, TermPathStep } from '../data-access/role-content';
import type { ActivityStatus } from '../data-access/role-progress';
import { ActivityList } from './activity-list';

/** A suggested preparation path: one numbered step per technology, with its practice in order. */
@Component({
  selector: 'app-term-path',
  imports: [ActivityList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="steps" [attr.aria-label]="label()">
      @for (step of steps(); track step.termId; let i = $index) {
        <li class="step">
          <h3 class="step-name">
            <span class="number">{{ i + 1 }}</span>{{ step.label }}
          </h3>
          <app-activity-list [activities]="step.activities" [statusOf]="statusOf()" />
        </li>
      }
    </ol>
  `,
  styles: `
    .steps {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .step {
      padding: var(--space-3) 0;
      border-top: 1px solid var(--color-border-divider);
    }
    .step:first-child {
      border-top: none;
      padding-top: 0;
    }
    .step-name {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-base);
    }
    .number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--color-primary-subtle);
      color: var(--color-primary);
      font-size: var(--font-size-xs);
    }
  `,
})
export class TermPath {
  readonly steps = input.required<readonly TermPathStep[]>();
  readonly label = input('Suggested preparation path');
  readonly statusOf = input<(a: ActivityView) => ActivityStatus>(() => 'unknown');
}
