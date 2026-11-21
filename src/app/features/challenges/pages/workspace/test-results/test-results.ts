import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatusIndicator } from '../../../../../shared/ui/status-indicator/status-indicator';
import type { RunOutcome } from '../../../runner/runner.models';

/** Summary and per-test details of the latest visible-test run. */
@Component({
  selector: 'app-test-results',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './test-results.html',
  styleUrl: './test-results.css',
})
export class TestResults {
  readonly outcome = input.required<RunOutcome | null>();
  readonly running = input(false);
  readonly testCount = input.required<number>();

  protected readonly passedCount = computed(() => {
    const outcome = this.outcome();
    return outcome?.status === 'passed' || outcome?.status === 'failed'
      ? outcome.results.filter((r) => r.passed).length
      : 0;
  });
}
