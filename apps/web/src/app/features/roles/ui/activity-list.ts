import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  StatusIndicator,
  type StatusType,
} from '../../../shared/ui/status-indicator/status-indicator';
import { ChallengeProgressService } from '../../challenges/data-access/challenge-progress.service';
import type { ActivityView } from '../data-access/role-content';
import type { ActivityStatus } from '../data-access/role-progress';

const DISPLAY: Readonly<Record<Exclude<ActivityStatus, 'unknown'>, [StatusType, string]>> = {
  mastered: ['success', 'Mastered'],
  practised: ['in-progress', 'Practised, not mastered'],
  'not-assessed': ['neutral', 'Not yet assessed'],
  solved: ['success', 'Solved'],
  attempted: ['in-progress', 'Attempted, not solved'],
  'not-solved': ['neutral', 'Not solved yet'],
  completed: ['success', 'Completed'],
  'in-progress': ['in-progress', 'In progress'],
  'not-started': ['neutral', 'Not started'],
};

/** The status of one activity; nothing when it cannot be tracked (signed out). */
@Component({
  selector: 'app-activity-status',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (display(); as d) {
      <app-status-indicator [type]="d[0]">{{ d[1] }}</app-status-indicator>
    }
  `,
})
export class ActivityStatusView {
  readonly status = input.required<ActivityStatus>();
  protected readonly display = computed(() => {
    const s = this.status();
    return s === 'unknown' ? undefined : DISPLAY[s];
  });
}

/**
 * An ordered list of practice activities with links and statuses. Challenge
 * links open the workspace in the activity's language.
 */
@Component({
  selector: 'app-activity-list',
  imports: [RouterLink, ActivityStatusView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="activities">
      @for (a of activities(); track a.key) {
        <li class="activity">
          <span class="what">
            @if (a.link) {
              <a [routerLink]="a.link" (click)="opening(a)">{{ a.title }}</a>
            } @else {
              <span>{{ a.title }}</span>
            }
            <span class="detail text-secondary">{{ a.detail }}</span>
          </span>
          <app-activity-status [status]="statusOf()(a)" />
        </li>
      }
    </ol>
  `,
  styles: `
    .activities {
      margin: 0;
      padding: 0 0 0 var(--space-5);
    }
    .activity {
      padding: var(--space-1) 0;
    }
    .activity > * {
      vertical-align: top;
    }
    .what {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 var(--space-2);
      margin-right: var(--space-3);
    }
    .detail {
      font-size: var(--font-size-sm);
    }
    app-activity-status {
      display: inline-block;
      font-size: var(--font-size-sm);
    }
  `,
})
export class ActivityList {
  readonly activities = input.required<readonly ActivityView[]>();
  readonly statusOf = input<(a: ActivityView) => ActivityStatus>(() => 'unknown');

  private readonly progress = inject(ChallengeProgressService);

  /** The workspace opens in the last language used for a challenge; set it to this one. */
  protected opening(activity: ActivityView): void {
    if (activity.ref.kind === 'challenge' && activity.language) {
      this.progress.setPreferredLanguage(activity.ref.challengeId, activity.language);
    }
  }
}
