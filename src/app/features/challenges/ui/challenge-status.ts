import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  StatusIndicator,
  type StatusType,
} from '../../../shared/ui/status-indicator/status-indicator';
import type { LocalChallengeStatus } from '../data-access/challenge-progress.service';

const DISPLAY: Readonly<Record<LocalChallengeStatus, { type: StatusType; label: string }>> = {
  'not-started': { type: 'neutral', label: 'Not started' },
  'in-progress': { type: 'in-progress', label: 'In progress' },
  'visible-passed': { type: 'success', label: 'Visible tests passed' },
};

/** Status of a challenge in this browser (local drafts and runs only). */
@Component({
  selector: 'app-challenge-status',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-status-indicator [type]="display().type">{{
    display().label
  }}</app-status-indicator>`,
})
export class ChallengeStatus {
  readonly status = input.required<LocalChallengeStatus>();
  protected readonly display = computed(() => DISPLAY[this.status()]);
}
