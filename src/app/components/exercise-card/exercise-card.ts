import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Exercise } from '../../models/exercise';
import { DifficultyBadge } from '../difficulty-badge/difficulty-badge';

@Component({
  selector: 'app-exercise-card',
  imports: [RouterLink, DifficultyBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exercise-card.html',
  styleUrl: './exercise-card.css',
})
export class ExerciseCard {
  readonly exercise = input.required<Exercise>();
}
