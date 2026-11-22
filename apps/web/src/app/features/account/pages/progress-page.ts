import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { asyncResource } from '../../../shared/async/async-state';
import { Alert } from '../../../shared/ui/alert/alert';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';
import { ChallengeCatalogService } from '../../challenges/data-access/challenge-catalog.service';
import { CompaniesApi } from '../../companies/data-access/companies-api';
import { PrepStatus } from '../../companies/ui/prep-status';
import { AccountApi } from '../data-access/account-api';

/** One overview of progress across Skill Mastery, challenges and company preparation. */
@Component({
  selector: 'app-progress-page',
  imports: [RouterLink, Alert, LoadingState, PageHeader, Panel, PrepStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      heading="My Progress"
      description="Everything recorded in your account. Challenges count as solved only after a server-graded submission passes every test."
    />
    @if (auth.status() === 'signed-out') {
      <app-alert type="info" heading="Sign in to see your progress">
        <button alertAction type="button" class="btn btn--sm" (click)="auth.signIn()">
          Sign in
        </button>
      </app-alert>
    } @else {
      @let s = data.state();
      @if (s.status === 'loading') {
        <app-loading-state label="Loading your progress…" />
      } @else if (s.status === 'error') {
        <app-alert type="error" heading="Progress could not be loaded">
          {{ s.error }}
          <button alertAction type="button" class="btn btn--sm" (click)="data.reload()">
            Try again
          </button>
        </app-alert>
      } @else {
        @let p = s.value.progress;
        <app-panel heading="Overview">
          <dl class="stats">
            <div>
              <dt>Total XP</dt>
              <dd>{{ p.xp }}</dd>
            </div>
            <div>
              <dt><a routerLink="/skills">Skills practised</a></dt>
              <dd>{{ p.skills.practiced }} ({{ p.skills.mastered }} mastered)</dd>
            </div>
            <div>
              <dt><a routerLink="/challenges">Challenges solved</a></dt>
              <dd>{{ solved().length }}</dd>
            </div>
            <div>
              <dt><a routerLink="/companies">Timed sessions completed</a></dt>
              <dd>{{ p.interviewSessions.completed }} of {{ p.interviewSessions.total }}</dd>
            </div>
          </dl>
        </app-panel>

        <app-panel heading="Solved challenges" [counter]="solved().length">
          @if (solved().length === 0) {
            <p class="text-secondary">
              None yet. Submit a solution in a <a routerLink="/challenges">coding challenge</a>.
            </p>
          } @else {
            <ul>
              @for (c of solved(); track c.challengeId) {
                <li>
                  <a [routerLink]="['/challenges', c.challengeId]">{{ c.title }}</a>
                </li>
              }
            </ul>
          }
        </app-panel>

        <app-panel heading="Company preparation" [counter]="s.value.companies.length">
          @if (s.value.companies.length === 0) {
            <p class="text-secondary">
              Save a company in <a routerLink="/companies">Company Interview Prep</a> to track it
              here.
            </p>
          } @else {
            <ul class="companies">
              @for (c of s.value.companies; track c.slug) {
                <li>
                  <a [routerLink]="['/companies', c.slug]">{{ c.displayName }}</a>
                  <app-prep-status [status]="c.progress.status" />
                  <span class="text-secondary">
                    practice {{ c.progress.practiceSolved }}/{{ c.progress.practiceTotal }}
                  </span>
                </li>
              }
            </ul>
          }
        </app-panel>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 960px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space-3) var(--space-6);
      margin: 0;
    }
    .stats dt {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .stats dd {
      margin: 2px 0 0;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
    }
    ul {
      margin: 0;
      padding-left: var(--space-5);
    }
    .companies li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin-bottom: var(--space-1);
    }
  `,
})
export class ProgressPage {
  protected readonly auth = inject(AuthService);
  private readonly account = inject(AccountApi);
  private readonly companies = inject(CompaniesApi);
  private readonly catalog = inject(ChallengeCatalogService);

  protected readonly data = asyncResource(
    () => this.auth.canUseApi(),
    async (ok) => {
      if (!ok) throw new Error('Sign in to see your progress.');
      const [progress, saved] = await Promise.all([
        this.account.progress(),
        this.companies.saved(),
      ]);
      const titles = new Map<string, string>();
      for (const c of progress.challenges) {
        titles.set(
          c.challengeId,
          (await this.catalog.getSummary(c.challengeId))?.title ?? c.challengeId,
        );
      }
      return { progress, companies: saved.companies, titles };
    },
  );

  protected readonly solved = computed(() => {
    const s = this.data.state();
    if (s.status !== 'ready') return [];
    return s.value.progress.challenges
      .filter((c) => c.solved)
      .map((c) => ({
        challengeId: c.challengeId,
        title: s.value.titles.get(c.challengeId) ?? c.challengeId,
      }));
  });
}
