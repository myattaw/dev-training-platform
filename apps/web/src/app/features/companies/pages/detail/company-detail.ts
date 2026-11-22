import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  CompanyDetailResponse,
  ReportedQuestion,
  ReportedQuestionStatus,
} from '@pracstack/api-contracts';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  type ObservationWindow,
} from '@pracstack/content-model';
import { ApiClientError } from '../../../../core/api/api-client';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Badge } from '../../../../shared/ui/badge/badge';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../../shared/ui/icon/icon';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { StatusIndicator } from '../../../../shared/ui/status-indicator/status-indicator';
import { DifficultyBadge } from '../../../challenges/ui/difficulty-badge';
import { CompaniesApi } from '../../data-access/companies-api';
import {
  formatDate,
  formatMinutes,
  formatMonth,
  SESSION_STATUS_LABELS,
  windowLabel,
} from '../../ui/labels';
import { NotAffiliated } from '../../ui/not-affiliated';
import { PrepStatus, QUESTION_STATUS_LABELS } from '../../ui/prep-status';

/**
 * One company: its reported (external) questions, PracStack's recommended
 * practice, a preparation path, timed sessions and progress. The two kinds of
 * content are kept visibly apart.
 */
@Component({
  selector: 'app-company-detail',
  imports: [
    RouterLink,
    NotFound,
    Alert,
    Badge,
    EmptyState,
    Icon,
    LoadingState,
    PageHeader,
    Panel,
    StatusIndicator,
    DifficultyBadge,
    NotAffiliated,
    PrepStatus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './company-detail.html',
  styleUrl: './company-detail.css',
})
export class CompanyDetail {
  /** Route param, bound by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  private readonly api = inject(CompaniesApi);

  protected readonly detail = asyncResource(
    () => ({ slug: this.slug(), v: this.api.version() }),
    ({ slug }) => this.api.detail(slug),
  );
  protected readonly recommendations = asyncResource(
    () => ({ slug: this.slug(), v: this.api.version() }),
    ({ slug }) => this.api.recommendations(slug),
  );
  protected readonly sessions = asyncResource(
    () => ({ slug: this.slug(), v: this.api.version() }),
    ({ slug }) => this.api.sessions(slug),
  );

  protected readonly company = computed(() => {
    const s = this.detail.state();
    return s.status === 'ready' ? s.value : undefined;
  });
  protected readonly notFound = computed(() => {
    const s = this.detail.state();
    return s.status === 'error' && s.error.includes('no company');
  });

  protected readonly breadcrumbs = computed(() => [
    { label: 'Company Interview Prep', link: '/companies' },
    { label: this.company()?.company.displayName ?? '' },
  ]);

  // ---- question filters ----
  protected readonly difficulties = DIFFICULTIES;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly difficultyFilter = signal<Difficulty | ''>('');
  protected readonly windowFilter = signal<ObservationWindow | ''>('');
  protected readonly windows = computed(() => {
    const all = new Set<ObservationWindow>();
    for (const q of this.company()?.questions ?? []) for (const w of q.windows) all.add(w.window);
    return [...all];
  });
  protected readonly questions = computed(() =>
    (this.company()?.questions ?? []).filter(
      (q) =>
        (this.difficultyFilter() === '' || q.difficulty === this.difficultyFilter()) &&
        (this.windowFilter() === '' || q.windows.some((w) => w.window === this.windowFilter())),
    ),
  );

  protected readonly questionStatuses = Object.entries(QUESTION_STATUS_LABELS) as [
    ReportedQuestionStatus,
    string,
  ][];
  protected readonly windowLabel = windowLabel;
  protected readonly formatDate = formatDate;
  protected readonly formatMonth = formatMonth;
  protected readonly formatMinutes = formatMinutes;
  protected readonly sessionStatus = SESSION_STATUS_LABELS;

  protected readonly saving = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected setDifficulty(event: Event): void {
    this.difficultyFilter.set((event.target as HTMLSelectElement).value as Difficulty | '');
  }

  protected setWindow(event: Event): void {
    this.windowFilter.set((event.target as HTMLSelectElement).value as ObservationWindow | '');
  }

  protected async toggleSaved(detail: CompanyDetailResponse): Promise<void> {
    this.saving.set(true);
    this.actionError.set(null);
    try {
      await this.api.setSaved(detail.company.slug, !detail.company.saved);
    } catch (err) {
      this.actionError.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected async setStatus(question: ReportedQuestion, event: Event): Promise<void> {
    const status = (event.target as HTMLSelectElement).value as ReportedQuestionStatus;
    this.actionError.set(null);
    try {
      await this.api.setQuestionStatus(this.slug(), question.id, status);
    } catch (err) {
      this.actionError.set(
        err instanceof ApiClientError ? err.message : 'Your mark could not be saved.',
      );
    }
  }

  protected maxFrequency(q: ReportedQuestion): number | undefined {
    const values = q.windows.flatMap((w) =>
      w.reportedFrequency === undefined ? [] : [w.reportedFrequency],
    );
    return values.length > 0 ? Math.max(...values) : undefined;
  }
}
