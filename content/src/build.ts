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
  validateTracks,
  type ValidationIssue,
} from '@pracstack/content-model';
import { CHALLENGES, type ChallengeEntry } from './challenges';
import { checkReferenceSolutions } from './checks/reference-solutions';
import { ChildProcessSqlEngine, type SqlEngine } from '@pracstack/sql-engine';
import { checkSqlQuestions } from './checks/sql-questions';
import { checkTypeScriptSnippets } from './checks/typescript-snippets';
import { TRACKS } from './skill-mastery';

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
  /** Engine for SQL checks. When omitted, one is started and stopped for this build. */
  readonly sqlEngine?: SqlEngine;
}

/** Validates all content (including running code and SQL) and produces the output files. */
export async function buildContent(options: BuildOptions = {}): Promise<ContentBuild> {
  const challenges = options.challenges ?? CHALLENGES;
  const tracks = options.tracks ?? TRACKS;
  const sources = challenges.map((c) => c.source);
  const engine = options.sqlEngine ?? new ChildProcessSqlEngine();
  let sqlIssues: ValidationIssue[];
  try {
    sqlIssues = await checkSqlQuestions(tracks, engine);
  } finally {
    if (!options.sqlEngine) await engine.close();
  }
  const issues = [
    ...validateChallenges(sources),
    ...validateTracks(tracks),
    ...checkReferenceSolutions(challenges),
    ...checkTypeScriptSnippets(tracks),
    ...sqlIssues,
  ];

  const publicFiles = new Map<string, unknown>();
  const privateFiles = new Map<string, unknown>();

  const summaries: ChallengeSummary[] = [];
  for (const source of sources) {
    const { summary, challenge, grading } = splitChallenge(source);
    summaries.push(summary);
    publicFiles.set(challengeFile(challenge.id, challenge.version), challenge);
    privateFiles.set(`challenges/${challenge.id}@${challenge.version}.grading.json`, grading);
  }

  const technologies: (Technology & { skillCount: number })[] = [];
  for (const track of tracks) {
    const { catalog, questionsBySkill } = splitTrack(track);
    technologies.push({ ...catalog.technology, skillCount: catalog.skills.length });
    publicFiles.set(trackFile(track.id), catalog);
    for (const [skillId, questions] of Object.entries(questionsBySkill)) {
      privateFiles.set(`skill-mastery/${track.id}/${skillId}.questions.json`, questions);
    }
  }

  const contentVersion = hashFiles([...publicFiles, ...privateFiles]);
  publicFiles.set(MANIFEST_FILE, {
    schemaVersion: SCHEMA_VERSION,
    contentVersion,
    challenges: summaries,
    technologies,
  } satisfies PublicManifest);
  privateFiles.set(MANIFEST_FILE, { schemaVersion: SCHEMA_VERSION, contentVersion });

  return { issues, contentVersion, publicFiles, privateFiles };
}

function hashFiles(files: readonly (readonly [string, unknown])[]): string {
  const hash = createHash('sha256');
  for (const [path, value] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(path).update('\0').update(JSON.stringify(value)).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}
