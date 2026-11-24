import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  formatMinutes,
  MASTERY_LABELS,
  type PlanItem,
  PRIORITY_LABELS,
  type PreparationPriority,
  type StudyPlan,
} from '@pracstack/content-model';
import { Badge, type BadgeColor } from '../../../shared/ui/badge/badge';
import {
  StatusIndicator,
  type StatusType,
} from '../../../shared/ui/status-indicator/status-indicator';
import { ChallengeProgressService } from '../../challenges/data-access/challenge-progress.service';
import type { ActivityIndex } from '../data-access/role-content';
import { dayLabel, isManual, itemView } from '../data-access/study-plan';

const PRIORITY_COLORS: Readonly<Record<PreparationPriority, BadgeColor>> = {
  high: 'red',
  medium: 'amber',
  low: 'grey',
};

/** Paths longer than this show the rest on request. */
const PATH_PREVIEW = 25;

/**
 * A study plan: a day-by-day schedule, or a prioritized path. Each activity
 * shows why it is there, how long it takes and its status. With `editable`,
 * the learner can mark manual items done and skip or restore items.
 */
@Component({
  selector: 'app-study-plan-view',
  imports: [NgTemplateOutlet, RouterLink, Badge, StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = plan();
    <p class="budget" aria-live="polite">
      @if (p.mode === 'schedule') {
        <strong>{{ minutes(p.plannedMinutes) }}</strong> planned of
        {{ minutes(p.budgetMinutes ?? 0) }} available ({{ futureDays() }}
        {{ futureDays() === 1 ? 'day' : 'days' }} × {{ minutes(p.dailyMinutes ?? 0) }}).
        @if (p.assumedDailyMinutes) {
          <span class="text-secondary">One hour a day is assumed; set your daily time above.</span>
        }
      } @else {
        <strong>{{ p.path.length }}</strong> activities, about {{ minutes(p.plannedMinutes) }} in
        total, most important first.
        <span class="text-secondary"
          >Add an interview date to get a day-by-day schedule that fits your time.</span
        >
      }
    </p>

    @if (p.mode === 'schedule') {
      <ol class="days">
        @for (d of p.days; track d.date) {
          <li class="day" [class.past]="d.date < today()" [attr.data-date]="d.date">
            <h3 class="day-head">
              <span>{{ dayTitle(d.date) }}</span>
              <span class="text-secondary day-total"
                >{{ minutes(d.minutes) }}{{ d.capacity ? ' of ' + minutes(d.capacity) : '' }}</span
              >
            </h3>
            @if (d.items.length === 0) {
              <p class="text-secondary small">Nothing planned.</p>
            } @else {
              <ol class="items">
                @for (item of d.items; track item.key) {
                  <ng-container
                    *ngTemplateOutlet="row; context: { $implicit: item }"
                  ></ng-container>
                }
              </ol>
            }
          </li>
        }
      </ol>
    } @else {
      <ol class="items path">
        @for (item of shownPath(); track item.key) {
          <ng-container *ngTemplateOutlet="row; context: { $implicit: item }"></ng-container>
        }
      </ol>
      @if (p.path.length > pathPreview && !showAll()) {
        <button type="button" class="btn btn--link" (click)="showAll.set(true)">
          Show all {{ p.path.length }} activities
        </button>
      }
    }

    @if (p.notFitting.length > 0) {
      <section class="extra" aria-labelledby="not-fitting-heading">
        <h3 id="not-fitting-heading" class="extra-head">
          Did not fit in your time ({{ p.notFitting.length }})
        </h3>
        <p class="text-secondary small">
          Most important first. A few hours cannot cover a whole technology: if these matter for the
          job, add time or start with the high-priority ones.
        </p>
        <ul class="compact">
          @for (n of notFittingShown(); track n.item.key) {
            <li>
              <app-badge [color]="priorityColors[n.item.priority]">{{
                priorityLabels[n.item.priority]
              }}</app-badge>
              {{ view(n.item).title }}
              <span class="text-secondary">
                · {{ minutes(n.item.minutes)
                }}{{ n.item.termLabel ? ' · ' + n.item.termLabel : '' }}
                @if (n.why === 'too-long') {
                  · longer than your daily time
                }
              </span>
            </li>
          }
        </ul>
        @if (p.notFitting.length > notFittingShown().length) {
          <button type="button" class="btn btn--link" (click)="showAllNotFitting.set(true)">
            Show all {{ p.notFitting.length }}
          </button>
        }
      </section>
    }

    @if (p.completed.length > 0) {
      <details class="extra">
        <summary>Already done ({{ p.completed.length }})</summary>
        <ul class="compact">
          @for (item of p.completed; track item.key) {
            <li>
              {{ view(item).title }}
              <span class="text-secondary">
                · {{ item.verified ? 'Verified by PracStack' : 'Marked done by you' }}</span
              >
              @if (editable() && !item.verified) {
                <button
                  type="button"
                  class="btn btn--link btn--sm"
                  (click)="toggleDone.emit(item.key)"
                >
                  Undo
                </button>
              }
            </li>
          }
        </ul>
      </details>
    }
    @if (p.skipped.length > 0) {
      <details class="extra">
        <summary>Skipped ({{ p.skipped.length }})</summary>
        <ul class="compact">
          @for (item of p.skipped; track item.key) {
            <li>
              {{ view(item).title }}
              @if (editable()) {
                <button
                  type="button"
                  class="btn btn--link btn--sm"
                  (click)="toggleSkip.emit(item.key)"
                >
                  Restore
                </button>
              }
            </li>
          }
        </ul>
      </details>
    }

    <ng-template #row let-item>
      @let v = view(item);
      <li class="item" [class.done]="item.status === 'done'" [attr.data-key]="item.key">
        <div class="item-main">
          <span class="item-title">
            @if (v.link) {
              <a [routerLink]="v.link" (click)="opening(item)">{{ v.title }}</a>
            } @else {
              {{ v.title }}
            }
          </span>
          <span class="item-meta text-secondary">
            {{ minutes(item.minutes) }} · {{ v.detail }}
            @if (item.termLabel) {
              · {{ item.termLabel }}
            }
            @if (item.alsoFor.length > 0) {
              <span> (also {{ item.alsoFor.join(', ') }})</span>
            }
          </span>
          <span class="item-flags">
            <app-badge [color]="priorityColor(item)">{{ priorityLabel(item) }}</app-badge>
            @if (item.related) {
              <app-badge color="grey">Related practice</app-badge>
            }
            @if (status(item); as s) {
              <app-status-indicator [type]="s[0]">{{ s[1] }}</app-status-indicator>
            }
          </span>
        </div>
        <p class="reason text-secondary">{{ item.reason }}</p>
        @if (item.resources?.length) {
          <p class="resources small">
            Official documentation:
            @for (r of item.resources; track r.url; let last = $last) {
              <a [href]="r.url" target="_blank" rel="noopener noreferrer">{{ r.label }}</a>{{
                last ? '' : ' · '
              }}
            }
          </p>
        }
        @if (editable() && item.status !== 'done') {
          <div class="actions">
            @if (manual(item)) {
              <button type="button" class="btn btn--sm" (click)="toggleDone.emit(item.key)">
                Mark done
              </button>
            }
            <button type="button" class="btn btn--link btn--sm" (click)="toggleSkip.emit(item.key)">
              Skip
            </button>
          </div>
        } @else if (editable() && manual(item)) {
          <div class="actions">
            <button type="button" class="btn btn--link btn--sm" (click)="toggleDone.emit(item.key)">
              Undo
            </button>
          </div>
        }
      </li>
    </ng-template>

    <p class="disclaimer text-secondary small">
      A plan for practice, not a promise of mastery: a few hours cannot cover a whole technology,
      and practice on PracStack is not professional experience.
    </p>
  `,
  styles: `
    .budget {
      margin: 0 0 var(--space-3);
    }
    .days,
    .items {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .day {
      padding: var(--space-3) 0;
      border-top: 1px solid var(--color-border-divider);
    }
    .day:first-child {
      border-top: none;
      padding-top: 0;
    }
    .day.past .day-head span:first-child::after {
      content: ' (past)';
      color: var(--color-text-secondary);
      font-weight: normal;
    }
    .day-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-base);
    }
    .day-total {
      font-weight: normal;
      font-size: var(--font-size-sm);
    }
    .item {
      padding: var(--space-2) 0 var(--space-2) var(--space-3);
      border-left: 3px solid var(--color-border-divider);
      margin-bottom: var(--space-2);
    }
    .item.done {
      border-left-color: var(--color-success, #1d8102);
    }
    .item.done .item-title {
      text-decoration: line-through;
      text-decoration-color: var(--color-text-secondary);
    }
    .item-main {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1) var(--space-3);
    }
    .item-title {
      font-weight: 600;
    }
    .item-meta {
      font-size: var(--font-size-sm);
    }
    .item-flags {
      display: inline-flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      font-size: var(--font-size-sm);
    }
    .reason {
      margin: var(--space-1) 0 0;
      font-size: var(--font-size-sm);
    }
    .resources {
      margin: var(--space-1) 0 0;
    }
    .actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }
    .extra {
      margin-top: var(--space-4);
    }
    .extra-head {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-base);
    }
    .compact {
      margin: var(--space-2) 0 0;
      padding-left: var(--space-5);
    }
    .compact li {
      padding: 2px 0;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .disclaimer {
      margin-top: var(--space-4);
    }
    .small {
      font-size: var(--font-size-sm);
    }
  `,
})
export class StudyPlanView {
  readonly plan = input.required<StudyPlan>();
  readonly index = input.required<ActivityIndex>();
  readonly today = input.required<string>();
  /** Show Mark done, Skip and Restore. */
  readonly editable = input(false);
  /** Track server progress (signed in): show statuses. */
  readonly tracked = input(false);

  readonly toggleDone = output<string>();
  readonly toggleSkip = output<string>();

  private readonly challengeProgress = inject(ChallengeProgressService);

  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly priorityColors = PRIORITY_COLORS;
  protected readonly pathPreview = PATH_PREVIEW;
  protected readonly showAll = signal(false);
  protected readonly showAllNotFitting = signal(false);
  protected readonly minutes = formatMinutes;

  protected readonly shownPath = computed(() =>
    this.showAll() ? this.plan().path : this.plan().path.slice(0, PATH_PREVIEW),
  );
  protected readonly notFittingShown = computed(() =>
    this.showAllNotFitting() ? this.plan().notFitting : this.plan().notFitting.slice(0, 8),
  );
  protected readonly futureDays = computed(
    () => this.plan().days.filter((d) => d.date >= this.today()).length,
  );

  protected view(item: PlanItem) {
    return itemView(item, this.index());
  }

  protected priorityColor(item: PlanItem): BadgeColor {
    return PRIORITY_COLORS[item.priority];
  }

  protected priorityLabel(item: PlanItem): string {
    return PRIORITY_LABELS[item.priority];
  }

  protected manual(item: PlanItem): boolean {
    return isManual(item);
  }

  protected dayTitle(date: string): string {
    return date === this.today() ? `Today · ${dayLabel(date)}` : dayLabel(date);
  }

  protected status(item: PlanItem): [StatusType, string] | undefined {
    if (item.status === 'done')
      return ['success', item.verified ? 'Done (verified)' : 'Marked done'];
    if (item.status === 'skipped') return ['neutral', 'Skipped'];
    if (!this.tracked()) return undefined;
    if (item.mastery) {
      const type: StatusType =
        item.mastery === 'mastered' || item.mastery === 'strong'
          ? 'success'
          : item.mastery === 'not-assessed'
            ? 'neutral'
            : 'in-progress';
      return [type, MASTERY_LABELS[item.mastery]];
    }
    return undefined;
  }

  /** The workspace opens in the last language used for a challenge; set it to this one. */
  protected opening(item: PlanItem): void {
    if (item.ref?.kind === 'challenge' && item.ref.language) {
      this.challengeProgress.setPreferredLanguage(item.ref.challengeId, item.ref.language);
    }
  }
}
