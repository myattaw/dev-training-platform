import { inject, Injectable } from '@angular/core';
import {
  type ActivityRef,
  activityKey,
  type ChallengeSummary,
  type JobRole,
  LANGUAGE_LABELS,
  type LanguageId,
  suggestPath,
  type TaxonomyTerm,
  type ScenarioSummary,
} from '@pracstack/content-model';
import { ContentRepository } from '../../../core/content/content-repository';

/** What an activity reference points at, ready to show and link. */
export interface ActivityView {
  readonly key: string;
  readonly ref: ActivityRef;
  readonly title: string;
  /** e.g. "C# skill" or "Coding challenge · C#". */
  readonly detail: string;
  /** Router link; undefined when the content is not available (e.g. a scenario). */
  readonly link?: readonly string[];
  /** For challenges: the language to open the workspace in. */
  readonly language?: LanguageId;
}

/** Skills and challenges by id, from the public catalogs. */
export interface ActivityIndex {
  readonly skills: ReadonlyMap<
    string,
    { readonly name: string; readonly technologyId: string; readonly technologyName: string }
  >;
  readonly challenges: ReadonlyMap<string, ChallengeSummary>;
  readonly technologies: ReadonlyMap<string, string>;
  /** Enterprise Scenarios. Optional so fixtures without scenarios still work. */
  readonly scenarios?: ReadonlyMap<string, ScenarioSummary>;
}

export interface RoleData {
  readonly roles: readonly JobRole[];
  readonly terms: ReadonlyMap<string, TaxonomyTerm>;
  /** In taxonomy order (for the analyzer). */
  readonly taxonomy: readonly TaxonomyTerm[];
  readonly index: ActivityIndex;
}

/** One step of a suggested path, resolved for display. */
export interface TermPathStep {
  readonly termId: string;
  readonly label: string;
  readonly activities: readonly ActivityView[];
}

/** The suggested path for some term ids (detected, or from a saved plan). */
export function termPathSteps(termIds: readonly string[], data: RoleData): TermPathStep[] {
  return suggestPath(termIds, data.taxonomy).map((step) => ({
    termId: step.term.id,
    label: step.term.label,
    activities: step.activities.map((ref) => resolveActivity(ref, data.index)),
  }));
}

/** Turns a reference into something to show; unknown content is shown as unavailable. */
export function resolveActivity(ref: ActivityRef, index: ActivityIndex): ActivityView {
  const key = activityKey(ref);
  switch (ref.kind) {
    case 'skill': {
      const skill = index.skills.get(ref.skillId);
      return skill
        ? {
            key,
            ref,
            title: skill.name,
            detail: `${skill.technologyName} skill`,
            link: ['/skills', skill.technologyId, ref.skillId],
          }
        : { key, ref, title: ref.skillId, detail: 'Skill (not available)' };
    }
    case 'challenge': {
      const challenge = index.challenges.get(ref.challengeId);
      const language = ref.language;
      if (!challenge)
        return { key, ref, title: ref.challengeId, detail: 'Challenge (not available)' };
      return {
        key,
        ref,
        title: challenge.title,
        detail: language ? `Coding challenge · ${LANGUAGE_LABELS[language]}` : 'Coding challenge',
        link: ['/challenges', challenge.id, 'workspace'],
        ...(language ? { language } : {}),
      };
    }
    case 'scenario': {
      const scenario = index.scenarios?.get(ref.scenarioId);
      return scenario
        ? {
            key,
            ref,
            title: scenario.title,
            detail: `Enterprise scenario · ${scenario.taskCount} tasks · about ${scenario.estimatedMinutes} min`,
            link: ['/scenarios', scenario.id],
          }
        : { key, ref, title: ref.scenarioId, detail: 'Enterprise scenario (not available)' };
    }
  }
}

/**
 * Job roles, the taxonomy and the activity index, all from public content.
 * Loaded once per session; a failure is not cached, so it can be retried.
 */
@Injectable({ providedIn: 'root' })
export class RoleContent {
  private readonly repository = inject(ContentRepository);
  private cached: Promise<RoleData> | undefined;

  load(): Promise<RoleData> {
    if (!this.cached) {
      this.cached = this.fetch();
      this.cached.catch(() => (this.cached = undefined));
    }
    return this.cached;
  }

  private async fetch(): Promise<RoleData> {
    const [manifest, rolesFile, taxonomyFile, scenariosFile] = await Promise.all([
      this.repository.manifest(),
      this.repository.roles(),
      this.repository.taxonomy(),
      // Older content has no scenarios; roles still work without them.
      this.repository.scenarios().catch(() => ({ scenarios: [] })),
    ]);
    const tracks = await Promise.all(manifest.technologies.map((t) => this.repository.track(t.id)));
    const skills = new Map<
      string,
      { name: string; technologyId: string; technologyName: string }
    >();
    for (const track of tracks) {
      for (const skill of track.skills) {
        skills.set(skill.id, {
          name: skill.name,
          technologyId: track.technology.id,
          technologyName: track.technology.name,
        });
      }
    }
    return {
      roles: rolesFile.roles,
      taxonomy: taxonomyFile.terms,
      terms: new Map(taxonomyFile.terms.map((t) => [t.id, t])),
      index: {
        skills,
        challenges: new Map(manifest.challenges.map((c) => [c.id, c])),
        technologies: new Map(manifest.technologies.map((t) => [t.id, t.name])),
        scenarios: new Map(scenariosFile.scenarios.map((s) => [s.id, s])),
      },
    };
  }
}
