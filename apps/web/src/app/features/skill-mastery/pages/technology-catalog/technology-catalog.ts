import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SkillProgress } from '@pracstack/api-contracts';
import { TECHNOLOGY_CATEGORIES, type Technology } from '@pracstack/content-model';
import { AuthService } from '../../../../core/auth/auth.service';
import { asyncResource } from '../../../../shared/async/async-state';
import { formatRelativeTime } from '../../../../shared/format/relative-time';
import { Alert } from '../../../../shared/ui/alert/alert';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../../shared/ui/icon/icon';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { TrackMark } from '../../../home/track-mark';
import { PracticeApi } from '../../data-access/practice-api';
import { SkillCatalog } from '../../data-access/skill-catalog';

type CatalogTechnology = Technology & { readonly skillCount: number };

interface TechnologyProgress {
  readonly mastered: number;
  readonly practiced: number;
}

interface RecentSkill {
  readonly technology: CatalogTechnology;
  readonly skillId: string;
  readonly name: string;
  readonly progress: SkillProgress;
}

/**
 * Skill Mastery catalog: technologies grouped into labeled sections (from
 * each technology's `category` in the content), one search across all of
 * them, and the learner's most recent skills when there is real progress.
 */
@Component({
  selector: 'app-technology-catalog',
  imports: [RouterLink, Alert, EmptyState, Icon, LoadingState, PageHeader, Panel, TrackMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './technology-catalog.html',
  styleUrl: './technology-catalog.css',
})
export class TechnologyCatalog {
  private readonly catalog = inject(SkillCatalog);
  private readonly practice = inject(PracticeApi);
  private readonly auth = inject(AuthService);

  protected readonly technologies = asyncResource(
    () => null,
    () => this.catalog.technologies(),
  );

  /** Progress per technology, from the API (none when signed out). */
  private readonly progress = asyncResource(
    () => ({ version: this.practice.progressVersion(), signedIn: this.auth.canUseApi() }),
    async ({ signedIn }) => {
      if (!signedIn) return new Map<string, readonly SkillProgress[]>();
      const technologies = await this.catalog.technologies();
      const responses = await Promise.all(technologies.map((t) => this.practice.progress(t.id)));
      return new Map(responses.map((r) => [r.technologyId, r.skills] as const));
    },
  );

  /** Most recently practiced skills, with their names from the technology catalogs. */
  protected readonly recent = asyncResource(
    () => this.progressMap(),
    async (byTech): Promise<readonly RecentSkill[]> => {
      if (!byTech) return [];
      const technologies = await this.catalog.technologies();
      const latest = technologies
        .flatMap((technology) =>
          (byTech.get(technology.id) ?? [])
            .filter((p) => p.attempts > 0 && p.lastPracticedAt)
            .map((progress) => ({ technology, progress })),
        )
        .sort((a, b) =>
          (b.progress.lastPracticedAt ?? '').localeCompare(a.progress.lastPracticedAt ?? ''),
        )
        .slice(0, 4);
      return Promise.all(
        latest.map(async ({ technology, progress }) => {
          const track = await this.catalog.track(technology.id);
          const name = track?.skills.find((s) => s.id === progress.skillId)?.name;
          return {
            technology,
            skillId: progress.skillId,
            name: name ?? progress.skillId,
            progress,
          };
        }),
      );
    },
  );

  protected readonly query = signal('');

  private readonly progressMap = computed(() => {
    const s = this.progress.state();
    return s.status === 'ready' ? s.value : undefined;
  });

  /** Sections in display order, without empty ones (or ones the search hides). */
  protected readonly sections = computed(() => {
    const state = this.technologies.state();
    if (state.status !== 'ready') return [];
    const q = this.query().trim().toLowerCase();
    const matches = (t: CatalogTechnology) =>
      q === '' || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    return TECHNOLOGY_CATEGORIES.map((category) => ({
      ...category,
      technologies: state.value.filter((t) => t.category === category.id && matches(t)),
    })).filter((s) => s.technologies.length > 0);
  });

  protected readonly matchCount = computed(() =>
    this.sections().reduce((n, s) => n + s.technologies.length, 0),
  );

  protected progressOf(technologyId: string): TechnologyProgress | undefined {
    const skills = this.progressMap()?.get(technologyId);
    if (!skills) return undefined;
    return {
      mastered: skills.filter((s) => s.mastered).length,
      practiced: skills.filter((s) => s.attempts > 0).length,
    };
  }

  protected percent(part: number, whole: number): number {
    return whole === 0 ? 0 : Math.round((part / whole) * 100);
  }

  protected ago(iso: string | undefined): string {
    return iso ? formatRelativeTime(iso) : '';
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
