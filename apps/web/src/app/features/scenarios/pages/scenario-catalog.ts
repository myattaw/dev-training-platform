import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ScenarioProgress } from '@pracstack/api-contracts';
import { AuthService } from '../../../core/auth/auth.service';
import { asyncResource } from '../../../shared/async/async-state';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';
import { DifficultyBadge } from '../../challenges/ui/difficulty-badge';
import { ScenarioService } from '../data-access/scenario.service';
import { AssessmentBadge } from '../ui/assessment-badge';

@Component({
  selector: 'app-scenario-catalog',
  imports: [
    RouterLink,
    Alert,
    Badge,
    LoadingState,
    PageHeader,
    Panel,
    DifficultyBadge,
    AssessmentBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      heading="Enterprise Scenarios"
      description="Realistic tasks from business software teams: build and secure APIs, process data, investigate performance, fix pipelines and design workflows. Each scenario says exactly how it is graded."
    />

    <app-panel heading="Scenarios" headingId="scenarios-heading" [counter]="count()" [flush]="true">
      @let state = scenarios.state();
      @if (state.status === 'loading') {
        <app-loading-state label="Loading scenarios…" />
      } @else if (state.status === 'error') {
        <div class="state">
          <app-alert type="error" heading="Scenarios could not be loaded">
            {{ state.error }}
            <button alertAction type="button" class="btn btn--sm" (click)="scenarios.reload()">
              Try again
            </button>
          </app-alert>
        </div>
      } @else {
        <table class="table" aria-labelledby="scenarios-heading">
          <thead>
            <tr>
              <th scope="col">Scenario</th>
              <th scope="col">Technologies</th>
              <th scope="col">Grading</th>
              <th scope="col">Difficulty</th>
              <th scope="col" class="num">Time</th>
              <th scope="col" class="num">Progress</th>
            </tr>
          </thead>
          <tbody>
            @for (s of state.value; track s.id) {
              <tr>
                <td class="name">
                  <a [routerLink]="[s.id]">{{ s.title }}</a>
                  <p class="text-secondary summary">{{ s.summary }}</p>
                </td>
                <td>
                  <span class="tags">
                    @for (t of s.technologies; track t) {
                      <app-badge>{{ t }}</app-badge>
                    }
                  </span>
                </td>
                <td><app-assessment-badge [assessment]="s.assessment" /></td>
                <td><app-difficulty-badge [difficulty]="s.difficulty" /></td>
                <td class="num">{{ s.estimatedMinutes }} min</td>
                <td class="num">
                  @if (progressOf(s.id); as p) {
                    {{ p.done }} of {{ p.total }}
                    @if (p.completed) {
                      <span class="sr-only">(complete)</span><span aria-hidden="true"> ✓</span>
                    }
                  } @else {
                    <span class="text-secondary">{{ s.taskCount }} tasks</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </app-panel>
  `,
  styles: `
    .state {
      padding: var(--space-4);
    }
    .name a {
      font-weight: var(--font-weight-bold);
    }
    .summary {
      margin: var(--space-1) 0 0;
      font-size: var(--font-size-sm);
      max-width: 60ch;
    }
    .tags {
      display: inline-flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    .num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    @media (max-width: 799px) {
      th:nth-child(2),
      td:nth-child(2),
      th:nth-child(5),
      td:nth-child(5) {
        display: none;
      }
    }
  `,
})
export class ScenarioCatalog {
  private readonly service = inject(ScenarioService);
  private readonly auth = inject(AuthService);

  protected readonly scenarios = asyncResource(
    () => 0,
    () => this.service.catalog(),
  );
  /** Progress needs an account (or local mode); signed-out visitors see task counts. */
  private readonly progress = asyncResource(
    () => this.auth.status(),
    (status) =>
      status === 'signed-out'
        ? Promise.resolve({ scenarios: [] as readonly ScenarioProgress[] })
        : this.service.progressList(),
  );

  protected readonly count = computed(() => {
    const s = this.scenarios.state();
    return s.status === 'ready' ? s.value.length : undefined;
  });

  protected progressOf(id: string): ScenarioProgress | undefined {
    const s = this.progress.state();
    return s.status === 'ready' ? s.value.scenarios.find((p) => p.scenarioId === id) : undefined;
  }
}
