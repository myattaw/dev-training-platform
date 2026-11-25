import type { LanguageId } from './challenge';
import type { WebFramework } from './web-challenge';
import { ID_PATTERN, type ValidationIssue } from './validate';

/*
 * Job Role Preparation: a target job role and an ordered path through real
 * PracStack content. Roles never invent practice: every activity points at a
 * skill, a coding challenge or (later) an enterprise scenario that exists,
 * and the content build rejects anything else.
 */

/** One piece of PracStack practice. Shared by role paths and the job description analyzer. */
export type ActivityRef =
  | { readonly kind: 'skill'; readonly skillId: string }
  | {
      readonly kind: 'challenge';
      readonly challengeId: string;
      /** Practice it in this language (the workspace opens in it; "solved" counts only in it). */
      readonly language?: LanguageId;
    }
  /** Reserved for Enterprise Scenarios; invalid until scenario ids are passed to the validators. */
  | { readonly kind: 'scenario'; readonly scenarioId: string }
  /** A Web Development Challenge, in one framework (solved counts only in it). */
  | {
      readonly kind: 'web-challenge';
      readonly challengeId: string;
      readonly framework?: WebFramework;
    };

/** Stable key of an activity, e.g. `skill:cs-oop` or `challenge:pangram:csharp`. */
export function activityKey(ref: ActivityRef): string {
  switch (ref.kind) {
    case 'skill':
      return `skill:${ref.skillId}`;
    case 'challenge':
      return ref.language
        ? `challenge:${ref.challengeId}:${ref.language}`
        : `challenge:${ref.challengeId}`;
    case 'scenario':
      return `scenario:${ref.scenarioId}`;
    case 'web-challenge':
      return ref.framework
        ? `web-challenge:${ref.challengeId}:${ref.framework}`
        : `web-challenge:${ref.challengeId}`;
  }
}

/**
 * Something the role needs. `activities` is the recommended order. A
 * competency with no activities is shown as "No practice on PracStack yet":
 * that is honest coverage information, not an empty section to fill.
 */
export interface RoleCompetency {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly activities: readonly ActivityRef[];
}

export type JobRoleStatus = 'available' | 'coming-soon';

interface JobRoleBase {
  /** Stable slug, e.g. `dotnet-backend-developer`. Never reuse or rename. */
  readonly id: string;
  readonly version: number;
  readonly title: string;
  /** One line for the catalog. */
  readonly summary: string;
  /** Taxonomy term ids (taxonomy.ts), in display order. */
  readonly technologies: readonly string[];
}

/** A role with a preparation path. */
export interface AvailableJobRole extends JobRoleBase {
  readonly status: 'available';
  readonly description: string;
  /** In the recommended learning order. */
  readonly competencies: readonly RoleCompetency[];
}

/**
 * Announced only: no path exists yet, so there is no description and no
 * competency list (the page says it is coming soon and links to related
 * practice through its technologies).
 */
export interface ComingSoonJobRole extends JobRoleBase {
  readonly status: 'coming-soon';
}

export type JobRole = AvailableJobRole | ComingSoonJobRole;

export const JOB_ROLE_STATUS_LABELS: Readonly<Record<JobRoleStatus, string>> = {
  available: 'Available',
  'coming-soon': 'Coming soon',
};

/** Public file with every role (referenced from the manifest). */
export interface RolesFile {
  readonly roles: readonly JobRole[];
}

export const ROLES_FILE = 'roles.json';

/** An available role needs at least this many competencies with real practice. */
export const MIN_PRACTISED_COMPETENCIES = 4;

/** What exists, so references can be checked. */
export interface ContentIds {
  readonly skillIds: ReadonlySet<string>;
  readonly challengeIds: ReadonlySet<string>;
  /** Languages each challenge offers; when given, a ref's `language` must be one of them. */
  readonly challengeLanguages?: ReadonlyMap<string, readonly LanguageId[]>;
  /** Enterprise Scenario ids. Until they exist, every scenario ref is invalid. */
  readonly scenarioIds?: ReadonlySet<string>;
  /** Web challenges and their available (verified) frameworks. */
  readonly webChallengeFrameworks?: ReadonlyMap<string, readonly WebFramework[]>;
}

/** Checks one activity reference; returns an error message or undefined. */
export function checkActivityRef(ref: ActivityRef, ids: ContentIds): string | undefined {
  switch (ref.kind) {
    case 'skill':
      return ids.skillIds.has(ref.skillId) ? undefined : `unknown skill "${ref.skillId}"`;
    case 'challenge': {
      if (!ids.challengeIds.has(ref.challengeId)) return `unknown challenge "${ref.challengeId}"`;
      const offered = ids.challengeLanguages?.get(ref.challengeId);
      if (ref.language && offered && !offered.includes(ref.language)) {
        return `challenge "${ref.challengeId}" is not offered in ${ref.language}`;
      }
      return undefined;
    }
    case 'scenario':
      return ids.scenarioIds?.has(ref.scenarioId)
        ? undefined
        : `unknown scenario "${ref.scenarioId}" (Enterprise Scenarios are not registered)`;
    case 'web-challenge': {
      const frameworks = ids.webChallengeFrameworks?.get(ref.challengeId);
      if (!frameworks) return `unknown web challenge "${ref.challengeId}"`;
      if (ref.framework && !frameworks.includes(ref.framework)) {
        return `web challenge "${ref.challengeId}" is not available in ${ref.framework}`;
      }
      return undefined;
    }
  }
}

export interface RoleValidationContext extends ContentIds {
  /** Taxonomy term ids. */
  readonly termIds: ReadonlySet<string>;
}

/** Duplicate ids, unknown references and roles that promise more than PracStack has. */
export function validateRoles(
  roles: readonly JobRole[],
  context: RoleValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });

  const seen = new Set<string>();
  for (const role of roles) {
    const path = `role:${role.id}`;
    if (seen.has(role.id)) error(path, 'duplicate role id');
    seen.add(role.id);
    if (!ID_PATTERN.test(role.id)) error(path, `id "${role.id}" must be lowercase kebab-case`);
    if (!Number.isInteger(role.version) || role.version < 1) {
      error(path, `version must be a positive integer (got ${role.version})`);
    }
    if (role.title.trim() === '') error(path, 'title is required');
    if (role.summary.trim() === '') error(path, 'summary is required');
    if (role.technologies.length === 0) error(path, 'list at least one technology');
    const techs = new Set<string>();
    for (const term of role.technologies) {
      if (!context.termIds.has(term)) error(`${path}/technologies`, `unknown term "${term}"`);
      if (techs.has(term)) error(`${path}/technologies`, `duplicate term "${term}"`);
      techs.add(term);
    }

    if (role.status === 'coming-soon') {
      const extra = role as unknown as { competencies?: unknown; description?: unknown };
      if (extra.competencies !== undefined) {
        error(path, 'a coming-soon role must not list competencies');
      }
      if (extra.description !== undefined) {
        error(path, 'a coming-soon role has no description (only title, summary, technologies)');
      }
      continue;
    }
    if (role.status !== 'available') {
      error(path, `unknown status "${(role as { status: string }).status}"`);
      continue;
    }

    if (role.description.trim() === '') error(path, 'description is required');
    const competencyIds = new Set<string>();
    const activityKeys = new Set<string>();
    let practiced = 0;
    for (const competency of role.competencies) {
      const cPath = `${path}/${competency.id}`;
      if (!ID_PATTERN.test(competency.id)) {
        error(cPath, `id "${competency.id}" must be lowercase kebab-case`);
      }
      if (competencyIds.has(competency.id)) error(cPath, 'duplicate competency id');
      competencyIds.add(competency.id);
      if (competency.name.trim() === '') error(cPath, 'name is required');
      if (competency.description.trim() === '') error(cPath, 'description is required');
      if (competency.activities.length > 0) practiced++;
      competency.activities.forEach((ref, i) => {
        const problem = checkActivityRef(ref, context);
        if (problem) error(`${cPath}/activities[${i}]`, problem);
        const key = activityKey(ref);
        if (activityKeys.has(key)) error(`${cPath}/activities[${i}]`, `"${key}" appears twice`);
        activityKeys.add(key);
      });
    }
    if (practiced < MIN_PRACTISED_COMPETENCIES) {
      error(
        path,
        `an available role needs at least ${MIN_PRACTISED_COMPETENCIES} competencies with practice (has ${practiced}); mark it coming-soon instead`,
      );
    }
  }
  return issues;
}
