import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SkillProgress } from '@pracstack/api-contracts';
import { tierLabel } from '@pracstack/scoring';
import { NotFound } from '../../../../core/not-found/not-found';
import { asyncResource } from '../../../../shared/async/async-state';
import { InlineText } from '../../../../shared/content/inline-text/inline-text';
import { TrackMark } from '../../../home/track-mark';
import { Alert } from '../../../../shared/ui/alert/alert';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { PracticeApi } from '../../data-access/practice-api';
import { SkillCatalog } from '../../data-access/skill-catalog';
import { MasteryMeter } from '../../ui/mastery-meter';
import { recommend } from '../../ui/recommend';
import { SkillStatus } from '../../ui/skill-status';

/** Topics and skills of one technology, with the learner's score per skill. */
@Component({
  selector: 'app-technology-overview',
  imports: [
    RouterLink,
    TrackMark,
    NotFound,
    InlineText,
    Alert,
    LoadingState,
    PageHeader,
    Panel,
    MasteryMeter,
    SkillStatus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './technology-overview.html',
  styleUrl: './technology-overview.css',
})
export class TechnologyOverview {
  readonly technologyId = input.required<string>();

  private readonly catalog = inject(SkillCatalog);
  private readonly api = inject(PracticeApi);

  protected readonly track = asyncResource(
    () => this.technologyId(),
    (id) => this.catalog.track(id),
  );
  /** Loaded separately: the catalog still shows if the API is unavailable. */
  protected readonly progress = asyncResource(
    () => ({ id: this.technologyId(), v: this.api.progressVersion() }),
    ({ id }) => this.api.progress(id),
  );

  private readonly progressBySkill = computed(() => {
    const state = this.progress.state();
    const map = new Map<string, SkillProgress>();
    if (state.status === 'ready') for (const s of state.value.skills) map.set(s.skillId, s);
    return map;
  });

  protected readonly topics = computed(() => {
    const state = this.track.state();
    if (state.status !== 'ready' || !state.value) return [];
    const track = state.value;
    return track.topics.map((topic) => ({
      topic,
      skills: track.skills
        .filter((s) => s.topicId === topic.id)
        .map((skill) => {
          const progress = this.progressBySkill().get(skill.id);
          return {
            skill,
            progress,
            tierName: progress?.attempts ? tierLabel(progress.tier) : undefined,
            buildsOn: (skill.prerequisites ?? []).map(
              (id) => track.skills.find((s) => s.id === id) ?? { id, name: id },
            ),
          };
        }),
    }));
  });

  /** What to practice next; only once progress has loaded, so it reflects the learner. */
  protected readonly recommendations = computed(() => {
    const state = this.track.state();
    if (state.status !== 'ready' || !state.value || this.progress.state().status !== 'ready')
      return undefined;
    return recommend(state.value.skills, this.progressBySkill());
  });

  protected scoreOf(skillId: string): number {
    return this.progressBySkill().get(skillId)?.score ?? 0;
  }

  protected tierOf(skillId: string): string {
    return tierLabel(this.progressBySkill().get(skillId)?.tier ?? 1);
  }

  protected readonly mastered = computed(
    () => [...this.progressBySkill().values()].filter((p) => p.mastered).length,
  );
}
