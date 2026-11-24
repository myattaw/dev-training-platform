import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  PreparationResponse,
  SavedPlan,
  SavedRequirement,
  ScenarioProgress,
  UpdatePlanRequest,
} from '@pracstack/api-contracts';
import {
  type ActivityRef,
  buildStudyPlan,
  describeActivity,
  inferFocus,
  INTERVIEW_FORMAT_LABELS,
  isIsoDate,
  missedItems,
  storedDays,
  type StudyPlan,
  type StudyPlanInput,
  viewStoredSchedule,
} from '@pracstack/content-model';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource, type AsyncState, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { formatDate } from '../../../companies/ui/labels';
import { ChallengeSubmissions } from '../../../challenges/data-access/challenge-submissions';
import { scenarioProgressSignal } from '../../../scenarios/data-access/scenario.service';
import { PracticeApi } from '../../../skill-mastery/data-access/practice-api';
import { PreparationApi } from '../../data-access/preparation-api';
import { RoleContent, type RoleData } from '../../data-access/role-content';
import { type ProgressData, RoleProgressLoader } from '../../data-access/role-progress';
import {
  activityLookup,
  EMPTY_SETTINGS,
  type InterviewSettings,
  itemView,
  localToday,
  plannerProgress,
  plannerSettings,
} from '../../data-access/study-plan';
import { CompanyMatch } from '../../ui/company-match';
import { ExperienceNote } from '../../ui/experience-note';
import { InterviewSettingsForm } from '../../ui/interview-settings-form';
import { StudyPlanView } from '../../ui/study-plan-view';

/**
 * A saved interview plan. Its schedule is shown exactly as saved, with
 * today's statuses; it changes only when the learner reschedules or changes
 * the interview date or daily time (completed work keeps its place). No
 * posting was ever stored: the plan is rebuilt from term ids and levels.
 */
@Component({
  selector: 'app-saved-plan',
  imports: [
    RouterLink,
    NotFound,
    Alert,
    ConfirmDialog,
    LoadingState,
    PageHeader,
    Panel,
    CompanyMatch,
    ExperienceNote,
    InterviewSettingsForm,
    StudyPlanView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
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
        [description]="description(p)"
        [breadcrumbs]="[{ label: 'Job Role Preparation', link: '/roles' }, { label: p.title }]"
      >
        <button
          headerActions
          type="button"
          class="btn"
          [disabled]="busy()"
          (click)="confirm.open()"
        >
          Delete plan
        </button>
      </app-page-header>

      @if (actionError(); as err) {
        <app-alert type="error">{{ err }}</app-alert>
      }

      @if (studyPlan(); as sp) {
        @if (next(); as n) {
          <app-alert type="info" heading="Resume your preparation">
            Next:
            @if (n.link) {
              <a [routerLink]="n.link">{{ n.title }}</a>
            } @else {
              {{ n.title }}
            }
            <span class="text-secondary"> · {{ n.detail }}</span>
          </app-alert>
        }
        @if (missed() > 0) {
          <app-alert type="warning" heading="Unfinished work from earlier days">
            {{ missed() }} {{ missed() === 1 ? 'activity was' : 'activities were' }} not finished on
            schedule. Rescheduling moves unfinished work to the days left; completed work stays
            where it is.
            <button
              alertAction
              type="button"
              class="btn btn--sm"
              [disabled]="busy()"
              (click)="reschedule()"
            >
              Reschedule unfinished work
            </button>
          </app-alert>
        }

        <app-panel heading="Study plan" headingId="plan-heading">
          <app-study-plan-view
            [plan]="sp"
            [index]="index()!"
            [today]="today"
            [editable]="true"
            [tracked]="tracked()"
            (toggleDone)="toggleDone($event)"
            (toggleSkip)="toggleSkip($event)"
          />
          @if (sp.mode === 'schedule' && missed() === 0) {
            <p class="reschedule">
              <button
                type="button"
                class="btn btn--link"
                [disabled]="busy()"
                (click)="reschedule()"
              >
                Recalculate the remaining days
              </button>
              <span class="text-secondary small">
                Uses your latest progress; completed work keeps its place.</span
              >
            </p>
          }
        </app-panel>
      }

      <app-panel heading="Plan details" headingId="details-heading">
        <div class="field title-field">
          <label class="field-label" for="plan-title">Plan title</label>
          <div class="row">
            <input
              id="plan-title"
              class="input"
              type="text"
              maxlength="80"
              [value]="title()"
              (input)="onTitle($event)"
            />
            <button
              type="button"
              class="btn"
              [disabled]="busy() || title().trim() === '' || title().trim() === p.title"
              (click)="rename()"
            >
              Rename
            </button>
          </div>
        </div>
        <app-interview-settings-form
          idPrefix="saved"
          [(settings)]="settings"
          [today]="today"
          [inferredFormat]="focus()?.format"
        />
        <div class="row actions">
          <button
            type="button"
            class="btn btn--primary"
            [disabled]="busy() || !settingsChanged()"
            (click)="saveSettings()"
          >
            Save details and update the schedule
          </button>
          @if (settingsChanged()) {
            <button type="button" class="btn btn--link" (click)="resetSettings()">Cancel</button>
          }
        </div>
        @if (settings().company; as company) {
          <div class="company">
            <app-company-match [company]="company" />
          </div>
        }
      </app-panel>

      <app-experience-note />
      <p><a routerLink="/roles/analyze">Plan for another job description</a></p>

      <app-confirm-dialog
        #confirm
        heading="Delete this plan?"
        confirmLabel="Delete plan"
        (confirmed)="remove(p.id)"
      >
        Its schedule and your marks are deleted. Your practice progress is not affected.
      </app-confirm-dialog>
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
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    .row .input {
      flex: 1 1 18rem;
    }
    .title-field {
      margin-bottom: var(--space-4);
    }
    .actions {
      margin-top: var(--space-4);
    }
    .reschedule {
      margin: var(--space-3) 0 0;
    }
    .company {
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border-divider);
    }
    .small {
      font-size: var(--font-size-sm);
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

  protected readonly today = localToday();
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | undefined>(undefined);

  protected readonly loaded = asyncResource(
    () => this.preparation.version(),
    async () => {
      const [data, saved] = await Promise.all([this.content.load(), this.preparation.get()]);
      return { data, saved };
    },
  );
  /** The loaded plan; while it refreshes after a change, the previous one stays on screen. */
  protected readonly state = linkedSignal<AsyncState<Loaded>, AsyncState<Loaded>>({
    source: () => this.loaded.state(),
    computation: (next, previous) =>
      next.status === 'loading' && previous?.value.status === 'ready' ? previous.value : next,
  });
  protected readonly plan = computed(() => {
    const s = this.state();
    return s.status === 'ready'
      ? s.value.saved.plans.find((p) => p.id === this.planId())
      : undefined;
  });
  protected readonly index = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.value.data.index : undefined;
  });

  /** Edits in progress; reset whenever the saved plan changes. */
  protected readonly settings = linkedSignal<InterviewSettings>(
    () => this.plan()?.settings ?? EMPTY_SETTINGS,
  );
  protected readonly title = linkedSignal(() => this.plan()?.title ?? '');
  protected readonly settingsChanged = computed(
    () =>
      JSON.stringify(this.settings()) !== JSON.stringify(this.plan()?.settings ?? EMPTY_SETTINGS),
  );

  /** Plans saved before the study planner: every term, at medium priority. */
  private readonly requirements = computed<readonly SavedRequirement[]>(() => {
    const p = this.plan();
    if (!p) return [];
    return (
      p.requirements ??
      p.termIds.map((termId) => ({
        termId,
        requirement: 'uncertain' as const,
        priority: 'medium' as const,
      }))
    );
  });
  protected readonly focus = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? inferFocus(this.requirements(), s.value.data.roles) : undefined;
  });

  private readonly refs = computed<ActivityRef[]>(() => {
    const s = this.state();
    if (s.status !== 'ready') return [];
    return this.requirements().flatMap((r) => {
      const term = s.value.data.terms.get(r.termId);
      return [...(term?.practice ?? []), ...(term?.relatedPractice ?? [])];
    });
  });
  private readonly skillProgress = asyncResource(
    () => ({ refs: this.refs(), v: this.practice.progressVersion(), state: this.state() }),
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
  protected readonly tracked = computed(() => this.progressData() !== undefined);

  /** Planner input for the saved plan, with the given settings. */
  private input(settings: InterviewSettings): StudyPlanInput | undefined {
    const s = this.state();
    const p = this.plan();
    if (s.status !== 'ready' || !p) return undefined;
    const lookup = activityLookup(s.value.data.index);
    const progress = plannerProgress(this.progressData());
    const format =
      settings.format === 'unknown' ? (this.focus()?.format ?? 'general') : settings.format;
    return {
      requirements: this.requirements(),
      taxonomy: s.value.data.taxonomy,
      settings: { ...plannerSettings(settings), format },
      today: this.today,
      describe: (ref) => describeActivity(ref, lookup),
      ...(progress ? { progress } : {}),
      done: new Set(p.done ?? []),
      skipped: new Set(p.skipped ?? []),
    };
  }

  protected readonly studyPlan = computed<StudyPlan | undefined>(() => {
    const p = this.plan();
    const saved = p?.settings ?? EMPTY_SETTINGS;
    const input = this.input(saved);
    if (!p || !input) return undefined;
    // A saved schedule is shown as saved; nothing moves until the learner reschedules.
    return p.schedule && saved.interviewDate && isIsoDate(saved.interviewDate)
      ? viewStoredSchedule(input, p.schedule)
      : buildStudyPlan(input);
  });
  protected readonly missed = computed(() => {
    const sp = this.studyPlan();
    return sp ? missedItems(sp, this.today).length : 0;
  });
  protected readonly next = computed(() => {
    const sp = this.studyPlan();
    const index = this.index();
    return sp?.next && index ? itemView(sp.next, index) : undefined;
  });

  protected description(p: SavedPlan): string {
    const s = p.settings;
    const parts = [
      s?.jobTitle && s.company ? `${s.jobTitle} at ${s.company}` : (s?.jobTitle ?? s?.company),
      s?.interviewDate ? `interview on ${formatDate(`${s.interviewDate}T12:00:00Z`)}` : undefined,
      s && s.format !== 'unknown' ? INTERVIEW_FORMAT_LABELS[s.format].toLowerCase() : undefined,
    ].filter(Boolean);
    return parts.length > 0
      ? `${parts.join(' · ')}. Saved ${formatDate(p.createdAt)}.`
      : `Saved ${formatDate(p.createdAt)} from the interview study planner.`;
  }

  protected onTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  protected rename(): Promise<void> {
    return this.update({ title: this.title().trim() });
  }

  protected resetSettings(): void {
    this.settings.set(this.plan()?.settings ?? EMPTY_SETTINGS);
  }

  /** Saves the details; a date or time change replans the unfinished work. */
  protected saveSettings(): Promise<void> {
    const settings = this.settings();
    const input = this.input(settings);
    const p = this.plan();
    if (!input || !p) return Promise.resolve();
    const hasDate = settings.interviewDate !== undefined && isIsoDate(settings.interviewDate);
    const schedule = hasDate
      ? storedDays(buildStudyPlan({ ...input, ...(p.schedule ? { keep: p.schedule } : {}) }))
      : null;
    return this.update({ settings, schedule });
  }

  protected reschedule(): Promise<void> {
    const p = this.plan();
    const input = this.input(p?.settings ?? EMPTY_SETTINGS);
    if (!p || !input) return Promise.resolve();
    return this.update({
      schedule: storedDays(
        buildStudyPlan({ ...input, ...(p.schedule ? { keep: p.schedule } : {}) }),
      ),
    });
  }

  protected toggleDone(key: string): Promise<void> {
    return this.update({ done: toggled(this.plan()?.done ?? [], key) });
  }

  protected toggleSkip(key: string): Promise<void> {
    return this.update({ skipped: toggled(this.plan()?.skipped ?? [], key) });
  }

  protected async remove(id: string): Promise<void> {
    this.busy.set(true);
    this.actionError.set(undefined);
    try {
      await this.preparation.deletePlan(id);
      await this.router.navigate(['/roles']);
    } catch (err) {
      this.actionError.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  private async update(request: UpdatePlanRequest): Promise<void> {
    const p = this.plan();
    if (!p) return;
    this.busy.set(true);
    this.actionError.set(undefined);
    try {
      // The page reloads the plan when the preparation version changes.
      await this.preparation.updatePlan(p.id, request);
    } catch (err) {
      this.actionError.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  private scenariosPart(): { scenarios?: ReadonlyMap<string, ScenarioProgress> } {
    const scenarios = this.scenarioProgress();
    return scenarios ? { scenarios } : {};
  }
}

interface Loaded {
  readonly data: RoleData;
  readonly saved: PreparationResponse;
}

function toggled(keys: readonly string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
}
