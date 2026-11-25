import { createHash } from 'node:crypto';
import {
  challengeFile,
  type ChallengeSummary,
  MANIFEST_FILE,
  type PublicManifest,
  SCHEMA_VERSION,
  splitChallenge,
  splitTrack,
  type Technology,
  trackFile,
  type TrackSource,
  validateChallenges,
  validateRoles,
  validateTaxonomy,
  validateTracks,
  type JobRole,
  type LanguageId,
  ROLES_FILE,
  type RolesFile,
  TAXONOMY_FILE,
  type TaxonomyFile,
  type TaxonomyTerm,
  type ValidationIssue,
  type SqlDialect,
  type SqlResultSet,
  type SplitQuestion,
  SCENARIOS_FILE,
  scenarioFile,
  type ScenarioSource,
  type ScenariosFile,
  type ScenarioSummary,
  scenarioSummary,
  splitScenario,
  validateScenarios,
} from '@pracstack/content-model';
import { CHALLENGES, type ChallengeEntry } from './challenges';
import { checkReferenceSolutions } from './checks/reference-solutions';
import { type SqlEngine } from '@pracstack/sql-engine';
import { SqlCheckPool } from './checks/sql-check-pool';
import { checkSqlQuestions, questionKey } from './checks/sql-questions';
import { checkTypeScriptSnippets } from './checks/typescript-snippets';
import { TRACKS } from './skill-mastery';
import { buildCompanies } from './companies/build-companies';
import { PLANNED_CHALLENGES } from './companies/planned';
import { ROLES } from './roles/roles';
import { TAXONOMY } from './roles/taxonomy';
import { SCENARIOS } from './scenarios';
import { WEB_CHALLENGES, type WebChallengeEntry } from './web-challenges';
import {
  splitWebChallenge,
  validateWebChallenges,
  webChallengeFile,
  webChallengeGradingFile,
  type WebChallengeSummary,
} from '@pracstack/content-model';

/** Relative path → JSON-serialisable value. */
export type FileSet = ReadonlyMap<string, unknown>;

export interface ContentBuild {
  readonly issues: readonly ValidationIssue[];
  readonly contentVersion: string;
  /** Safe to serve to browsers. */
  readonly publicFiles: FileSet;
  /** Grading data. Must never be served to browsers. */
  readonly privateFiles: FileSet;
}

export interface BuildOptions {
  readonly challenges?: readonly ChallengeEntry[];
  readonly tracks?: readonly TrackSource[];
  /** PostgreSQL engine for SQL checks. When omitted, one is started and stopped for this build. */
  readonly sqlEngine?: SqlEngine;
  /** Engines for other dialects (Oracle needs a running database; see oracle-container). */
  readonly sqlEngines?: Partial<Record<SqlDialect, SqlEngine>>;
  /** Job roles and the taxonomy (defaults: the real ones). */
  readonly roles?: readonly JobRole[];
  readonly taxonomy?: readonly TaxonomyTerm[];
  readonly scenarios?: readonly ScenarioSource[];
  readonly webChallenges?: readonly WebChallengeEntry[];
}

/** Validates all content (including running code and SQL) and produces the output files. */
export async function buildContent(options: BuildOptions = {}): Promise<ContentBuild> {
  const challenges = options.challenges ?? CHALLENGES;
  const tracks = options.tracks ?? TRACKS;
  const sources = challenges.map((c) => c.source);
  const engine = options.sqlEngine ?? new SqlCheckPool();
  let sqlIssues: ValidationIssue[];
  // Reference results, saved with the grading data (see QuestionAnswer's `expected`).
  const referenceResults = new Map<string, SqlResultSet[]>();
  try {
    sqlIssues = await checkSqlQuestions(
      tracks,
      { ...options.sqlEngines, postgresql: engine },
      referenceResults,
    );
  } finally {
    if (!options.sqlEngine) await engine.close();
  }
  const issues: ValidationIssue[] = [
    ...validateChallenges(sources),
    ...validateTracks(tracks),
    ...checkReferenceSolutions(challenges),
    ...checkTypeScriptSnippets(tracks),
    ...sqlIssues,
  ];

  // Enterprise Scenarios: public scenarios, private answer keys.
  const scenarios = options.scenarios ?? SCENARIOS;

  // Job Role Preparation: public (no secrets), checked against the real skills and challenges.
  const roles = options.roles ?? ROLES;
  const taxonomy = options.taxonomy ?? TAXONOMY;
  const contentIds = {
    skillIds: new Set(tracks.flatMap((t) => t.topics.flatMap((x) => x.skills.map((s) => s.id)))),
    challengeIds: new Set(sources.map((s) => s.challenge.id)),
    scenarioIds: new Set(scenarios.map((s) => s.id)),
    challengeLanguages: new Map(
      sources.map((s) => [s.challenge.id, Object.keys(s.challenge.languages) as LanguageId[]]),
    ),
  };
  issues.push(
    ...validateTaxonomy(taxonomy, {
      ...contentIds,
      technologyIds: new Set(tracks.map((t) => t.id)),
    }),
    ...validateRoles(roles, { ...contentIds, termIds: new Set(taxonomy.map((t) => t.id)) }),
  );

  issues.push(
    ...validateScenarios(scenarios, { challenges: sources, skillIds: contentIds.skillIds }),
  );

  const publicFiles = new Map<string, unknown>();
  publicFiles.set(ROLES_FILE, { roles } satisfies RolesFile);
  publicFiles.set(TAXONOMY_FILE, { terms: taxonomy } satisfies TaxonomyFile);
  const privateFiles = new Map<string, unknown>();

  const scenarioSummaries: ScenarioSummary[] = [];
  for (const source of scenarios) {
    const { scenario, grading } = splitScenario(source);
    scenarioSummaries.push(scenarioSummary(scenario));
    publicFiles.set(scenarioFile(scenario.id, scenario.version), scenario);
    privateFiles.set(`scenarios/${scenario.id}@${scenario.version}.grading.json`, grading);
  }
  publicFiles.set(SCENARIOS_FILE, { scenarios: scenarioSummaries } satisfies ScenariosFile);

  const summaries: ChallengeSummary[] = [];
  for (const source of sources) {
    const { summary, challenge, grading } = splitChallenge(source);
    summaries.push(summary);
    publicFiles.set(challengeFile(challenge.id, challenge.version), challenge);
    privateFiles.set(`challenges/${challenge.id}@${challenge.version}.grading.json`, grading);
  }

  // Company Interview Prep: private, served by the API to signed-in users only.
  const companies = buildCompanies({ challenges: summaries, tracks, planned: PLANNED_CHALLENGES });
  issues.push(...companies.issues);
  for (const [path, value] of companies.files) privateFiles.set(path, value);

  const technologies: (Technology & { skillCount: number })[] = [];
  for (const track of tracks) {
    const { catalog, questionsBySkill } = splitTrack(track);
    technologies.push({ ...catalog.technology, skillCount: catalog.skills.length });
    publicFiles.set(trackFile(track.id), catalog);
    for (const [skillId, questions] of Object.entries(questionsBySkill)) {
      privateFiles.set(
        `skill-mastery/${track.id}/${skillId}.questions.json`,
        questions.map((q) => withReferenceResults(q, referenceResults)),
      );
    }
  }

  // Web Development Challenges: summaries are public; details, starter projects,
  // tests and references are private (the API serves details after access checks).
  const webSources = (options.webChallenges ?? WEB_CHALLENGES).map((w) => w.source);
  issues.push(...validateWebChallenges(webSources));
  const webSummaries: WebChallengeSummary[] = [];
  for (const source of webSources) {
    const { challenge, summary, projects, grading } = splitWebChallenge(source);
    webSummaries.push(summary);
    privateFiles.set(webChallengeFile(challenge.id, challenge.version), { challenge, projects });
    privateFiles.set(webChallengeGradingFile(challenge.id, challenge.version), grading);
  }

  const contentVersion = hashFiles([...publicFiles, ...privateFiles]);
  publicFiles.set(MANIFEST_FILE, {
    schemaVersion: SCHEMA_VERSION,
    contentVersion,
    challenges: summaries,
    technologies,
    plannedChallenges: PLANNED_CHALLENGES,
    preparation: { rolesFile: ROLES_FILE, taxonomyFile: TAXONOMY_FILE },
    scenariosFile: SCENARIOS_FILE,
    webChallenges: webSummaries,
  } satisfies PublicManifest);
  privateFiles.set(MANIFEST_FILE, {
    schemaVersion: SCHEMA_VERSION,
    contentVersion,
    webChallenges: webSummaries.map((w) => ({ id: w.id, version: w.version })),
  });

  return { issues, contentVersion, publicFiles, privateFiles };
}

/** Adds the recorded reference results to a SQL question's answer key. */
function withReferenceResults(
  q: SplitQuestion,
  recorded: ReadonlyMap<string, SqlResultSet[]>,
): SplitQuestion {
  const answer = q.grading.answer;
  const expected = recorded.get(questionKey(q.question));
  if (answer.format !== 'sql-query' || !expected) return q;
  return { ...q, grading: { ...q.grading, answer: { ...answer, expected } } };
}

function hashFiles(files: readonly (readonly [string, unknown])[]): string {
  const hash = createHash('sha256');
  for (const [path, value] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(path).update('\0').update(JSON.stringify(value)).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}
