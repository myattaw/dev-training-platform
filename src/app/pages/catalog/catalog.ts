import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ExerciseCard } from '../../components/exercise-card/exercise-card';
import { DIFFICULTIES, type Difficulty } from '../../models/exercise';
import { ExerciseService } from '../../services/exercise.service';

type DifficultyFilter = Difficulty | 'All';

@Component({
  selector: 'app-catalog',
  imports: [ExerciseCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog.html',
  styleUrl: './catalog.css',
})
export class Catalog {
  private readonly exercises = inject(ExerciseService).all;

  protected readonly filters: readonly DifficultyFilter[] = ['All', ...DIFFICULTIES];
  protected readonly query = signal('');
  protected readonly difficulty = signal<DifficultyFilter>('All');

  /** Recomputed automatically whenever `query` or `difficulty` changes. */
  protected readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    const difficulty = this.difficulty();
    return this.exercises.filter(
      (e) =>
        (difficulty === 'All' || e.difficulty === difficulty) &&
        (q === '' ||
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.topics.some((t) => t.includes(q))),
    );
  });

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.difficulty.set('All');
  }
}
