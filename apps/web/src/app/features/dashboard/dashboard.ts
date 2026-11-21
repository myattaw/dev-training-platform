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
import { DifficultyBadge } from '../challenges/ui/difficulty-badge';

const CONTINUE_LIMIT = 5;
const UP_NEXT_LIMIT = 3;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, PageHeader, Panel, EmptyState, Alert, LoadingState, DifficultyBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly catalog = inject(ChallengeCatalogService);
  private readonly progress = inject(ChallengeProgressService);

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
      passed: count('visible-passed'),
      inProgress: count('in-progress'),
      notStarted: count('not-started'),
    };
  });
}
