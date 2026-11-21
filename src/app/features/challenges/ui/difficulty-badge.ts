import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Badge, type BadgeColor } from '../../../shared/ui/badge/badge';
import { type Difficulty, DIFFICULTY_LABELS } from '../models/challenge';

const COLORS: Readonly<Record<Difficulty, BadgeColor>> = {
  easy: 'green',
  medium: 'amber',
  hard: 'red',
};

@Component({
  selector: 'app-difficulty-badge',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-badge [color]="color()">{{ label() }}</app-badge>`,
})
export class DifficultyBadge {
  readonly difficulty = input.required<Difficulty>();
  protected readonly color = computed(() => COLORS[this.difficulty()]);
  protected readonly label = computed(() => DIFFICULTY_LABELS[this.difficulty()]);
}
