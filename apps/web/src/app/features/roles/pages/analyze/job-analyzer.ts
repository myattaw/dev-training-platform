import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ScenarioProgress } from '@pracstack/api-contracts';
import { scenarioProgressSignal } from '../../../scenarios/data-access/scenario.service';
import { RouterLink } from '@angular/router';
import { PREPARATION_LIMITS, type SavedPlan } from '@pracstack/api-contracts';
import {
  analyzeJobDescription,
  CONFIDENCE_LABELS,
  MAX_ANALYSIS_CHARS,
  type MatchConfidence,
  TERM_CATEGORIES,
  TERM_CATEGORY_LABELS,
} from '@pracstack/content-model';
import { AuthService } from '../../../../core/auth/auth.service';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Badge, type BadgeColor } from '../../../../shared/ui/badge/badge';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { StatusIndicator } from '../../../../shared/ui/status-indicator/status-indicator';
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

const CONFIDENCE_COLORS: Readonly<Record<MatchConfidence, BadgeColor>> = {
  high: 'green',
  medium: 'blue',
  low: 'amber',
};

/** A fictional posting for "Try an example" (no real employer). */
export const EXAMPLE_POSTING = `Software Engineer, Claims Platform (example posting)

We are looking for a developer to join our claims team.

Requirements:
- 3+ years of experience with C# and .NET
- Strong SQL skills; SQL Server and T-SQL preferred
- Experience building REST APIs with ASP.NET Core
- Front end in Angular and TypeScript
- Unit testing (xUnit) and CI/CD with Azure DevOps (ADO pipelines)
- Nice to have: Power Automate (formerly Microsoft Flow), Docker
- You work in an Agile/Scrum team and write clear technical documentation.`;

/**
 * Job description analyzer. The posting is analyzed in this browser with a
 * deterministic matcher (@pracstack/content-model job-analysis.ts): it is
 * never sent to the server, logged or stored, not even in local storage.
 * Saving a plan sends only the detected taxonomy term ids and a title.
 */
@Component({
  selector: 'app-job-analyzer',
  imports: [
    RouterLink,
    Alert,
    Badge,
    EmptyState,
    LoadingState,
    PageHeader,
    Panel,
    StatusIndicator,
    ExperienceNote,
    TermPath,
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
  protected readonly confidenceLabels = CONFIDENCE_LABELS;
  protected readonly confidenceColors = CONFIDENCE_COLORS;
  protected readonly data = asyncResource(
    () => undefined,
    () => this.content.load(),
  );

  /** What is in the text box. Held in memory only. */
  protected readonly draft = signal('');
  /** The text last analyzed (on "Analyze"). */
  private readonly analyzed = signal<string | undefined>(undefined);

  protected readonly analysis = computed(() => {
    const s = this.data.state();
    const text = this.analyzed();
    return s.status === 'ready' && text !== undefined
      ? analyzeJobDescription(text, s.value.taxonomy)
      : undefined;
  });

  protected readonly groups = computed(() => {
    const a = this.analysis();
    if (!a) return [];
    return TERM_CATEGORIES.map((category) => ({
      category,
      label: TERM_CATEGORY_LABELS[category],
      terms: a.terms.filter((t) => t.term.category === category),
    })).filter((g) => g.terms.length > 0);
  });
  protected readonly covered = computed(
    () => this.analysis()?.terms.filter((t) => t.covered) ?? [],
  );
  protected readonly uncovered = computed(
    () => this.analysis()?.terms.filter((t) => !t.covered) ?? [],
  );
  protected readonly termIds = computed(() =>
    (this.analysis()?.terms ?? []).map((t) => t.term.id).slice(0, PREPARATION_LIMITS.maxPlanTerms),
  );

  protected readonly steps = computed(() => {
    const s = this.data.state();
    return s.status === 'ready' ? termPathSteps(this.termIds(), s.value) : [];
  });

  private readonly skillProgress = asyncResource(
    () => ({
      refs: this.steps().flatMap((step) => step.activities.map((a) => a.ref)),
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
  protected readonly statusOf = (a: ActivityView) => activityStatus(a.ref, this.progressData());

  protected readonly planTitle = signal(
    `Job posting plan, ${formatDate(new Date().toISOString())}`,
  );
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | undefined>(undefined);
  protected readonly savedPlan = signal<SavedPlan | undefined>(undefined);

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected analyze(): void {
    this.analyzed.set(this.draft());
    this.savedPlan.set(undefined);
    this.saveError.set(undefined);
  }

  protected useExample(): void {
    this.draft.set(EXAMPLE_POSTING);
    this.analyze();
  }

  protected clear(): void {
    this.draft.set('');
    this.analyzed.set(undefined);
    this.savedPlan.set(undefined);
  }

  protected onTitle(event: Event): void {
    this.planTitle.set((event.target as HTMLInputElement).value);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.saveError.set(undefined);
    try {
      // Only term ids and the title; never the posting.
      this.savedPlan.set(
        await this.preparation.createPlan({ title: this.planTitle(), termIds: this.termIds() }),
      );
    } catch (err) {
      this.saveError.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected signIn(): void {
    void this.auth.signIn();
  }

  private scenariosPart(): { scenarios?: ReadonlyMap<string, ScenarioProgress> } {
    const scenarios = this.scenarioProgress();
    return scenarios ? { scenarios } : {};
  }
}
