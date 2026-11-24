import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Challenge,
  challengeFile,
  type ChallengeGrading,
  COMPANY_INDEX_FILE,
  type CompanyContent,
  companyFile,
  type CompanyIndexFile,
  type JobRole,
  type PlannedChallenge,
  MANIFEST_FILE,
  type RolesFile,
  type Scenario,
  scenarioFile,
  type ScenarioGrading,
  type ScenariosFile,
  type TaxonomyFile,
  type PublicManifest,
  type Skill,
  type SplitQuestion,
  trackFile,
  type TrackCatalog,
} from '@pracstack/content-model';

/**
 * The content the API needs: the public catalogs plus the private question
 * bank (answers, hints, explanations). Loaded once at startup.
 */
export interface ContentSource {
  readonly contentVersion: string;
  hasTechnology(technologyId: string): boolean;
  findSkill(skillId: string): { readonly technologyId: string; readonly skill: Skill } | undefined;
  /** The ids of a technology's skills. */
  skillIds(technologyId: string): readonly string[];
  questions(skillId: string): readonly SplitQuestion[];
  findQuestion(questionId: string): SplitQuestion | undefined;
  /** A coding challenge with its private grading data (hidden tests). */
  findChallenge(challengeId: string): ChallengeWithGrading | undefined;
  /** Company search index and data sources. Private: served to signed-in users. */
  companyIndex(): CompanyIndexFile;
  findCompany(companyId: string): CompanyContent | undefined;
  /** Announced challenges (Coming soon); metadata only. */
  findPlannedChallenge(id: string): PlannedChallenge | undefined;
  /** Job roles (public content). */
  findRole(id: string): JobRole | undefined;
  /** Whether a taxonomy term id exists (saved plans store term ids). */
  hasTerm(termId: string): boolean;
  /** An Enterprise Scenario with its private answer keys. */
  findScenario(id: string): ScenarioWithGrading | undefined;
  /** Scenario ids, in catalog order. */
  scenarioIds(): readonly string[];
}

export interface ScenarioWithGrading {
  readonly scenario: Scenario;
  readonly grading: ScenarioGrading;
}

/** Job roles and taxonomy term ids, for validating preparation choices. */
export interface PreparationContent {
  readonly roles: readonly JobRole[];
  readonly termIds: readonly string[];
}

const NO_PREPARATION: PreparationContent = { roles: [], termIds: [] };

export interface CompanyData {
  readonly index: CompanyIndexFile;
  readonly companies: readonly CompanyContent[];
}

const NO_COMPANIES: CompanyData = { index: { sources: [], companies: [] }, companies: [] };

export interface ChallengeWithGrading {
  readonly challenge: Challenge;
  readonly grading: ChallengeGrading;
}

export function createContentSource(
  contentVersion: string,
  catalogs: readonly TrackCatalog[],
  questionsBySkill: Readonly<Record<string, readonly SplitQuestion[]>>,
  challenges: readonly ChallengeWithGrading[] = [],
  companies: CompanyData = NO_COMPANIES,
  planned: readonly PlannedChallenge[] = [],
  preparation: PreparationContent = NO_PREPARATION,
  scenarios: readonly ScenarioWithGrading[] = [],
): ContentSource {
  const scenarioMap = new Map(scenarios.map((s) => [s.scenario.id, s]));
  const roleMap = new Map(preparation.roles.map((r) => [r.id, r]));
  const termIds = new Set(preparation.termIds);
  const companyMap = new Map(companies.companies.map((c) => [c.company.id, c]));
  const plannedMap = new Map(planned.map((p) => [p.id, p]));
  const challengeMap = new Map(challenges.map((c) => [c.challenge.id, c]));
  const skills = new Map<string, { technologyId: string; skill: Skill }>();
  for (const catalog of catalogs) {
    for (const skill of catalog.skills) {
      skills.set(skill.id, { technologyId: catalog.technology.id, skill });
    }
  }
  const questions = new Map<string, SplitQuestion>();
  for (const list of Object.values(questionsBySkill)) {
    for (const q of list) questions.set(q.question.id, q);
  }
  const technologies = new Set(catalogs.map((c) => c.technology.id));

  return {
    contentVersion,
    hasTechnology: (id) => technologies.has(id),
    findSkill: (id) => skills.get(id),
    skillIds: (technologyId) =>
      [...skills.entries()].filter(([, s]) => s.technologyId === technologyId).map(([id]) => id),
    questions: (skillId) => questionsBySkill[skillId] ?? [],
    findQuestion: (id) => questions.get(id),
    findChallenge: (id) => challengeMap.get(id),
    companyIndex: () => companies.index,
    findCompany: (id) => companyMap.get(id),
    findPlannedChallenge: (id) => plannedMap.get(id),
    findRole: (id) => roleMap.get(id),
    hasTerm: (id) => termIds.has(id),
    findScenario: (id) => scenarioMap.get(id),
    scenarioIds: () => scenarios.map((s) => s.scenario.id),
  };
}

/** Reads the generated content (`npm run content:build`) from `content/dist`. */
export function loadContentSource(contentDist: string): ContentSource {
  const read = <T>(...parts: string[]): T =>
    JSON.parse(readFileSync(join(contentDist, ...parts), 'utf8')) as T;

  let manifest: PublicManifest;
  try {
    manifest = read<PublicManifest>('public', MANIFEST_FILE);
  } catch {
    throw new Error(`No generated content in ${contentDist}. Run "npm run content:build" first.`);
  }

  const catalogs = manifest.technologies.map((t) => read<TrackCatalog>('public', trackFile(t.id)));
  const questionsBySkill: Record<string, SplitQuestion[]> = {};
  for (const catalog of catalogs) {
    const dir = join(contentDist, 'private', 'skill-mastery', catalog.technology.id);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.questions.json'))) {
      questionsBySkill[file.replace(/\.questions\.json$/, '')] = read<SplitQuestion[]>(
        'private',
        'skill-mastery',
        catalog.technology.id,
        file,
      );
    }
  }
  const challenges = manifest.challenges.map((summary) => ({
    challenge: read<Challenge>('public', challengeFile(summary.id, summary.version)),
    grading: read<ChallengeGrading>(
      'private',
      'challenges',
      `${summary.id}@${summary.version}.grading.json`,
    ),
  }));
  let companies = NO_COMPANIES;
  if (existsSync(join(contentDist, 'private', COMPANY_INDEX_FILE))) {
    const index = read<CompanyIndexFile>('private', COMPANY_INDEX_FILE);
    companies = {
      index,
      companies: index.companies.map((c) => read<CompanyContent>('private', companyFile(c.id))),
    };
  }
  let preparation = NO_PREPARATION;
  if (manifest.preparation) {
    preparation = {
      roles: read<RolesFile>('public', manifest.preparation.rolesFile).roles,
      termIds: read<TaxonomyFile>('public', manifest.preparation.taxonomyFile).terms.map(
        (t) => t.id,
      ),
    };
  }
  let scenarios: ScenarioWithGrading[] = [];
  if (manifest.scenariosFile) {
    scenarios = read<ScenariosFile>('public', manifest.scenariosFile).scenarios.map((s) => ({
      scenario: read<Scenario>('public', scenarioFile(s.id, s.version)),
      grading: read<ScenarioGrading>('private', 'scenarios', `${s.id}@${s.version}.grading.json`),
    }));
  }
  return createContentSource(
    manifest.contentVersion,
    catalogs,
    questionsBySkill,
    challenges,
    companies,
    manifest.plannedChallenges ?? [],
    preparation,
    scenarios,
  );
}
