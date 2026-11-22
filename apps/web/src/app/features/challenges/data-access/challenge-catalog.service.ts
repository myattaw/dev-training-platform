import { computed, inject, Injectable, PendingTasks, signal } from '@angular/core';
import {
  CATEGORY_LABELS,
  type Challenge,
  type ChallengeCategory,
  type ChallengeSummary,
  type PlannedChallenge,
} from '@pracstack/content-model';
import { ContentRepository } from '../../../core/content/content-repository';
import { type AsyncState, errorMessage } from '../../../shared/async/async-state';

/**
 * Read-only access to coding challenges.
 *
 * The catalog (summaries from the content manifest) loads once per session
 * and is shared by every page. Full challenges load on demand.
 */
@Injectable({ providedIn: 'root' })
export class ChallengeCatalogService {
  private readonly repository = inject(ContentRepository);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly state = signal<AsyncState<readonly ChallengeSummary[]>>({ status: 'loading' });

  private readonly plannedState = signal<readonly PlannedChallenge[]>([]);
  /** Announced challenges (Coming soon): metadata only, nothing to open or run. */
  readonly planned = this.plannedState.asReadonly();

  /** Catalog summaries, loaded when the service is first used. */
  readonly summaries = this.state.asReadonly();

  /** Categories that have at least one challenge, in label order. */
  readonly categories = computed<readonly ChallengeCategory[]>(() => {
    const state = this.summaries();
    if (state.status !== 'ready') return [];
    return (Object.keys(CATEGORY_LABELS) as ChallengeCategory[]).filter((category) =>
      state.value.some((c) => c.category === category),
    );
  });

  constructor() {
    this.reload();
  }

  /** Re-fetches the catalog, e.g. after a network error. */
  reload(): void {
    this.state.set({ status: 'loading' });
    const done = this.pendingTasks.add();
    this.repository
      .manifest()
      .then(
        (manifest) => {
          this.plannedState.set(manifest.plannedChallenges ?? []);
          this.state.set({ status: 'ready', value: manifest.challenges });
        },
        (err: unknown) => this.state.set({ status: 'error', error: errorMessage(err) }),
      )
      .finally(done);
  }

  async getSummary(id: string): Promise<ChallengeSummary | undefined> {
    const manifest = await this.repository.manifest();
    return manifest.challenges.find((c) => c.id === id);
  }

  async getPlanned(id: string): Promise<PlannedChallenge | undefined> {
    const manifest = await this.repository.manifest();
    return manifest.plannedChallenges?.find((c) => c.id === id);
  }

  /** Resolves to `undefined` when no challenge has this id. */
  async getChallenge(id: string): Promise<Challenge | undefined> {
    const summary = await this.getSummary(id);
    return summary ? this.repository.challenge(summary.id, summary.version) : undefined;
  }
}
