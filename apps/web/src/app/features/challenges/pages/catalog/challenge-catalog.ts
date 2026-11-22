import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Badge } from '../../../../shared/ui/badge/badge';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { Icon } from '../../../../shared/ui/icon/icon';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { ChallengeCatalogService } from '../../data-access/challenge-catalog.service';
import { ChallengeProgressService } from '../../data-access/challenge-progress.service';
import { ChallengeSubmissions } from '../../data-access/challenge-submissions';
import {
  CATEGORY_LABELS,
  type ChallengeCategory,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  LANGUAGE_LABELS,
} from '@pracstack/content-model';
import { ChallengeStatus } from '../../ui/challenge-status';
import { DifficultyBadge } from '../../ui/difficulty-badge';

type FilterKey = 'q' | 'difficulty' | 'category';

/**
 * Filterable table of challenges. Filters live in the URL query string
 * (`?q=&difficulty=&category=`), bound to inputs by the router, so filtered
 * views can be bookmarked and survive reloads.
 */
@Component({
  selector: 'app-challenge-catalog',
  imports: [
    RouterLink,
    PageHeader,
    Panel,
    EmptyState,
    Alert,
    LoadingState,
    Icon,
    ChallengeStatus,
    DifficultyBadge,
    Badge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './challenge-catalog.html',
  styleUrl: './challenge-catalog.css',
})
export class ChallengeCatalog {
  /** Query params, bound by `withComponentInputBinding()`. */
  readonly q = input<string>();
  readonly difficulty = input<string>();
  readonly category = input<string>();

  protected readonly catalog = inject(ChallengeCatalogService);
  private readonly progress = inject(ChallengeProgressService);
  private readonly submissions = inject(ChallengeSubmissions);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly difficulties = DIFFICULTIES;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly categories = this.catalog.categories;
  protected readonly categoryLabels = CATEGORY_LABELS;
  private readonly allCategories = Object.keys(CATEGORY_LABELS) as ChallengeCategory[];

  protected readonly total = computed(() => {
    const state = this.catalog.summaries();
    return state.status === 'ready' ? state.value.length : undefined;
  });

  protected readonly query = computed(() => this.q() ?? '');
  protected readonly difficultyFilter = computed(() =>
    parseOption<Difficulty>(this.difficulty(), DIFFICULTIES),
  );
  protected readonly categoryFilter = computed(() =>
    parseOption<ChallengeCategory>(this.category(), this.allCategories),
  );
  protected readonly hasFilters = computed(
    () => this.query() !== '' || this.difficultyFilter() !== null || this.categoryFilter() !== null,
  );

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const difficulty = this.difficultyFilter();
    const category = this.categoryFilter();
    const state = this.catalog.summaries();
    if (state.status !== 'ready') return [];

    return state.value
      .filter(
        (c) =>
          (difficulty === null || c.difficulty === difficulty) &&
          (category === null || c.category === category) &&
          (q === '' ||
            c.title.toLowerCase().includes(q) ||
            c.summary.toLowerCase().includes(q) ||
            c.tags.some((t) => t.includes(q))),
      )
      .map((challenge) => ({
        challenge,
        categoryLabel: CATEGORY_LABELS[challenge.category],
        languages: challenge.languages.map((id) => LANGUAGE_LABELS[id]).join(', '),
        status: this.submissions.progress().get(challenge.id)?.solved
          ? ('solved' as const)
          : this.progress.record(challenge.id).status,
      }));
  });

  protected setFilter(key: FilterKey, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value === '' ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}

function parseOption<T extends string>(value: string | undefined, options: readonly T[]): T | null {
  return options.includes(value as T) ? (value as T) : null;
}
