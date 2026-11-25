import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { WebDiagnostic, WebRun } from '@pracstack/api-contracts';
import type { WebTest } from '@pracstack/content-model';
import { describeStep } from '@pracstack/content-model';
import { StatusIndicator } from '../../../shared/ui/status-indicator/status-indicator';
import { VERDICT_LABELS, VERDICT_STATUS } from './labels';

/**
 * Results of a run or a submission. Visible tests show requests, expectations
 * and responses; hidden tests show only their category and whether they passed.
 * Before any run, the visible tests are listed so the requirements are clear.
 */
@Component({
  selector: 'app-run-results',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (run(); as r) {
      @if (r.status !== 'completed') {
        <p class="state" role="status">
          <app-status-indicator type="in-progress">{{ progressLabel() }}</app-status-indicator>
        </p>
      } @else if (r.result; as result) {
        <div class="summary" role="status">
          <app-status-indicator [type]="verdictStatus[result.verdict]">
            {{ r.mode === 'submit' ? 'Submission' : 'Visible tests' }}:
            {{ verdictLabels[result.verdict] }}
          </app-status-indicator>
          @if (counts(); as c) {
            <span class="text-secondary">
              {{ c.visiblePassed }}/{{ c.visibleTotal }} visible
              @if (r.mode === 'submit') {
                · {{ c.hiddenPassed }}/{{ c.hiddenTotal }} hidden
              }
            </span>
          }
          @if (result.durationMs !== undefined) {
            <span class="text-secondary">· {{ (result.durationMs / 1000).toFixed(1) }} s</span>
          }
        </div>
        @if (result.message) {
          <p class="message">{{ result.message }}</p>
        }
        @if (r.mode === 'visible' && result.verdict === 'accepted') {
          <p class="message text-secondary">
            Visible tests pass. Submit to run the hidden tests and record your result.
          </p>
        }
        @if (r.mode === 'submit' && r.progress?.solved && result.verdict === 'accepted') {
          <p class="message success">Solved. Your progress is saved.</p>
        }

        @if (result.diagnostics.length > 0) {
          <h3>Compiler errors</h3>
          <ul class="diagnostics">
            @for (d of result.diagnostics; track $index) {
              <li>
                @if (d.file) {
                  <button
                    type="button"
                    class="btn btn--link location"
                    (click)="openDiagnostic.emit(d)"
                  >
                    {{ d.file }}{{ d.line ? ':' + d.line : '' }}
                  </button>
                }
                <span class="mono">{{ d.message }}</span>
              </li>
            }
          </ul>
        }

        @if (result.visible.length > 0) {
          <h3>Visible tests</h3>
          <ul class="tests">
            @for (t of result.visible; track t.id) {
              <li>
                <details [open]="!t.passed">
                  <summary>
                    <app-status-indicator [type]="t.passed ? 'success' : 'error'">{{
                      t.description
                    }}</app-status-indicator>
                  </summary>
                  <ol class="steps">
                    @for (s of t.steps; track $index) {
                      <li [class.failed]="!s.passed">
                        <code>{{ s.request }}</code>
                        <div class="text-secondary">Expected: {{ s.expected }}</div>
                        @if (s.message) {
                          <div class="fail">{{ s.message }}</div>
                        }
                        @if (s.actual) {
                          <div class="actual mono">Got: {{ s.actual }}</div>
                        }
                      </li>
                    }
                  </ol>
                </details>
              </li>
            }
          </ul>
        }

        @if (result.hidden.length > 0) {
          <h3>Hidden tests</h3>
          <ul class="hidden">
            @for (h of hiddenByCategory(); track h.category) {
              <li>
                <app-status-indicator [type]="h.passed === h.total ? 'success' : 'error'">
                  {{ h.category }}: {{ h.passed }}/{{ h.total }} passed
                </app-status-indicator>
              </li>
            }
          </ul>
          <p class="text-secondary small">
            Hidden tests report their category only, never their inputs.
          </p>
        }
      }
    } @else {
      <h3>Visible tests</h3>
      <ul class="tests">
        @for (t of tests(); track t.id) {
          <li>
            <details>
              <summary>{{ t.description }}</summary>
              <ol class="steps">
                @for (s of t.steps; track $index) {
                  @let d = describe(s);
                  <li>
                    <code>{{ d.request }}</code>
                    @if (s.request.body) {
                      <div class="mono body">{{ s.request.body }}</div>
                    }
                    <div class="text-secondary">Expected: {{ d.expected }}</div>
                  </li>
                }
              </ol>
            </details>
          </li>
        }
      </ul>
      <p class="text-secondary small">
        Run tests builds your project and runs these. Submit adds the hidden tests.
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-2) var(--space-3);
      overflow: auto;
      font-size: var(--font-size-sm);
    }
    h3 {
      margin: var(--space-3) 0 var(--space-1);
      font-size: var(--font-size-sm);
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      font-weight: var(--font-weight-bold);
    }
    .message {
      margin: var(--space-1) 0;
    }
    .success {
      color: var(--color-success);
    }
    ul,
    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tests > li {
      border-bottom: 1px solid var(--color-border);
      padding: var(--space-1) 0;
    }
    summary {
      cursor: pointer;
    }
    .steps {
      padding: var(--space-1) 0 var(--space-1) var(--space-5);
      list-style: decimal;
    }
    .steps li {
      margin-bottom: var(--space-1);
    }
    .steps li.failed code {
      color: var(--color-error);
    }
    .fail {
      color: var(--color-error);
    }
    .mono,
    code {
      font-family: var(--font-mono, monospace);
      word-break: break-word;
    }
    .actual,
    .body {
      white-space: pre-wrap;
      color: var(--color-text-secondary);
    }
    .diagnostics li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding: 2px 0;
    }
    .location {
      font-family: var(--font-mono, monospace);
    }
    .small {
      font-size: var(--font-size-xs);
    }
  `,
})
export class RunResults {
  readonly run = input<WebRun | undefined>(undefined);
  readonly tests = input<readonly WebTest[]>([]);
  readonly openDiagnostic = output<WebDiagnostic>();

  protected readonly verdictLabels = VERDICT_LABELS;
  protected readonly verdictStatus = VERDICT_STATUS;
  protected readonly describe = describeStep;

  protected readonly progressLabel = computed(() => {
    switch (this.run()?.status) {
      case 'queued':
        return 'Waiting for a free runner…';
      case 'building':
        return 'Building your project…';
      case 'starting':
        return 'Starting the application…';
      case 'testing':
        return 'Running tests…';
      default:
        return 'Working…';
    }
  });

  protected readonly counts = computed(() => {
    const result = this.run()?.result;
    if (!result || result.visible.length === 0) return undefined;
    return {
      visiblePassed: result.visible.filter((t) => t.passed).length,
      visibleTotal: result.visible.length,
      hiddenPassed: result.hidden.filter((h) => h.passed).length,
      hiddenTotal: result.hidden.length,
    };
  });

  protected readonly hiddenByCategory = computed(() => {
    const groups = new Map<string, { category: string; passed: number; total: number }>();
    for (const h of this.run()?.result?.hidden ?? []) {
      const name = h.category.replace(/-/g, ' ');
      const g = groups.get(name) ?? { category: name, passed: 0, total: 0 };
      g.total++;
      if (h.passed) g.passed++;
      groups.set(name, g);
    }
    return [...groups.values()];
  });
}
