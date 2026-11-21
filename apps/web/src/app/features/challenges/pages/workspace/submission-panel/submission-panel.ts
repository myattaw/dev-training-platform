import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LANGUAGE_LABELS } from '@pracstack/content-model';
import type {
  SubmissionResponse,
  SubmissionStatus,
  SubmissionSummary,
} from '@pracstack/api-contracts';
import type { AsyncState } from '../../../../../shared/async/async-state';
import { formatRelativeTime } from '../../../../../shared/format/relative-time';
import { Alert } from '../../../../../shared/ui/alert/alert';
import { LoadingState } from '../../../../../shared/ui/loading-state/loading-state';
import {
  StatusIndicator,
  type StatusType,
} from '../../../../../shared/ui/status-indicator/status-indicator';
import { toRunOutcome } from '../../../data-access/challenge-submissions';
import { TestResults } from '../test-results/test-results';

const STATUS: Readonly<Record<SubmissionStatus, { type: StatusType; label: string }>> = {
  accepted: { type: 'success', label: 'Accepted' },
  failed: { type: 'error', label: 'Not accepted' },
  'compile-error': { type: 'error', label: 'Compile error' },
  'runtime-error': { type: 'error', label: 'Runtime error' },
  timeout: { type: 'error', label: 'Time limit exceeded' },
  'resource-limit': { type: 'error', label: 'Resource limit exceeded' },
};

/** The latest submission's verdict, and the submission history. */
@Component({
  selector: 'app-submission-panel',
  imports: [Alert, LoadingState, StatusIndicator, TestResults],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './submission-panel.html',
  styleUrl: './submission-panel.css',
})
export class SubmissionPanel {
  readonly latest = input<SubmissionResponse | null>(null);
  readonly submitting = input(false);
  /** Why the last submission could not be graded (e.g. runner unavailable). */
  readonly error = input<string | null>(null);
  readonly history = input.required<AsyncState<readonly SubmissionSummary[]>>();
  readonly retryHistory = output<void>();

  protected readonly languageLabels = LANGUAGE_LABELS;

  protected readonly verdict = computed(() => {
    const latest = this.latest();
    return latest ? { ...STATUS[latest.submission.status], s: latest.submission } : undefined;
  });

  /** Visible-test details of the latest submission, shown with the shared results view. */
  protected readonly visibleOutcome = computed(() => {
    const latest = this.latest();
    return latest
      ? toRunOutcome({ detail: latest.detail, logs: [], durationMs: latest.submission.durationMs })
      : null;
  });

  protected statusOf(status: SubmissionStatus) {
    return STATUS[status];
  }

  protected ago(iso: string): string {
    return formatRelativeTime(iso);
  }
}
