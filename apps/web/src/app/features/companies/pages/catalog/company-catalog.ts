import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { asyncResource } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../../shared/ui/icon/icon';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { CompaniesApi } from '../../data-access/companies-api';
import { PrepStatus } from '../../ui/prep-status';
import { NotAffiliated } from '../../ui/not-affiliated';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const SEARCH_DELAY_MS = 250;

/**
 * Searchable company catalog. The browser never loads the whole dataset:
 * search, the A–Z filter and paging run on the server, one page at a time.
 * Filters live in the URL (`?q=&letter=&page=`), so results can be
 * bookmarked and survive reloads.
 */
@Component({
  selector: 'app-company-catalog',
  imports: [
    RouterLink,
    PageHeader,
    Panel,
    Alert,
    EmptyState,
    Icon,
    LoadingState,
    PrepStatus,
    NotAffiliated,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './company-catalog.html',
  styleUrl: './company-catalog.css',
})
export class CompanyCatalog {
  /** Query params, bound by `withComponentInputBinding()`. */
  readonly q = input<string>();
  readonly letter = input<string>();
  readonly page = input<string>();

  protected readonly auth = inject(AuthService);
  private readonly api = inject(CompaniesApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly letters = LETTERS;
  protected readonly query = computed(() => this.q() ?? '');
  protected readonly letterFilter = computed(() => {
    const l = this.letter();
    return l && LETTERS.includes(l) ? l : undefined;
  });
  protected readonly pageNumber = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 1 ? n : 1;
  });

  protected readonly results = asyncResource(
    () => ({
      q: this.query(),
      letter: this.letterFilter(),
      page: this.pageNumber(),
      ok: this.auth.canUseApi(),
      v: this.api.version(),
    }),
    (search) =>
      search.ok
        ? this.api.list({
            q: search.q,
            ...(search.letter ? { letter: search.letter } : {}),
            page: search.page,
          })
        : Promise.resolve(undefined),
  );

  protected readonly saved = asyncResource(
    () => ({ ok: this.auth.canUseApi(), v: this.api.version() }),
    (s) => (s.ok ? this.api.saved() : Promise.resolve(undefined)),
  );

  protected readonly pageCount = computed(() => {
    const state = this.results.state();
    return state.status === 'ready' && state.value
      ? Math.max(1, Math.ceil(state.value.total / state.value.pageSize))
      : 1;
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(
      () => this.navigate({ q: value || null, page: null }),
      SEARCH_DELAY_MS,
    );
  }

  /** Enter searches immediately. */
  protected searchNow(event: Event): void {
    clearTimeout(this.searchTimer);
    const value = (event.target as HTMLInputElement).value;
    this.navigate({ q: value || null, page: null });
  }

  protected setLetter(letter: string | undefined): void {
    this.navigate({ letter: letter === this.letterFilter() ? null : (letter ?? null), page: null });
  }

  protected goToPage(page: number): void {
    this.navigate({ page: page > 1 ? String(page) : null });
  }

  protected clearFilters(): void {
    this.navigate({ q: null, letter: null, page: null });
  }

  protected async toggleSaved(slug: string, saved: boolean): Promise<void> {
    await this.api.setSaved(slug, !saved);
  }

  protected signIn(): void {
    this.auth.openSignInPage();
  }

  private navigate(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
