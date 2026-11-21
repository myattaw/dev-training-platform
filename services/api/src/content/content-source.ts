import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Challenge,
  challengeFile,
  type ChallengeGrading,
  MANIFEST_FILE,
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
  questions(skillId: string): readonly SplitQuestion[];
  findQuestion(questionId: string): SplitQuestion | undefined;
  /** A coding challenge with its private grading data (hidden tests). */
  findChallenge(challengeId: string): ChallengeWithGrading | undefined;
}

export interface ChallengeWithGrading {
  readonly challenge: Challenge;
  readonly grading: ChallengeGrading;
}

export function createContentSource(
  contentVersion: string,
  catalogs: readonly TrackCatalog[],
  questionsBySkill: Readonly<Record<string, readonly SplitQuestion[]>>,
  challenges: readonly ChallengeWithGrading[] = [],
): ContentSource {
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
    questions: (skillId) => questionsBySkill[skillId] ?? [],
    findQuestion: (id) => questions.get(id),
    findChallenge: (id) => challengeMap.get(id),
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
  return createContentSource(manifest.contentVersion, catalogs, questionsBySkill, challenges);
}
