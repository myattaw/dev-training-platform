import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AnswerResult } from '@pracstack/api-contracts';
import { tierLabel } from '@pracstack/scoring';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource } from '../../../../shared/async/async-state';
import { InlineText } from '../../../../shared/content/inline-text/inline-text';
import { formatRelativeTime } from '../../../../shared/format/relative-time';
import { Alert } from '../../../../shared/ui/alert/alert';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import {
  StatusIndicator,
  type StatusType,
} from '../../../../shared/ui/status-indicator/status-indicator';
import { PracticeApi } from '../../data-access/practice-api';
import { SkillCatalog } from '../../data-access/skill-catalog';
import { MasteryMeter } from '../../ui/mastery-meter';
import { SkillStatus } from '../../ui/skill-status';

const RESULTS: Readonly<Record<AnswerResult, { type: StatusType; label: string }>> = {
  correct: { type: 'success', label: 'Correct' },
  partial: { type: 'warning', label: 'Partly correct' },
  incorrect: { type: 'error', label: 'Incorrect' },
};

/** Skill results: current score, statistics and recent attempts. */
@Component({
  selector: 'app-skill-overview',
  imports: [
    RouterLink,
    NotFound,
    InlineText,
    Alert,
    EmptyState,
    LoadingState,
    PageHeader,
    Panel,
    StatusIndicator,
    MasteryMeter,
    SkillStatus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skill-overview.html',
  styleUrl: './skill-overview.css',
})
export class SkillOverview {
  readonly technologyId = input.required<string>();
  readonly skillId = input.required<string>();

  private readonly catalog = inject(SkillCatalog);
  private readonly api = inject(PracticeApi);

  protected readonly location = asyncResource(
    () => ({ technologyId: this.technologyId(), skillId: this.skillId() }),
    ({ technologyId, skillId }) => this.catalog.locate(technologyId, skillId),
  );
  protected readonly history = asyncResource(
    () => ({ skillId: this.skillId(), v: this.api.progressVersion() }),
    ({ skillId }) => this.api.history(skillId),
  );

  protected readonly rows = computed(() => {
    const state = this.history.state();
    if (state.status !== 'ready') return [];
    return state.value.attempts.map((a) => ({
      ...a,
      when: formatRelativeTime(a.answeredAt),
      difficultyName: tierLabel(a.difficulty),
      display: RESULTS[a.result],
      change: a.scoreAfter - a.scoreBefore,
    }));
  });

  protected tierName(tier: number): string {
    return tierLabel(tier);
  }

  protected readonly accuracy = computed(() => {
    const rows = this.rows();
    if (rows.length === 0) return undefined;
    return Math.round((rows.filter((r) => r.result === 'correct').length / rows.length) * 100);
  });
}
