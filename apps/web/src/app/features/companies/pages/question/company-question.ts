import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ReportedQuestionStatus } from '@pracstack/api-contracts';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Icon } from '../../../../shared/ui/icon/icon';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { DifficultyBadge } from '../../../challenges/ui/difficulty-badge';
import { CompaniesApi } from '../../data-access/companies-api';
import { formatDate, windowLabel } from '../../ui/labels';
import { NotAffiliated } from '../../ui/not-affiliated';
import { QUESTION_STATUS_LABELS, QuestionStatus } from '../../ui/prep-status';

/**
 * One reported question. PracStack holds only its title, difficulty and link:
 * the problem itself is practised on the provider's site.
 */
@Component({
  selector: 'app-company-question',
  imports: [
    RouterLink,
    NotFound,
    Alert,
    Icon,
    LoadingState,
    PageHeader,
    Panel,
    DifficultyBadge,
    NotAffiliated,
    QuestionStatus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let state = detail.state();
    @if (state.status === 'loading') {
      <app-loading-state label="Loading question…" />
    } @else if (state.status === 'error') {
      <app-alert type="error" heading="This question could not be loaded">
        {{ state.error }}
        <button alertAction type="button" class="btn btn--sm" (click)="detail.reload()">
          Try again
        </button>
      </app-alert>
    } @else if (question(); as q) {
      <app-page-header [heading]="q.title" [breadcrumbs]="breadcrumbs()" />
      <app-panel heading="Reported question">
        <dl class="kv-list">
          <dt>Difficulty</dt>
          <dd><app-difficulty-badge [difficulty]="q.difficulty" /></dd>
          <dt>Provider</dt>
          <dd>{{ q.provider }} problem #{{ q.externalId }}</dd>
          @if (q.acceptanceRate !== undefined) {
            <dt>Acceptance rate</dt>
            <dd>{{ q.acceptanceRate }}% on {{ q.provider }}, as stated by the source</dd>
          }
          <dt>Source lists</dt>
          <dd>
            @for (w of q.windows; track w.window; let last = $last) {
              {{ windowLabel(w.window) }}
              @if (w.reportedFrequency !== undefined) {
                (frequency {{ w.reportedFrequency }})
              }
              {{ last ? '' : ', ' }}
            }
          </dd>
          <dt>Your mark</dt>
          <dd><app-question-status [status]="q.status" /></dd>
        </dl>
        <p class="explain">
          The problem statement is on {{ q.provider }}; PracStack does not copy it. Practise it
          there, then mark it here. PracStack cannot see your activity on {{ q.provider }}.
        </p>
        <div class="actions">
          <a
            class="btn btn--primary"
            [href]="q.externalUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on {{ q.provider }}<app-icon name="external" [size]="12" />
            <span class="sr-only">(opens a new tab)</span>
          </a>
          <label class="mark">
            <span class="field-label">Mark as</span>
            <select class="select" [disabled]="saving()" (change)="setStatus($event)">
              @for (s of statuses; track s[0]) {
                <option [value]="s[0]" [selected]="q.status === s[0]">{{ s[1] }}</option>
              }
            </select>
          </label>
        </div>
        @if (error(); as err) {
          <app-alert type="error">{{ err }}</app-alert>
        }
      </app-panel>

      <app-panel heading="Related PracStack practice">
        @if (q.relatedChallenges.length > 0) {
          <ul class="related">
            @for (r of q.relatedChallenges; track r.id) {
              <li>
                <a [routerLink]="['/challenges', r.id]">{{ r.title }}</a>
              </li>
            }
          </ul>
          <p class="text-secondary small">
            Original challenges that practise similar skills. They are not this question.
          </p>
        } @else {
          <p class="text-secondary">No closely related PracStack challenge yet.</p>
        }
      </app-panel>

      @for (s of sources(); track s.id) {
        <p class="text-secondary small">
          Listed in a third-party company-question dataset (<a
            [href]="s.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ s.name }}</a
          >), source snapshot {{ formatDate(s.snapshotDate) }}. A reported association, not a
          confirmed interview question.
        </p>
      }
      <app-not-affiliated />
    } @else {
      <app-not-found
        heading="Question not found"
        message="This question is not listed for this company."
        [backLink]="'/companies/' + slug()"
        backLabel="Back to the company"
      />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 960px;
    }
    .kv-list {
      grid-template-columns: max-content 1fr;
      gap: var(--space-2) var(--space-6);
      align-items: baseline;
    }
    .kv-list dd {
      margin: 0;
    }
    .explain {
      margin: var(--space-4) 0 var(--space-3);
      max-width: 70ch;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--space-3);
    }
    .actions .btn {
      gap: var(--space-2);
    }
    .mark {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .related {
      margin: 0 0 var(--space-2);
      padding-left: var(--space-5);
    }
    .small {
      margin: 0;
      font-size: var(--font-size-sm);
    }
  `,
})
export class CompanyQuestion {
  readonly slug = input.required<string>();
  readonly questionId = input.required<string>();

  private readonly api = inject(CompaniesApi);
  protected readonly detail = asyncResource(
    () => ({ slug: this.slug(), v: this.api.version() }),
    ({ slug }) => this.api.detail(slug),
  );
  private readonly company = computed(() => {
    const s = this.detail.state();
    return s.status === 'ready' ? s.value : undefined;
  });
  protected readonly question = computed(() =>
    this.company()?.questions.find((q) => q.id === this.questionId()),
  );
  protected readonly sources = computed(() => {
    const q = this.question();
    return (this.company()?.sources ?? []).filter((s) => s.id === q?.sourceId);
  });
  protected readonly breadcrumbs = computed(() => [
    { label: 'Company Interview Prep', link: '/companies' },
    { label: this.company()?.company.displayName ?? '', link: ['/companies', this.slug()] },
    { label: this.question()?.title ?? '' },
  ]);
  protected readonly statuses = Object.entries(QUESTION_STATUS_LABELS) as [
    ReportedQuestionStatus,
    string,
  ][];
  protected readonly windowLabel = windowLabel;
  protected readonly formatDate = formatDate;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async setStatus(event: Event): Promise<void> {
    const q = this.question();
    if (!q) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.setQuestionStatus(
        this.slug(),
        q.id,
        (event.target as HTMLSelectElement).value as ReportedQuestionStatus,
      );
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
