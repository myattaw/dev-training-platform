import { inject, Injectable } from '@angular/core';
import type { Skill, Technology, Topic, TrackCatalog } from '@pracstack/content-model';
import { ContentRepository } from '../../../core/content/content-repository';

export interface SkillLocation {
  readonly technology: Technology;
  readonly topic: Topic;
  readonly skill: Skill & { readonly questionCount: number };
}

/** Public Skill Mastery catalog: technologies → topics → skills. No questions. */
@Injectable({ providedIn: 'root' })
export class SkillCatalog {
  private readonly repository = inject(ContentRepository);

  async technologies(): Promise<readonly (Technology & { readonly skillCount: number })[]> {
    return (await this.repository.manifest()).technologies;
  }

  /** `undefined` when the technology does not exist. */
  async track(technologyId: string): Promise<TrackCatalog | undefined> {
    const technologies = await this.technologies();
    return technologies.some((t) => t.id === technologyId)
      ? this.repository.track(technologyId)
      : undefined;
  }

  /** `undefined` when the technology or skill does not exist. */
  async locate(technologyId: string, skillId: string): Promise<SkillLocation | undefined> {
    const track = await this.track(technologyId);
    const skill = track?.skills.find((s) => s.id === skillId);
    const topic = track?.topics.find((t) => t.id === skill?.topicId);
    return track && skill && topic ? { technology: track.technology, topic, skill } : undefined;
  }
}
