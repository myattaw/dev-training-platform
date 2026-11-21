import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExerciseCard } from '../../components/exercise-card/exercise-card';
import { ExerciseService } from '../../services/exercise.service';

@Component({
  selector: 'app-home',
  imports: [ExerciseCard, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly featured = inject(ExerciseService).featured;
}
