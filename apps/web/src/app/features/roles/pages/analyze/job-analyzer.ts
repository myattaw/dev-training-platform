import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PREPARATION_LIMITS,
  type SavedPlan,
  type ScenarioProgress,
} from '@pracstack/api-contracts';
import {
  type ActivityRef,
  analyzeJobDescription,
  buildStudyPlan,
  defaultChoice,
  describeActivity,
  INTERVIEW_FORMAT_LABELS,
  inferFocus,
  isDirectCoverage,
  MAX_ANALYSIS_CHARS,
  planRequirements,
  storedDays,
} from '@pracstack/content-model';
import { AuthService } from '../../../../core/auth/auth.service';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { type TabItem, Tabs } from '../../../../shared/ui/tabs/tabs';
import { formatDate } from '../../../companies/ui/labels';
import { ChallengeSubmissions } from '../../../challenges/data-access/challenge-submissions';
import { scenarioProgressSignal } from '../../../scenarios/data-access/scenario.service';
import { PracticeApi } from '../../../skill-mastery/data-access/practice-api';
import { PreparationApi } from '../../data-access/preparation-api';
import { RoleContent } from '../../data-access/role-content';
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
import { CoverageGaps } from '../../ui/coverage-gaps';
import { ExperienceNote } from '../../ui/experience-note';
import { InterviewSettingsForm } from '../../ui/interview-settings-form';
import { RequirementsTable } from '../../ui/requirements-table';
import { StudyPlanView } from '../../ui/study-plan-view';

/** A fictional posting for "Try an example" (no real employer). */
export const EXAMPLE_POSTING = `Software Engineer, Claims Platform (example posting)

We are looking for a developer to join our claims team.

What you'll do:
- Build and maintain REST APIs with ASP.NET Core
- Write unit tests and take part in code reviews
- Troubleshoot production issues with the team

Requirements:
- 3+ years of experience with C# and .NET
- Strong SQL skills; SQL Server and T-SQL preferred
- Front end in Angular and TypeScript
- CI/CD with Azure DevOps (ADO pipelines)
- Nice to have: Power Automate (formerly Microsoft Flow), Docker
- You work in an Agile/Scrum team and write clear technical documentation.`;

type ResultTab = 'plan' | 'requirements' | 'gaps';

/**
 * Job description analyzer and interview study planner. The posting is
 * analyzed in this browser with a deterministic matcher and planner
 * (@pracstack/content-model): it is never sent to the server, logged or
 * stored, not even in local storage, and it is kept in memory only while
 * this page is open. Saving a plan sends term ids with their requirement
 * levels, interview settings, the schedule's activity keys and marks.
 */
@Component({
  selector: 'app-job-analyzer',
  imports: [
    RouterLink,
    Alert,
    EmptyState,
    LoadingState,
    PageHeader,
    Panel,
    Tabs,
    CompanyMatch,
    CoverageGaps,
    ExperienceNote,
    InterviewSettingsForm,
    RequirementsTable,
    StudyPlanView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-analyzer.html',
  styleUrl: './job-analyzer.css',
})
export class JobAnalyzer {
  protected readonly auth = inject(AuthService);
  private readonly content = inject(RoleContent);
  private readonly preparation = inject(PreparationApi);
  private readonly loader = inject(RoleProgressLoader);
  private readonly practice = inject(PracticeApi);
  private readonly submissions = inject(ChallengeSubmissions);
  private readonly scenarioProgress = scenarioProgressSignal();

  protected readonly maxChars = MAX_ANALYSIS_CHARS;
  protected readonly formatLabels = INTERVIEW_FORMAT_LABELS;
  protected readonly today = localToday();
  protected readonly data = asyncResource(
    () => undefined,
    () => this.content.load(),
  );

  /** What is in the text box. Held in memory only. */
  protected readonly draft = signal('');
  /** The text last analyzed (on "Analyze"). */
  private readonly analyzed = signal<string | undefined>(undefined);
  /** The text box is open (always, until a posting is analyzed). */
  protected readonly editing = signal(true);
  /** The results no longer match the text box. */
  protected readonly stale = computed(() => {
    const text = this.analyzed();
    return text !== undefined && this.draft() !== text;
  });

  protected readonly settings = signal<InterviewSettings>(EMPTY_SETTINGS);
  /** Chosen member per alternative group. */
  private readonly choices = signal<Readonly<Record<string, string>>>({});
  protected readonly done = signal<ReadonlySet<string>>(new Set());
  protected readonly skipped = signal<ReadonlySet<string>>(new Set());
  protected readonly tab = signal<ResultTab>('plan');

  protected readonly analysis = computed(() => {
    const s = this.data.state();
    const text = this.analyzed();
    return s.status === 'ready' && text !== undefined
      ? analyzeJobDescription(text, s.value.taxonomy)
      : undefined;
  });

  protected readonly requirements = computed(() => {
    const a = this.analysis();
    const s = this.data.state();
    if (!a || s.status !== 'ready') return [];
    return planRequirements(a, s.value.taxonomy, {
      choices: this.choices(),
      ...(this.settings().language ? { language: this.settings().language } : {}),
    }).slice(0, PREPARATION_LIMITS.maxPlanTerms);
  });

  protected readonly chosen = computed<Readonly<Record<string, string>>>(() => {
    const a = this.analysis();
    const s = this.data.state();
    if (!a || s.status !== 'ready') return {};
    return Object.fromEntries(
      a.alternatives.map((g) => [
        g.id,
        this.choices()[g.id] ?? defaultChoice(g, s.value.terms, this.settings().language),
      ]),
    );
  });

  protected readonly focus = computed(() => {
    const s = this.data.state();
    return s.status === 'ready' ? inferFocus(this.requirements(), s.value.roles) : undefined;
  });

  /** The format to plan for: the learner's, else the inferred one. */
  private readonly format = computed(() => {
    const f = this.settings().format;
    return f === 'unknown' ? (this.focus()?.format ?? 'general') : f;
  });

  protected readonly coverage = computed(() => {
    const a = this.analysis();
    const inPlan = new Set(this.requirements().map((r) => r.termId));
    const terms = (a?.terms ?? []).filter((t) => inPlan.has(t.term.id));
    return {
      total: terms.length,
      direct: terms.filter((t) => isDirectCoverage(t.coverage)).length,
      partial: terms.filter((t) => t.coverage === 'partial' || t.coverage === 'related').length,
      gaps: terms.filter((t) => t.coverage === 'none').length,
      gapTabCount: (a?.terms ?? []).filter((t) => !isDirectCoverage(t.coverage) || t.term.gap)
        .length,
    };
  });

  private readonly refs = computed<ActivityRef[]>(() => {
    const s = this.data.state();
    if (s.status !== 'ready') return [];
    return this.requirements().flatMap((r) => {
      const term = s.value.terms.get(r.termId);
      return [...(term?.practice ?? []), ...(term?.relatedPractice ?? [])];
    });
  });
  private readonly skillProgress = asyncResource(
    () => ({
      refs: this.refs(),
      ok: this.auth.canUseApi(),
      v: this.practice.progressVersion(),
      data: this.data.state(),
    }),
    async (source) =>
      source.ok && source.data.status === 'ready' && source.refs.length > 0
        ? this.loader.skills(source.refs, source.data.value.index)
        : undefined,
  );
  private readonly progressData = computed<ProgressData | undefined>(() => {
    const s = this.skillProgress.state();
    return s.status === 'ready' && s.value
      ? { skills: s.value, challenges: this.submissions.progress(), ...this.scenariosPart() }
      : undefined;
  });
  protected readonly tracked = computed(() => this.progressData() !== undefined);

  protected readonly plan = computed(() => {
    const s = this.data.state();
    if (s.status !== 'ready' || !this.analysis()) return undefined;
    const lookup = activityLookup(s.value.index);
    const progress = plannerProgress(this.progressData());
    return buildStudyPlan({
      requirements: this.requirements(),
      taxonomy: s.value.taxonomy,
      settings: { ...plannerSettings(this.settings()), format: this.format() },
      today: this.today,
      describe: (ref) => describeActivity(ref, lookup),
      ...(progress ? { progress } : {}),
      done: this.done(),
      skipped: this.skipped(),
    });
  });

  protected readonly next = computed(() => {
    const p = this.plan();
    const s = this.data.state();
    return p?.next && s.status === 'ready' ? itemView(p.next, s.value.index) : undefined;
  });

  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'plan', label: 'Study plan' },
    {
      id: 'requirements',
      label: 'Detected requirements',
      count: this.analysis()?.terms.length ?? 0,
    },
    { id: 'gaps', label: 'Coverage gaps', count: this.coverage().gapTabCount },
  ]);

  protected readonly planTitle = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | undefined>(undefined);
  protected readonly savedPlan = signal<SavedPlan | undefined>(undefined);

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected analyze(): void {
    const text = this.draft();
    this.analyzed.set(text);
    this.choices.set({});
    this.done.set(new Set());
    this.skipped.set(new Set());
    this.savedPlan.set(undefined);
    this.saveError.set(undefined);
    this.tab.set('plan');
    // Collapse the posting once there is something to show.
    if (text.trim() !== '') this.editing.set(false);
  }

  protected useExample(): void {
    this.draft.set(EXAMPLE_POSTING);
    this.analyze();
  }

  protected edit(): void {
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    const text = this.analyzed();
    if (text !== undefined) this.draft.set(text);
    this.editing.set(false);
  }

  protected clear(): void {
    this.draft.set('');
    this.analyzed.set(undefined);
    this.savedPlan.set(undefined);
    this.editing.set(true);
  }

  protected selectTab(id: string): void {
    this.tab.set(id as ResultTab);
  }

  protected chooseAlternative(choice: { groupId: string; termId: string }): void {
    this.choices.update((c) => ({ ...c, [choice.groupId]: choice.termId }));
  }

  protected toggleDone(key: string): void {
    this.done.update((s) => toggle(s, key));
  }

  protected toggleSkip(key: string): void {
    this.skipped.update((s) => toggle(s, key));
  }

  protected onTitle(event: Event): void {
    this.planTitle.set((event.target as HTMLInputElement).value);
  }

  /** The default title: job title and company when given. */
  protected readonly defaultTitle = computed(() => {
    const s = this.settings();
    const what = [s.jobTitle, s.company].filter(Boolean).join(' at ');
    return what ? `${what} interview` : `Job posting plan, ${formatDate(new Date().toISOString())}`;
  });

  protected async save(): Promise<void> {
    const plan = this.plan();
    if (!plan) return;
    this.saving.set(true);
    this.saveError.set(undefined);
    const requirements = this.requirements();
    try {
      // Never the posting or its evidence: terms, levels, settings, keys and marks.
      this.savedPlan.set(
        await this.preparation.createPlan({
          title: (this.planTitle().trim() || this.defaultTitle()).slice(0, 80),
          termIds: requirements.map((r) => r.termId),
          settings: this.settings(),
          requirements,
          ...(plan.mode === 'schedule' ? { schedule: storedDays(plan) } : {}),
          done: [...this.done()],
          skipped: [...this.skipped()],
        }),
      );
    } catch (err) {
      this.saveError.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected signIn(): void {
    this.auth.openSignInPage();
  }

  private scenariosPart(): { scenarios?: ReadonlyMap<string, ScenarioProgress> } {
    const scenarios = this.scenarioProgress();
    return scenarios ? { scenarios } : {};
  }
}

function toggle(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
