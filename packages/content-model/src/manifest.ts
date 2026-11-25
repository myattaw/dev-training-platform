import type { ChallengeSummary } from './challenge';
import type { PlannedChallenge } from './company';
import type { Technology } from './skill';
import type { ROLES_FILE } from './roles';
import type { SCENARIOS_FILE } from './scenario';
import type { TAXONOMY_FILE } from './taxonomy';
import type { WebChallengeSummary } from './web-challenge';

/**
 * Layout of the generated public content, shared by the content build (which
 * writes it) and the web app (which fetches it).
 *
 *   manifest.json                    PublicManifest; fetched first, revalidated on every load
 *   challenges/<id>@<version>.json   Challenge; immutable, safe to cache forever
 *   skill-mastery/<technology>.json  TrackCatalog
 *   roles.json                       RolesFile (Job Role Preparation)
 *   taxonomy.json                    TaxonomyFile (roles and the job description analyzer)
 *   scenarios.json                   ScenariosFile (Enterprise Scenarios catalog)
 *   scenarios/<id>@<version>.json    Scenario; immutable (answer keys are private)
 */

/** Bump when the shape of the generated files changes incompatibly. */
export const SCHEMA_VERSION = 1;

export interface PublicManifest {
  readonly schemaVersion: number;
  /** Hash of all generated content. Changes whenever any content changes. */
  readonly contentVersion: string;
  readonly challenges: readonly ChallengeSummary[];
  readonly technologies: readonly (Technology & { readonly skillCount: number })[];
  /**
   * Announced challenges that cannot be practiced yet (Coming soon). Optional
   * so manifests from before this field still load.
   */
  readonly plannedChallenges?: readonly PlannedChallenge[];
  /**
   * Job Role Preparation files (public, no secrets). Optional so manifests
   * from before job roles still load; the roles pages then say so.
   */
  readonly preparation?: {
    readonly rolesFile: typeof ROLES_FILE;
    readonly taxonomyFile: typeof TAXONOMY_FILE;
  };
  /** Enterprise Scenarios catalog. Optional so older manifests still load. */
  readonly scenariosFile?: typeof SCENARIOS_FILE;
  /**
   * Web Development Challenges catalog (summaries only; details, starter
   * projects and tests are served by the API, which enforces access).
   * Optional so older manifests still load.
   */
  readonly webChallenges?: readonly WebChallengeSummary[];
}

export const MANIFEST_FILE = 'manifest.json';

export const challengeFile = (id: string, version: number): string =>
  `challenges/${id}@${version}.json`;

export const trackFile = (technologyId: string): string => `skill-mastery/${technologyId}.json`;

/**
 * Private layout of a web challenge (served by the API, never by the web app):
 *   web-challenges/<id>@<version>.json          { challenge, projects } (access-controlled)
 *   web-challenges/<id>@<version>.grading.json  WebChallengeGrading (never served)
 */
export const webChallengeFile = (id: string, version: number): string =>
  `web-challenges/${id}@${version}.json`;

export const webChallengeGradingFile = (id: string, version: number): string =>
  `web-challenges/${id}@${version}.grading.json`;
