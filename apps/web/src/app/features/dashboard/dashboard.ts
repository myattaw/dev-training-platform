import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DIFFICULTIES } from '@pracstack/content-model';
import { AuthService } from '../../core/auth/auth.service';
import { asyncResource } from '../../shared/async/async-state';
import { formatRelativeTime } from '../../shared/format/relative-time';
import { Alert } from '../../shared/ui/alert/alert';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Panel } from '../../shared/ui/panel/panel';
import { ChallengeCatalogService } from '../challenges/data-access/challenge-catalog.service';
import { ChallengeProgressService } from '../challenges/data-access/challenge-progress.service';
import { ChallengeSubmissions } from '../challenges/data-access/challenge-submissions';
import { DifficultyBadge } from '../challenges/ui/difficulty-badge';
import { Landing } from '../home/landing';
import { TrackMark, trackAccent } from '../home/track-mark';
import { PracticeApi } from '../skill-mastery/data-access/practice-api';
import { SkillCatalog } from '../skill-mastery/data-access/skill-catalog';

const CONTINUE_LIMIT = 5;
const UP_NEXT_LIMIT = 3;

/** One Skill Mastery technology with this learner's progress in it. */
export interface TrackProgress {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skillCount: number;
  readonly practiced: number;
  readonly mastered: number;
  readonly attempts: number;
  /** The most recently practiced skill, to continue where the learner left off. */
  readonly lastSkillId?: string;
  readonly lastPracticedAt?: string;
}

/**
 * Home page. Signed-out visitors see the landing page; signed-in learners (and
 * local mode) see a welcome with their totals, their tracks with progress, and
 * the challenges to continue or try next.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    Panel,
    EmptyState,
    Alert,
    LoadingState,
    DifficultyBadge,
    Landing,
    TrackMark,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  protected readonly catalog = inject(ChallengeCatalogService);
  private readonly progress = inject(ChallengeProgressService);
  private readonly submissions = inject(ChallengeSubmissions);
  private readonly skillCatalog = inject(SkillCatalog);
  private readonly practiceApi = inject(PracticeApi);

  /** "Welcome back, Ada": the first name from the ID token, if there is one. */
  protected readonly greeting = computed(() => {
    if (this.auth.status() === 'local') return 'Welcome back';
    const name = this.auth.displayName();
    const first = name?.includes('@') ? undefined : name?.trim().split(/\s+/)[0];
    return first ? `Welcome back, ${first}` : 'Welcome back';
  });

  /** Skill Mastery progress per technology (needs the API; empty when signed out). */
  protected readonly tracks = asyncResource(
    () => this.practiceApi.progressVersion(),
    async (): Promise<TrackProgress[]> => {
      const technologies = await this.skillCatalog.technologies();
      return Promise.all(
        technologies.map(async (tech) => {
          const { skills } = await this.practiceApi.progress(tech.id);
          const last = [...skills].sort((a, b) =>
            (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''),
          )[0];
          return {
            id: tech.id,
            name: tech.name,
            description: tech.description,
            skillCount: tech.skillCount,
            practiced: skills.filter((s) => s.attempts > 0).length,
            mastered: skills.filter((s) => s.mastered).length,
            attempts: skills.reduce((n, s) => n + s.attempts, 0),
            ...(last ? { lastSkillId: last.skillId } : {}),
            ...(last?.lastPracticedAt ? { lastPracticedAt: last.lastPracticedAt } : {}),
          };
        }),
      );
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

  /** Coding Challenges as a track: solved on the server, out of all challenges. */
  protected readonly challengeTrack = computed(() => {
    const rows = this.rows();
    const solved = [...this.submissions.progress().values()].filter((p) => p.solved).length;
    const started = rows.filter((r) => r.record.status !== 'not-started').length;
    const next = this.continueRows()[0] ?? this.upNext()[0];
    return { total: rows.length, solved, started, next: next?.challenge };
  });

  /** Totals for the welcome header. */
  protected readonly stats = computed(() => {
    const state = this.tracks.state();
    const tracks = state.status === 'ready' ? state.value : undefined;
    // Unknown (null, shown as "–") until Skill Mastery progress has loaded.
    const sum = (f: (t: TrackProgress) => number) =>
      tracks ? tracks.reduce((n, t) => n + f(t), 0) : null;
    const challenges = this.challengeTrack();
    return [
      { label: 'Challenges solved', value: challenges.solved, of: challenges.total },
      { label: 'Skills mastered', value: sum((t) => t.mastered), of: sum((t) => t.skillCount) },
      { label: 'Skills practised', value: sum((t) => t.practiced) },
      { label: 'Questions answered', value: sum((t) => t.attempts) },
    ];
  });

  protected readonly accent = trackAccent;

  protected percent(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }

  protected relative(iso: string): string {
    return formatRelativeTime(iso);
  }
}
