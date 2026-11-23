/**
 * PracStack content. Node-only: building runs code (reference solutions,
 * snippets), so never import this package from browser code. The web app
 * consumes the generated public JSON instead.
 */
export { buildContent } from './build';
export type { BuildOptions, ContentBuild, FileSet } from './build';
export { findLeaks, sensitiveStrings } from './leak-check';
export { CHALLENGES } from './challenges';
export type { ChallengeEntry } from './challenges';
export { TRACKS } from './skill-mastery';
export { ROLES } from './roles/roles';
export { TAXONOMY } from './roles/taxonomy';
export { SCENARIOS } from './scenarios';
