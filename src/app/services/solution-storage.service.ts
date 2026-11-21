import { Injectable } from '@angular/core';

const KEY_PREFIX = 'typexercise:solution:';

/** Persists a learner's in-progress code per exercise in localStorage. */
@Injectable({ providedIn: 'root' })
export class SolutionStorageService {
  load(exerciseId: string): string | null {
    try {
      return localStorage.getItem(KEY_PREFIX + exerciseId);
    } catch {
      return null; // storage disabled (e.g. private mode)
    }
  }

  save(exerciseId: string, code: string): void {
    try {
      localStorage.setItem(KEY_PREFIX + exerciseId, code);
    } catch {
      // Quota exceeded or storage disabled: losing a draft is not fatal.
    }
  }

  clear(exerciseId: string): void {
    try {
      localStorage.removeItem(KEY_PREFIX + exerciseId);
    } catch {
      /* ignore */
    }
  }
}
