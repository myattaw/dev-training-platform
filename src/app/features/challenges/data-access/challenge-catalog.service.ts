import { Injectable } from '@angular/core';
import { CHALLENGES } from '../data';
import { type Challenge, type ChallengeCategory, CATEGORY_LABELS } from '../models/challenge';

/**
 * Read-only access to the challenge catalog.
 *
 * Today the data is bundled with the app. Every component goes through this
 * service, so the source can move to versioned content files or an API later
 * without touching them.
 */
@Injectable({ providedIn: 'root' })
export class ChallengeCatalogService {
  readonly all: readonly Challenge[] = CHALLENGES;

  /** Categories that have at least one challenge, in label order. */
  readonly categories: readonly ChallengeCategory[] = (
    Object.keys(CATEGORY_LABELS) as ChallengeCategory[]
  ).filter((category) => CHALLENGES.some((c) => c.category === category));

  getById(id: string): Challenge | undefined {
    return this.all.find((c) => c.id === id);
  }
}
