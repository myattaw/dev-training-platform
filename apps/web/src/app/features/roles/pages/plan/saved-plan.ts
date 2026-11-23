import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ScenarioProgress } from '@pracstack/api-contracts';
import { scenarioProgressSignal } from '../../../scenarios/data-access/scenario.service';
import { Router, RouterLink } from '@angular/router';
import { isCovered } from '@pracstack/content-model';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { formatDate } from '../../../companies/ui/labels';
import { ChallengeSubmissions } from '../../../challenges/data-access/challenge-submissions';
import { PracticeApi } from '../../../skill-mastery/data-access/practice-api';
import { PreparationApi } from '../../data-access/preparation-api';
import { type ActivityView, RoleContent, termPathSteps } from '../../data-access/role-content';
import {
  activityStatus,
  type ProgressData,
  RoleProgressLoader,
} from '../../data-access/role-progress';
import { ExperienceNote } from '../../ui/experience-note';
import { TermPath } from '../../ui/term-path';

/** A saved plan: its path is rebuilt from the stored term ids (no posting was ever stored). */
@Component({
  selector: 'app-saved-plan',
  imports: [RouterLink, NotFound, Alert, LoadingState, PageHeader, Panel, ExperienceNote, TermPath],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = loaded.state();
    @if (s.status === 'loading') {
      <app-loading-state label="Loading plan…" />
    } @else if (s.status === 'error') {
      <app-alert type="error" heading="This plan could not be loaded">
        {{ s.error }}
        <button alertAction type="button" class="btn btn--sm" (click)="loaded.reload()">
          Try again
        </button>
      </app-alert>
    } @else if (plan(); as p) {
      <app-page-header
        [heading]="p.title"
        [description]="'Saved ' + formatDate(p.createdAt) + ' from the job description analyzer.'"
        [breadcrumbs]="[{ label: 'Job Role Preparation', link: '/roles' }, { label: p.title }]"
      >
        <button
          headerActions
          type="button"
          class="btn"
          [disabled]="deleting()"
          (click)="remove(p.id)"
        >
          Delete plan
        </button>
      </app-page-header>
      @if (actionError(); as err) {
        <app-alert type="error">{{ err }}</app-alert>
      }
      <app-panel heading="Technologies in this plan">
        <p class="terms">
          @for (t of terms(); track t.id; let last = $last) {
            {{ t.label }}{{ t.covered ? '' : ' (not covered yet)' }}{{ last ? '' : ', ' }}
          }
        </p>
      </app-panel>
      <app-panel heading="Suggested preparation path">
        @if (steps().length > 0) {
          <app-term-path [steps]="steps()" [statusOf]="statusOf" />
        } @else {
          <p class="text-secondary">PracStack has no practice for these technologies yet.</p>
        }
      </app-panel>
      <app-experience-note />
      <p><a routerLink="/roles/analyze">Analyze another job description</a></p>
    } @else {
      <app-not-found
        heading="Plan not found"
        message="You have no saved plan with this ID. It may have been deleted."
        backLink="/roles"
        backLabel="Back to Job Role Preparation"
      />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 1100px;
    }
    .terms {
      margin: 0;
    }
  `,
})
export class SavedPlanPage {
  /** Route param, bound by `withComponentInputBinding()`. */
  readonly planId = input.required<string>();

  private readonly content = inject(RoleContent);
  private readonly preparation = inject(PreparationApi);
  private readonly loader = inject(RoleProgressLoader);
  private readonly practice = inject(PracticeApi);
  private readonly submissions = inject(ChallengeSubmissions);
  private readonly scenarioProgress = scenarioProgressSignal();
  private readonly router = inject(Router);

  protected readonly formatDate = formatDate;
  protected readonly deleting = signal(false);
  protected readonly actionError = signal<string | undefined>(undefined);

  protected readonly loaded = asyncResource(
    () => this.preparation.version(),
    async () => {
      const [data, saved] = await Promise.all([this.content.load(), this.preparation.get()]);
      return { data, saved };
    },
  );
  protected readonly plan = computed(() => {
    const s = this.loaded.state();
    return s.status === 'ready'
      ? s.value.saved.plans.find((p) => p.id === this.planId())
      : undefined;
  });
  protected readonly terms = computed(() => {
    const s = this.loaded.state();
    const plan = this.plan();
    if (s.status !== 'ready' || !plan) return [];
    return plan.termIds.flatMap((id) => {
      const term = s.value.data.terms.get(id);
      return term ? [{ id, label: term.label, covered: isCovered(term) }] : [];
    });
  });
  protected readonly steps = computed(() => {
    const s = this.loaded.state();
    const plan = this.plan();
    return s.status === 'ready' && plan ? termPathSteps(plan.termIds, s.value.data) : [];
  });

  private readonly skillProgress = asyncResource(
    () => ({
      refs: this.steps().flatMap((step) => step.activities.map((a) => a.ref)),
      v: this.practice.progressVersion(),
      state: this.loaded.state(),
    }),
    async (source) =>
      source.state.status === 'ready' && source.refs.length > 0
        ? this.loader.skills(source.refs, source.state.value.data.index)
        : undefined,
  );
  private readonly progressData = computed<ProgressData | undefined>(() => {
    const s = this.skillProgress.state();
    return s.status === 'ready' && s.value
      ? { skills: s.value, challenges: this.submissions.progress(), ...this.scenariosPart() }
      : undefined;
  });
  protected readonly statusOf = (a: ActivityView) => activityStatus(a.ref, this.progressData());

  protected async remove(id: string): Promise<void> {
    this.deleting.set(true);
    this.actionError.set(undefined);
    try {
      await this.preparation.deletePlan(id);
      await this.router.navigate(['/roles']);
    } catch (err) {
      this.actionError.set(errorMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }

  private scenariosPart(): { scenarios?: ReadonlyMap<string, ScenarioProgress> } {
    const scenarios = this.scenarioProgress();
    return scenarios ? { scenarios } : {};
  }
}
