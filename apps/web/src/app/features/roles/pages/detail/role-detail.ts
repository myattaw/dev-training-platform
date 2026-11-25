import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { WebChallengesService } from '../../../web-challenges/data-access/web-challenges.service';
import type { ScenarioProgress } from '@pracstack/api-contracts';
import { scenarioProgressSignal } from '../../../scenarios/data-access/scenario.service';
import { RouterLink } from '@angular/router';
import {
  activityKey,
  type AvailableJobRole,
  isCovered,
  JOB_ROLE_STATUS_LABELS,
  type JobRole,
} from '@pracstack/content-model';
import { AuthService } from '../../../../core/auth/auth.service';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Badge } from '../../../../shared/ui/badge/badge';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { StatusIndicator } from '../../../../shared/ui/status-indicator/status-indicator';
import { ChallengeSubmissions } from '../../../challenges/data-access/challenge-submissions';
import { PracticeApi } from '../../../skill-mastery/data-access/practice-api';
import { PreparationApi } from '../../data-access/preparation-api';
import { type ActivityView, resolveActivity, RoleContent } from '../../data-access/role-content';
import {
  activityStatus,
  pathProgress,
  type ProgressData,
  RoleProgressLoader,
} from '../../data-access/role-progress';
import { ActivityList, ActivityStatusView } from '../../ui/activity-list';
import { ExperienceNote } from '../../ui/experience-note';

/**
 * One job role: its competencies in learning order with real PracStack
 * practice, separate progress counts (never one "readiness" number), the
 * suggested next activity, and "Set as my target role".
 */
@Component({
  selector: 'app-role-detail',
  imports: [
    RouterLink,
    NotFound,
    Alert,
    Badge,
    LoadingState,
    PageHeader,
    Panel,
    StatusIndicator,
    ActivityList,
    ActivityStatusView,
    ExperienceNote,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './role-detail.html',
  styleUrl: './role-detail.css',
})
export class RoleDetail {
  /** Route param, bound by `withComponentInputBinding()`. */
  readonly roleId = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly content = inject(RoleContent);
  private readonly preparation = inject(PreparationApi);
  private readonly loader = inject(RoleProgressLoader);
  private readonly webChallenges = inject(WebChallengesService);
  // Web challenge progress for activity status (signed out: the request fails and nothing is tracked).
  private readonly webProgressLoad = this.webChallenges.loadProgress().catch(() => undefined);
  private readonly practice = inject(PracticeApi);
  private readonly submissions = inject(ChallengeSubmissions);
  private readonly scenarioProgress = scenarioProgressSignal();

  protected readonly statusLabels = JOB_ROLE_STATUS_LABELS;
  protected readonly data = asyncResource(
    () => undefined,
    () => this.content.load(),
  );
  protected readonly saved = asyncResource(
    () => ({ ok: this.auth.canUseApi(), v: this.preparation.version() }),
    () => this.preparation.get(),
  );
  protected readonly saving = signal(false);
  protected readonly actionError = signal<string | undefined>(undefined);

  protected readonly role = computed<JobRole | undefined>(() => {
    const s = this.data.state();
    return s.status === 'ready' ? s.value.roles.find((r) => r.id === this.roleId()) : undefined;
  });
  protected readonly notFound = computed(
    () => this.data.state().status === 'ready' && this.role() === undefined,
  );
  protected readonly available = computed(() => {
    const role = this.role();
    return role?.status === 'available' ? role : undefined;
  });
  protected readonly isTarget = computed(() => {
    const s = this.saved.state();
    return s.status === 'ready' && s.value.targetRoleId === this.roleId();
  });

  protected readonly technologies = computed(() => {
    const s = this.data.state();
    const role = this.role();
    if (s.status !== 'ready' || !role) return [];
    return role.technologies.flatMap((id) => {
      const term = s.value.terms.get(id);
      return term ? [term] : [];
    });
  });

  /** Activities of an available role, resolved, per competency. */
  protected readonly competencies = computed(() => {
    const s = this.data.state();
    const role = this.available();
    if (s.status !== 'ready' || !role) return [];
    return role.competencies.map((c) => ({
      competency: c,
      activities: c.activities.map((ref) => resolveActivity(ref, s.value.index)),
    }));
  });

  /**
   * For a coming-soon role: practice available now through its technologies
   * (each activity once).
   */
  protected readonly relatedPractice = computed<readonly ActivityView[]>(() => {
    const s = this.data.state();
    if (s.status !== 'ready' || this.role()?.status !== 'coming-soon') return [];
    const seen = new Set<string>();
    return this.technologies()
      .filter(isCovered)
      .flatMap((t) => t.practice)
      .filter((ref) => {
        const key = activityKey(ref);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((ref) => resolveActivity(ref, s.value.index));
  });

  private readonly skillProgress = asyncResource(
    () => ({
      refs: this.available()?.competencies.flatMap((c) => c.activities) ?? [],
      ok: this.auth.canUseApi(),
      v: this.practice.progressVersion(),
      data: this.data.state(),
    }),
    async (source) =>
      source.ok && source.data.status === 'ready' && source.refs.length > 0
        ? this.loader.skills(source.refs, source.data.value.index)
        : undefined,
  );

  /** Undefined when signed out or still loading: statuses are then not shown. */
  protected readonly progressData = computed<ProgressData | undefined>(() => {
    const s = this.skillProgress.state();
    if (s.status !== 'ready' || !s.value) return undefined;
    return {
      skills: s.value,
      challenges: this.submissions.progress(),
      ...this.scenariosPart(),
      webChallenges: this.webChallenges.progress(),
    };
  });
  protected readonly progressError = computed(() => {
    const s = this.skillProgress.state();
    return s.status === 'error' ? s.error : undefined;
  });

  protected readonly progress = computed(() => {
    const role = this.available();
    return role ? pathProgress(role.competencies, this.progressData()) : undefined;
  });

  protected readonly next = computed(() => {
    const p = this.progress();
    const groups = this.competencies();
    if (!p?.next) return undefined;
    const group = groups[p.next.groupIndex];
    const key = activityKey(p.next.ref);
    const activity = group?.activities.find((a) => a.key === key);
    return group && activity ? { competency: group.competency.name, activity } : undefined;
  });

  protected readonly statusOf = (a: ActivityView) => activityStatus(a.ref, this.progressData());

  protected async setTarget(role: AvailableJobRole | undefined, target: boolean): Promise<void> {
    if (!role) return;
    this.saving.set(true);
    this.actionError.set(undefined);
    try {
      await this.preparation.setTargetRole(target ? role.id : null);
    } catch (err) {
      this.actionError.set(errorMessage(err));
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
