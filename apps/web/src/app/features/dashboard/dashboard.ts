import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DIFFICULTIES } from '@pracstack/content-model';
import { formatRelativeTime } from '../../shared/format/relative-time';
import { Alert } from '../../shared/ui/alert/alert';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Panel } from '../../shared/ui/panel/panel';
import { ChallengeCatalogService } from '../challenges/data-access/challenge-catalog.service';
import { ChallengeProgressService } from '../challenges/data-access/challenge-progress.service';
import { ChallengeSubmissions } from '../challenges/data-access/challenge-submissions';
import { DifficultyBadge } from '../challenges/ui/difficulty-badge';
import { PracticeApi } from '../skill-mastery/data-access/practice-api';
import { SkillCatalog } from '../skill-mastery/data-access/skill-catalog';
import { MasteryMeter } from '../skill-mastery/ui/mastery-meter';
import { asyncResource } from '../../shared/async/async-state';

const CONTINUE_LIMIT = 5;
const UP_NEXT_LIMIT = 3;
const RECENT_SKILLS_LIMIT = 4;

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    PageHeader,
    Panel,
    EmptyState,
    Alert,
    LoadingState,
    DifficultyBadge,
    MasteryMeter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly catalog = inject(ChallengeCatalogService);
  private readonly progress = inject(ChallengeProgressService);
  private readonly submissions = inject(ChallengeSubmissions);
  private readonly skillCatalog = inject(SkillCatalog);
  private readonly practiceApi = inject(PracticeApi);

  /** Recently practiced skills across all technologies (needs the API). */
  protected readonly recentSkills = asyncResource(
    () => this.practiceApi.progressVersion(),
    async () => {
      const technologies = await this.skillCatalog.technologies();
      const perTechnology = await Promise.all(
        technologies.map(async (tech) => {
          const [track, progress] = await Promise.all([
            this.skillCatalog.track(tech.id),
            this.practiceApi.progress(tech.id),
          ]);
          return progress.skills.map((p) => ({
            ...p,
            technologyId: tech.id,
            technologyName: tech.name,
            name: track?.skills.find((s) => s.id === p.skillId)?.name ?? p.skillId,
          }));
        }),
      );
      return perTechnology
        .flat()
        .sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''))
        .slice(0, RECENT_SKILLS_LIMIT);
    },
  );

  private readonly rows = computed(() => {
    const state = this.catalog.summaries();
    if (state.status !== 'ready') return [];
    return state.value.map((challenge) => ({
      challenge,
      record: this.progress.record(challenge.id),
    }));
  });

  /** Challenges with local activity that are not yet passing, most recent first. */
  protected readonly continueRows = computed(() =>
    this.rows()
      .filter((r) => r.record.status === 'in-progress')
      .sort((a, b) => (b.record.lastActivityAt ?? '').localeCompare(a.record.lastActivityAt ?? ''))
      .slice(0, CONTINUE_LIMIT)
      .map((r) => ({
        ...r,
        lastActivity: r.record.lastActivityAt ? formatRelativeTime(r.record.lastActivityAt) : '',
      })),
  );

  /** Untouched challenges, easiest first. */
  protected readonly upNext = computed(() =>
    this.rows()
      .filter((r) => r.record.status === 'not-started')
      .sort(
        (a, b) =>
          DIFFICULTIES.indexOf(a.challenge.difficulty) -
          DIFFICULTIES.indexOf(b.challenge.difficulty),
      )
      .slice(0, UP_NEXT_LIMIT),
  );

  protected readonly summary = computed(() => {
    const rows = this.rows();
    const count = (status: string): number => rows.filter((r) => r.record.status === status).length;
    return {
      total: rows.length,
      solved: [...this.submissions.progress().values()].filter((p) => p.solved).length,
      passed: count('visible-passed'),
      inProgress: count('in-progress'),
      notStarted: count('not-started'),
    };
  });
}
