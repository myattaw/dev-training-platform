import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotFound } from '../../../../core/not-found/not-found';
import { InstructionBlocks } from '../../../../shared/content/instruction-blocks/instruction-blocks';
import { formatRelativeTime } from '../../../../shared/format/relative-time';
import { Badge } from '../../../../shared/ui/badge/badge';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { ChallengeCatalogService } from '../../data-access/challenge-catalog.service';
import { ChallengeProgressService } from '../../data-access/challenge-progress.service';
import { ChallengeSubmissions } from '../../data-access/challenge-submissions';
import { CATEGORY_LABELS, LANGUAGE_LABELS, supportedLanguages } from '@pracstack/content-model';
import { asyncResource } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { ChallengeStatus } from '../../ui/challenge-status';
import { DifficultyBadge } from '../../ui/difficulty-badge';

@Component({
  selector: 'app-challenge-detail',
  imports: [
    RouterLink,
    NotFound,
    Alert,
    LoadingState,
    InstructionBlocks,
    Badge,
    PageHeader,
    Panel,
    ChallengeStatus,
    DifficultyBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './challenge-detail.html',
  styleUrl: './challenge-detail.css',
})
export class ChallengeDetail {
  /** Route param, bound by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  private readonly catalog = inject(ChallengeCatalogService);
  private readonly progress = inject(ChallengeProgressService);
  private readonly submissions = inject(ChallengeSubmissions);

  protected readonly loaded = asyncResource(
    () => this.id(),
    (id) => this.catalog.getChallenge(id),
  );

  /** `null` while loading or on error; `undefined` when the challenge does not exist. */
  protected readonly view = computed(() => {
    const state = this.loaded.state();
    if (state.status !== 'ready') return null;
    const challenge = state.value;
    if (!challenge) return undefined;
    const record = this.progress.record(challenge.id);
    const server = this.submissions.progress().get(challenge.id);
    return {
      challenge,
      record,
      breadcrumbs: [
        { label: 'Coding Challenges', link: '/challenges' },
        { label: challenge.title },
      ],
      category: CATEGORY_LABELS[challenge.category],
      languages: supportedLanguages(challenge).map((id) => LANGUAGE_LABELS[id]),
      lastRunAgo: record.lastRun ? formatRelativeTime(record.lastRun.at) : '',
      server,
      status: server?.solved ? ('solved' as const) : record.status,
    };
  });
}
