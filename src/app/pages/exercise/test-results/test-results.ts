import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RunOutcome } from '../../../test-runner/test-runner.models';

@Component({
  selector: 'app-test-results',
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

  /** Captured `console.*` output, if the outcome kind carries logs. */
  protected readonly logText = computed(() => {
    const outcome = this.outcome();
    return outcome && 'logs' in outcome ? outcome.logs.join('\n') : '';
  });
}
