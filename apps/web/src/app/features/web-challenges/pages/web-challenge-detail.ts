import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { WEB_TIMED_DURATIONS, type WebTimedDuration } from '@pracstack/api-contracts';
import {
  WEB_CATEGORY_LABELS,
  WEB_DATABASE_LABELS,
  WEB_FRAMEWORK_LABELS,
  type WebFramework,
} from '@pracstack/content-model';
import { asyncResource, errorMessage } from '../../../shared/async/async-state';
import { InstructionBlocks } from '../../../shared/content/instruction-blocks/instruction-blocks';
import { InlineText } from '../../../shared/content/inline-text/inline-text';
import { formatRelativeTime } from '../../../shared/format/relative-time';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';
import { DifficultyBadge } from '../../challenges/ui/difficulty-badge';
import { WebChallengesService } from '../data-access/web-challenges.service';
import { VERDICT_LABELS } from '../ui/labels';

/** A web challenge: scenario, contract, frameworks and the learner's progress per framework. */
@Component({
  selector: 'app-web-challenge-detail',
  imports: [
    RouterLink,
    PageHeader,
    Panel,
    Alert,
    LoadingState,
    Badge,
    DifficultyBadge,
    InstructionBlocks,
    InlineText,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let state = loaded.state();
    @if (state.status === 'loading') {
      <app-loading-state label="Loading challenge…" />
    } @else if (state.status === 'error') {
      <app-alert type="error" heading="This challenge could not be loaded">
        {{ state.error }}
        <button alertAction type="button" class="btn btn--sm" (click)="loaded.reload()">
          Try again
        </button>
      </app-alert>
    } @else {
      @let c = state.value.detail.challenge;
      <app-page-header
        [heading]="c.title"
        [description]="c.summary"
        [breadcrumbs]="[
          { label: 'Web Development Challenges', link: '/web-challenges' },
          { label: c.title },
        ]"
      >
        <app-difficulty-badge headerBadge [difficulty]="c.difficulty" />
      </app-page-header>

      <div class="layout">
        <div class="main">
          <app-panel heading="Scenario and requirements">
            <app-instruction-blocks [blocks]="c.instructions" />
          </app-panel>

          <app-panel heading="HTTP contract" [flush]="true">
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Purpose</th>
                    <th scope="col">Responses</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of c.endpoints; track e.method + e.path) {
                    <tr>
                      <td class="nowrap">
                        <code>{{ e.method }} {{ e.path }}</code>
                      </td>
                      <td>{{ e.summary }}</td>
                      <td>
                        <ul class="plain">
                          @for (r of e.responses; track r) {
                            <li><app-inline-text [text]="r" /></li>
                          }
                        </ul>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </app-panel>

          <app-panel heading="Learning objectives">
            <ul class="objectives">
              @for (o of c.objectives; track o) {
                <li>{{ o }}</li>
              }
            </ul>
          </app-panel>
        </div>

        <div class="aside">
          <app-panel heading="Start">
            @if (!state.value.detail.executionAvailable) {
              <app-alert type="info">
                Running applications is not available on this server yet. You can open the project,
                edit it and keep drafts.
              </app-alert>
            }
            <fieldset class="frameworks">
              <legend>Framework</legend>
              @for (impl of c.implementations; track impl.framework) {
                <label class="framework" [class.disabled]="impl.status !== 'available'">
                  <input
                    type="radio"
                    name="framework"
                    [value]="impl.framework"
                    [checked]="selected() === impl.framework"
                    [disabled]="impl.status !== 'available'"
                    (change)="selectedFramework.set(impl.framework)"
                  />
                  <span class="framework-text">
                    <span class="framework-name">{{ labels[impl.framework] }}</span>
                    <span class="text-secondary small"
                      >{{ impl.runtime }} · {{ databases[impl.database] }}</span
                    >
                  </span>
                  @if (impl.status !== 'available') {
                    <app-badge>Coming soon</app-badge>
                  } @else {
                    @let s = frameworkStatus(impl.framework);
                    <app-badge
                      [color]="s === 'Completed' ? 'green' : s === 'In progress' ? 'amber' : 'grey'"
                      >{{ s }}</app-badge
                    >
                  }
                </label>
              }
            </fieldset>
            <div class="start-actions">
              <a
                class="btn btn--primary"
                [routerLink]="['/web-challenges', c.id, selected(), 'workspace']"
                [class.disabled]="!selected()"
              >
                {{ frameworkStatus(selected()) === 'Not started' ? 'Start' : 'Continue' }} in
                {{ labels[selected()] }}
              </a>
            </div>
            <details class="timed">
              <summary>Timed interview mode</summary>
              <p class="small text-secondary">
                A server-enforced countdown. Reloading the page never resets it; submissions after
                the deadline are refused.
              </p>
              <div class="timed-row">
                <label>
                  <span class="sr-only">Duration</span>
                  <select class="select" (change)="duration.set($any(+$any($event.target).value))">
                    @for (d of durations; track d) {
                      <option [value]="d" [selected]="duration() === d">{{ d }} minutes</option>
                    }
                  </select>
                </label>
                <button
                  type="button"
                  class="btn"
                  [disabled]="starting() || !selected()"
                  (click)="startTimed(c.id)"
                >
                  Start timed session
                </button>
              </div>
              @if (timedError(); as e) {
                <app-alert type="error">{{ e }}</app-alert>
              }
            </details>
          </app-panel>

          <app-panel heading="Details">
            <dl class="kv-list">
              <div>
                <dt>Category</dt>
                <dd>{{ categories[c.category] }}</dd>
              </div>
              <div>
                <dt>Estimated time</dt>
                <dd>{{ c.estimatedMinutes }} minutes</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{{ c.access === 'pro' ? 'Pro' : 'Free' }}</dd>
              </div>
              <div>
                <dt>Skills</dt>
                <dd class="tags">
                  @for (t of c.competencies; track t) {
                    <app-badge>{{ t }}</app-badge>
                  }
                </dd>
              </div>
              <div>
                <dt>Tests</dt>
                <dd>
                  {{ c.visibleTests.length }} visible,
                  {{ hiddenCount(c.hiddenTestCategories) }} hidden ({{
                    hiddenNames(c.hiddenTestCategories)
                  }})
                </dd>
              </div>
            </dl>
          </app-panel>

          <app-panel heading="Your submissions" [flush]="true">
            @if (state.value.history.length === 0) {
              <p class="empty text-secondary">No graded submissions yet.</p>
            } @else {
              <table class="table">
                <tbody>
                  @for (s of state.value.history; track s.id) {
                    <tr>
                      <td>{{ labels[s.framework] }}</td>
                      <td>{{ verdicts[s.verdict] }}</td>
                      <td class="nowrap">
                        {{ s.visiblePassed + s.hiddenPassed }}/{{ s.visibleTotal + s.hiddenTotal }}
                      </td>
                      <td class="nowrap text-secondary">{{ relative(s.submittedAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </app-panel>
        </div>
      </div>
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: var(--space-4);
      align-items: start;
    }
    .main,
    .aside {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-width: 0;
    }
    @media (max-width: 1000px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .table-scroll {
      overflow-x: auto;
    }
    .plain {
      margin: 0;
      padding-left: 1.1em;
    }
    .objectives {
      margin: 0;
      padding-left: 1.2em;
    }
    .frameworks {
      margin: 0 0 var(--space-3);
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: var(--space-2);
      font-weight: var(--font-weight-bold);
    }
    .framework {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm, 4px);
      margin-bottom: var(--space-1);
      cursor: pointer;
    }
    .framework.disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
    .framework-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .framework-name {
      font-weight: var(--font-weight-bold);
    }
    .small {
      font-size: var(--font-size-sm);
    }
    .start-actions .btn {
      width: 100%;
      justify-content: center;
    }
    a.disabled {
      pointer-events: none;
      opacity: 0.6;
    }
    .timed {
      margin-top: var(--space-3);
    }
    .timed summary {
      cursor: pointer;
      color: var(--color-primary);
    }
    .timed-row {
      display: flex;
      gap: var(--space-2);
      margin: var(--space-2) 0;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    .nowrap {
      white-space: nowrap;
    }
    .empty {
      margin: 0;
      padding: var(--space-3) var(--space-4);
    }
  `,
})
export class WebChallengeDetail {
  readonly id = input.required<string>();

  private readonly service = inject(WebChallengesService);
  private readonly router = inject(Router);

  protected readonly labels = WEB_FRAMEWORK_LABELS;
  protected readonly databases = WEB_DATABASE_LABELS;
  protected readonly categories = WEB_CATEGORY_LABELS;
  protected readonly verdicts = VERDICT_LABELS;
  protected readonly durations = WEB_TIMED_DURATIONS;
  protected readonly duration = signal<WebTimedDuration>(45);
  protected readonly starting = signal(false);
  protected readonly timedError = signal<string | null>(null);
  protected readonly selectedFramework = signal<WebFramework | null>(null);

  protected readonly loaded = asyncResource(
    () => this.id(),
    async (id) => {
      const detail = await this.service.detail(id);
      const history = await this.service.history(id).then(
        (h) => h.submissions,
        () => [],
      );
      return { detail, history };
    },
  );

  /** The chosen framework, defaulting to the first available one. */
  protected readonly selected = computed<WebFramework>(() => {
    const chosen = this.selectedFramework();
    if (chosen) return chosen;
    const s = this.loaded.state();
    return (
      (s.status === 'ready'
        ? s.value.detail.challenge.implementations.find((i) => i.status === 'available')?.framework
        : undefined) ?? 'aspnetcore'
    );
  });

  protected frameworkStatus(framework: WebFramework): 'Completed' | 'In progress' | 'Not started' {
    const s = this.loaded.state();
    const progress = s.status === 'ready' ? s.value.detail.progress : null;
    if (progress?.frameworksSolved.includes(framework)) return 'Completed';
    if (progress?.frameworksAttempted.includes(framework)) return 'In progress';
    return 'Not started';
  }

  protected hiddenCount(categories: readonly { count: number }[]): number {
    return categories.reduce((n, c) => n + c.count, 0);
  }

  protected hiddenNames(categories: readonly { category: string }[]): string {
    return categories.map((c) => c.category.replace(/-/g, ' ')).join(', ');
  }

  protected relative(iso: string): string {
    return formatRelativeTime(iso, new Date());
  }

  protected async startTimed(challengeId: string): Promise<void> {
    this.starting.set(true);
    this.timedError.set(null);
    try {
      const res = await this.service.startTimed(challengeId, this.selected(), this.duration());
      await this.router.navigate(
        ['/web-challenges', challengeId, res.session.framework, 'workspace'],
        {
          queryParams: { timed: res.session.id },
        },
      );
    } catch (err) {
      this.timedError.set(errorMessage(err));
    } finally {
      this.starting.set(false);
    }
  }
}
