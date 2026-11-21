import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DEFAULT_SCORING_CONFIG } from '@pracstack/scoring';

/**
 * Horizontal 0–100 meter for a mastery score, with tick marks at the
 * checkpoints (scores the learner can no longer fall below) and the start of
 * the mastery zone.
 */
@Component({
  selector: 'app-mastery-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'meter',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'score()',
    '[attr.aria-valuetext]': 'valueText()',
    '[attr.aria-label]': 'label()',
    '[class.compact]': 'compact()',
    '[class.mastered]': 'score() === 100',
  },
  template: `
    <div class="track">
      <div class="fill" [style.width.%]="score()"></div>
      @for (mark of marks; track mark) {
        <div class="mark" [style.left.%]="mark" aria-hidden="true"></div>
      }
    </div>
    @if (!compact()) {
      <span class="value">{{ score() }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 120px;
    }
    .track {
      position: relative;
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--color-border-divider);
      overflow: hidden;
    }
    :host(.compact) .track {
      height: 6px;
    }
    .fill {
      height: 100%;
      background: var(--color-primary);
      transition: width 0.3s ease-out;
    }
    :host(.mastered) .fill {
      background: var(--color-success);
    }
    .mark {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--color-surface);
    }
    .value {
      min-width: 3ch;
      font-weight: var(--font-weight-bold);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
  `,
})
export class MasteryMeter {
  readonly score = input.required<number>();
  readonly label = input('Mastery score');
  readonly compact = input(false);

  protected readonly marks = [
    ...DEFAULT_SCORING_CONFIG.checkpoints,
    DEFAULT_SCORING_CONFIG.mastery.zoneStart,
  ];
  protected readonly valueText = computed(() =>
    this.score() === 100 ? '100 out of 100, mastered' : `${this.score()} out of 100`,
  );
}
