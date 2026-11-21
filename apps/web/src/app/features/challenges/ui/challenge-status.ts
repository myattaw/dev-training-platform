import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  StatusIndicator,
  type StatusType,
} from '../../../shared/ui/status-indicator/status-indicator';
import type { LocalChallengeStatus } from '../data-access/challenge-progress.service';

/** Local statuses, plus "solved" from server-graded submissions. */
export type ChallengeDisplayStatus = LocalChallengeStatus | 'solved';

const DISPLAY: Readonly<Record<ChallengeDisplayStatus, { type: StatusType; label: string }>> = {
  solved: { type: 'success', label: 'Solved' },
  'not-started': { type: 'neutral', label: 'Not started' },
  'in-progress': { type: 'in-progress', label: 'In progress' },
  'visible-passed': { type: 'success', label: 'Visible tests passed' },
};

/**
 * "Solved" means a submission passed every visible and hidden test on the
 * server. The other statuses describe drafts and runs in this browser.
 */
@Component({
  selector: 'app-challenge-status',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-status-indicator [type]="display().type">{{
    display().label
  }}</app-status-indicator>`,
})
export class ChallengeStatus {
  readonly status = input.required<ChallengeDisplayStatus>();
  protected readonly display = computed(() => DISPLAY[this.status()]);
}
