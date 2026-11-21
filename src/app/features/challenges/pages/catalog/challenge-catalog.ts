import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../../shared/ui/icon/icon';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { ChallengeCatalogService } from '../../data-access/challenge-catalog.service';
import { ChallengeProgressService } from '../../data-access/challenge-progress.service';
import {
  CATEGORY_LABELS,
  type ChallengeCategory,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  LANGUAGE_LABELS,
  supportedLanguages,
} from '../../models/challenge';
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
  imports: [RouterLink, PageHeader, Panel, EmptyState, Icon, ChallengeStatus, DifficultyBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './challenge-catalog.html',
  styleUrl: './challenge-catalog.css',
})
export class ChallengeCatalog {
  /** Query params, bound by `withComponentInputBinding()`. */
  readonly q = input<string>();
  readonly difficulty = input<string>();
  readonly category = input<string>();

  private readonly catalog = inject(ChallengeCatalogService);
  private readonly progress = inject(ChallengeProgressService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly difficulties = DIFFICULTIES;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly categories = this.catalog.categories;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly total = this.catalog.all.length;

  protected readonly query = computed(() => this.q() ?? '');
  protected readonly difficultyFilter = computed(() =>
    parseOption<Difficulty>(this.difficulty(), DIFFICULTIES),
  );
  protected readonly categoryFilter = computed(() =>
    parseOption<ChallengeCategory>(this.category(), this.categories),
  );
  protected readonly hasFilters = computed(
    () => this.query() !== '' || this.difficultyFilter() !== null || this.categoryFilter() !== null,
  );

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const difficulty = this.difficultyFilter();
    const category = this.categoryFilter();
    const records = this.progress.records();

    return this.catalog.all
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
        languages: supportedLanguages(challenge)
          .map((id) => LANGUAGE_LABELS[id])
          .join(', '),
        status: records.get(challenge.id)?.status ?? 'not-started',
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
