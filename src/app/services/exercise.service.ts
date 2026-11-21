import { Injectable } from '@angular/core';
import { EXERCISES } from '../data/exercises';
import type { Exercise } from '../models/exercise';

export interface ExerciseNeighbors {
  readonly previous: Exercise | undefined;
  readonly next: Exercise | undefined;
}

/**
 * Read-only access to the exercise catalog.
 *
 * Today the data is bundled with the app. Because every component goes through
 * this service, we can later load exercises from S3/an API without touching them.
 */
@Injectable({ providedIn: 'root' })
export class ExerciseService {
  readonly all: readonly Exercise[] = EXERCISES;
  readonly featured: readonly Exercise[] = EXERCISES.filter((e) => e.featured);

  getById(id: string): Exercise | undefined {
    return this.all.find((e) => e.id === id);
  }

  neighborsOf(id: string): ExerciseNeighbors {
    const index = this.all.findIndex((e) => e.id === id);
    return {
      previous: index > 0 ? this.all[index - 1] : undefined,
      next: index >= 0 && index < this.all.length - 1 ? this.all[index + 1] : undefined,
    };
  }
}
