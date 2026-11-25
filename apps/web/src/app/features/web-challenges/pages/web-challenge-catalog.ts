import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  WEB_CATEGORY_LABELS,
  WEB_FRAMEWORK_LABELS,
  WEB_FRAMEWORKS,
  type WebChallengeCategory,
  type WebFramework,
} from '@pracstack/content-model';
import { asyncResource } from '../../../shared/async/async-state';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';
import { DifficultyBadge } from '../../challenges/ui/difficulty-badge';
import { WebChallengesService } from '../data-access/web-challenges.service';

type Status = 'solved' | 'attempted' | 'not-started';
const STATUS_LABELS: Readonly<Record<Status, string>> = {
  solved: 'Solved',
  attempted: 'Attempted',
  'not-started': 'Not started',
};

/**
 * Web Development Challenges catalog: real application projects in a
 * framework, graded over HTTP. Filters live in the URL query string.
 */
@Component({
  selector: 'app-web-challenge-catalog',
  imports: [
    RouterLink,
    PageHeader,
    Panel,
    EmptyState,
    Alert,
    LoadingState,
    Icon,
    Badge,
    DifficultyBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      heading="Web Development Challenges"
      description="Work in real application projects: several files, a framework, HTTP endpoints. Your project is built and run in a sandbox and graded with real HTTP requests."
    />

    <app-panel
      heading="Challenges"
      headingId="web-challenges-heading"
      [counter]="total()"
      [flush]="true"
    >
      <div class="filters" role="search" aria-label="Filter web challenges">
        <label class="search">
          <span class="sr-only">Search web challenges</span>
          <app-icon name="search" class="search-icon" />
          <input
            class="input"
            type="search"
            placeholder="Find by name, summary or skill"
            [value]="query()"
            (input)="setFilter('q', $event)"
          />
        </label>
        <label>
          <span class="sr-only">Framework</span>
          <select class="select" (change)="setFilter('framework', $event)">
            <option value="" [selected]="frameworkFilter() === null">Any framework</option>
            @for (f of frameworks; track f) {
              <option [value]="f" [selected]="frameworkFilter() === f">
                {{ frameworkLabels[f] }}
              </option>
            }
          </select>
        </label>
        <label>
          <span class="sr-only">Difficulty</span>
          <select class="select" (change)="setFilter('difficulty', $event)">
            <option value="" [selected]="difficultyFilter() === null">Any difficulty</option>
            @for (d of difficulties; track d) {
              <option [value]="d" [selected]="difficultyFilter() === d">
                {{ difficultyLabels[d] }}
              </option>
            }
          </select>
        </label>
        <label>
          <span class="sr-only">Category</span>
          <select class="select" (change)="setFilter('category', $event)">
            <option value="" [selected]="categoryFilter() === null">Any category</option>
            @for (c of categories(); track c) {
              <option [value]="c" [selected]="categoryFilter() === c">
                {{ categoryLabels[c] }}
              </option>
            }
          </select>
        </label>
        <label>
          <span class="sr-only">Status</span>
          <select class="select" (change)="setFilter('status', $event)">
            <option value="" [selected]="statusFilter() === null">Any status</option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="statusFilter() === s">{{ statusLabels[s] }}</option>
            }
          </select>
        </label>
        @if (hasFilters()) {
          <button type="button" class="btn btn--link" (click)="clearFilters()">
            Clear filters
          </button>
        }
        <p class="match-count text-secondary" aria-live="polite">
          @if (total() !== undefined) {
            {{ rows().length }} {{ rows().length === 1 ? 'match' : 'matches' }}
          }
        </p>
      </div>

      @let state = catalog.state();
      @if (state.status === 'loading') {
        <app-loading-state label="Loading web challenges…" />
      } @else if (state.status === 'error') {
        <div class="state">
          <app-alert type="error" heading="Web challenges could not be loaded">
            {{ state.error }}
            <button alertAction type="button" class="btn btn--sm" (click)="catalog.reload()">
              Try again
            </button>
          </app-alert>
        </div>
      } @else if (rows().length > 0) {
        <div class="table-scroll">
          <table class="table" aria-labelledby="web-challenges-heading">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Frameworks</th>
                <th scope="col">Category</th>
                <th scope="col">Difficulty</th>
                <th scope="col">Time</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.c.id) {
                <tr>
                  <td class="name">
                    <a [routerLink]="[row.c.id]">{{ row.c.title }}</a>
                    <span class="summary text-secondary">{{ row.c.summary }}</span>
                  </td>
                  <td class="frameworks">
                    @for (f of row.c.frameworks; track f) {
                      <app-badge [color]="row.solvedIn.includes(f) ? 'green' : 'grey'">{{
                        frameworkLabels[f]
                      }}</app-badge>
                    }
                    @for (f of row.c.comingSoon; track f) {
                      <app-badge class="soon" [attr.title]="frameworkLabels[f] + ': coming soon'"
                        >{{ frameworkLabels[f] }} · soon</app-badge
                      >
                    }
                  </td>
                  <td>{{ categoryLabels[row.c.category] }}</td>
                  <td><app-difficulty-badge [difficulty]="row.c.difficulty" /></td>
                  <td class="nowrap">{{ row.c.estimatedMinutes }} min</td>
                  <td class="nowrap">
                    {{ statusLabels[row.status] }}
                    @if (row.c.access === 'pro') {
                      <app-badge color="blue">Pro</app-badge>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (total() === 0) {
        <app-empty-state
          heading="No web challenges yet"
          message="Web Development Challenges will appear here."
        />
      } @else {
        <app-empty-state
          heading="No matches"
          message="No web challenges match the current filters."
        >
          <button type="button" class="btn" (click)="clearFilters()">Clear filters</button>
        </app-empty-state>
      }
    </app-panel>
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border);
    }
    .search {
      position: relative;
      flex: 1 1 260px;
      max-width: 420px;
    }
    .search .input {
      width: 100%;
      padding-left: 30px;
    }
    .search-icon {
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-secondary);
    }
    .match-count {
      margin: 0 0 0 auto;
      font-size: var(--font-size-sm);
    }
    .state {
      padding: var(--space-4);
    }
    .table-scroll {
      overflow-x: auto;
    }
    .name a {
      font-weight: var(--font-weight-bold);
    }
    .summary {
      display: block;
      max-width: 60ch;
      font-size: var(--font-size-sm);
    }
    .frameworks {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      min-width: 180px;
    }
    .soon {
      opacity: 0.75;
    }
    .nowrap {
      white-space: nowrap;
    }
  `,
})
export class WebChallengeCatalog {
  readonly q = input<string>();
  readonly framework = input<string>();
  readonly difficulty = input<string>();
  readonly category = input<string>();
  readonly status = input<string>();

  private readonly service = inject(WebChallengesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly catalog = asyncResource(
    () => null,
    () => this.service.summaries(),
  );
  protected readonly frameworks = WEB_FRAMEWORKS;
  protected readonly frameworkLabels = WEB_FRAMEWORK_LABELS;
  protected readonly difficulties = DIFFICULTIES;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly categoryLabels = WEB_CATEGORY_LABELS;
  protected readonly statuses: readonly Status[] = ['not-started', 'attempted', 'solved'];
  protected readonly statusLabels = STATUS_LABELS;

  constructor() {
    // Progress needs the API; the catalog still works without it.
    this.service.loadProgress().catch(() => undefined);
  }

  protected readonly total = computed(() => {
    const s = this.catalog.state();
    return s.status === 'ready' ? s.value.length : undefined;
  });
  protected readonly categories = computed(() => {
    const s = this.catalog.state();
    return s.status === 'ready' ? [...new Set(s.value.map((c) => c.category))] : [];
  });

  protected readonly query = computed(() => this.q() ?? '');
  protected readonly frameworkFilter = computed(() =>
    option<WebFramework>(this.framework(), WEB_FRAMEWORKS),
  );
  protected readonly difficultyFilter = computed(() =>
    option<Difficulty>(this.difficulty(), DIFFICULTIES),
  );
  protected readonly categoryFilter = computed(() =>
    option<WebChallengeCategory>(
      this.category(),
      Object.keys(WEB_CATEGORY_LABELS) as WebChallengeCategory[],
    ),
  );
  protected readonly statusFilter = computed(() => option<Status>(this.status(), this.statuses));
  protected readonly hasFilters = computed(
    () =>
      this.query() !== '' ||
      this.frameworkFilter() !== null ||
      this.difficultyFilter() !== null ||
      this.categoryFilter() !== null ||
      this.statusFilter() !== null,
  );

  protected readonly rows = computed(() => {
    const s = this.catalog.state();
    if (s.status !== 'ready') return [];
    const q = this.query().trim().toLowerCase();
    const progress = this.service.progress();
    return s.value
      .map((c) => {
        const p = progress.get(c.id);
        const status: Status = p?.solved
          ? 'solved'
          : p && p.attempts > 0
            ? 'attempted'
            : 'not-started';
        return { c, status, solvedIn: p?.frameworksSolved ?? [] };
      })
      .filter(
        ({ c, status }) =>
          (this.frameworkFilter() === null ||
            c.frameworks.includes(this.frameworkFilter() as WebFramework) ||
            c.comingSoon.includes(this.frameworkFilter() as WebFramework)) &&
          (this.difficultyFilter() === null || c.difficulty === this.difficultyFilter()) &&
          (this.categoryFilter() === null || c.category === this.categoryFilter()) &&
          (this.statusFilter() === null || status === this.statusFilter()) &&
          (q === '' ||
            c.title.toLowerCase().includes(q) ||
            c.summary.toLowerCase().includes(q) ||
            c.competencies.some((t) => t.includes(q))),
      );
  });

  protected setFilter(key: string, event: Event): void {
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

function option<T extends string>(value: string | undefined, options: readonly T[]): T | null {
  return options.includes(value as T) ? (value as T) : null;
}
