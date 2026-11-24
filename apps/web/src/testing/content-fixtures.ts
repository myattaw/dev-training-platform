import type { Provider } from '@angular/core';
import {
  type Challenge,
  callTests,
  type JobRole,
  type PublicManifest,
  type RolesFile,
  type Scenario,
  scenarioSummary,
  type ScenariosFile,
  SCHEMA_VERSION,
  splitChallenge,
  type TaxonomyFile,
  type TaxonomyTerm,
  type TrackCatalog,
} from '@pracstack/content-model';
import { ContentRepository } from '../app/core/content/content-repository';

/**
 * Small, stable test fixtures. Unit tests use these instead of the real
 * content, so editing content never breaks UI tests.
 */
const challenge = (
  id: string,
  title: string,
  overrides: Partial<Challenge> & Pick<Challenge, 'category' | 'difficulty'>,
): Challenge => ({
  id,
  version: 1,
  title,
  summary: `${title} summary.`,
  tags: [],
  instructions: [{ kind: 'paragraph', text: `Solve ${title}.` }],
  languages: {
    typescript: {
      entryPoint: 'solve',
      starterCode: 'export function solve(input: string): string {\n  return input;\n}\n',
    },
  },
  visibleTests: callTests<(input: string) => string>([
    { description: 'returns the input', input: ['a'], expected: 'a' },
  ]),
  ...overrides,
});

export const FIXTURE_CHALLENGES: readonly Challenge[] = [
  challenge('pangram', 'Pangram', { category: 'strings', difficulty: 'easy', tags: ['sets'] }),
  challenge('reverse-string', 'Reverse String', { category: 'strings', difficulty: 'easy' }),
  challenge('balanced-brackets', 'Balanced Brackets', {
    category: 'parsing',
    difficulty: 'medium',
    tags: ['stacks'],
  }),
  challenge('merge-intervals', 'Merge Intervals', { category: 'arrays', difficulty: 'medium' }),
];

export const FIXTURE_TRACK: TrackCatalog = {
  technology: {
    id: 'typescript',
    name: 'TypeScript',
    description: 'Types for JavaScript.',
    category: 'languages',
  },
  topics: [
    { id: 'basics', technologyId: 'typescript', name: 'Basics', description: 'The basics.' },
    { id: 'narrowing', technologyId: 'typescript', name: 'Narrowing', description: 'Narrowing.' },
  ],
  skills: [
    {
      id: 'primitives',
      topicId: 'basics',
      name: 'Primitive types',
      description: 'Primitives.',
      questionCount: 5,
    },
    {
      id: 'unions',
      topicId: 'basics',
      name: 'Union types',
      description: 'Unions.',
      prerequisites: ['primitives'],
      questionCount: 5,
    },
    {
      id: 'typeof',
      topicId: 'narrowing',
      name: 'typeof narrowing',
      description: 'typeof.',
      prerequisites: ['unions'],
      questionCount: 5,
    },
  ],
};

export const FIXTURE_TAXONOMY: readonly TaxonomyTerm[] = [
  {
    id: 'typescript',
    label: 'TypeScript',
    category: 'language',
    aliases: [],
    practice: [
      { kind: 'skill', skillId: 'primitives' },
      { kind: 'skill', skillId: 'unions' },
    ],
    tracks: ['typescript'],
  },
  {
    id: 'csharp',
    label: 'C#',
    category: 'language',
    aliases: [],
    practice: [{ kind: 'challenge', challengeId: 'pangram', language: 'typescript' }],
  },
  {
    id: 'sql-server',
    label: 'SQL Server',
    category: 'database',
    aliases: [],
    variants: ['T-SQL'],
    practice: [],
    relatedPractice: [{ kind: 'skill', skillId: 'unions' }],
    gap: {
      notCovered: 'T-SQL is not practiced.',
      resources: [{ label: 'SQL Server docs', url: 'https://learn.microsoft.com/en-us/sql/' }],
    },
  },
  {
    id: 'azure-devops',
    label: 'Azure DevOps',
    category: 'devops',
    aliases: [],
    ambiguity: {
      aliases: ['ADO'],
      context: ['pipeline'],
      note: 'Only with pipeline words.',
    },
    matchCase: ['ADO'],
    practice: [],
    gap: { notCovered: 'Pipelines are not practiced.' },
  },
  {
    id: 'power-automate',
    label: 'Power Automate',
    category: 'business-apps',
    aliases: [],
    variants: ['Microsoft Flow'],
    practice: [],
    gap: { notCovered: 'Flows are not practiced.' },
    note: 'Formerly Microsoft Flow.',
  },
];

export const FIXTURE_ROLES: readonly JobRole[] = [
  {
    id: 'ts-developer',
    version: 1,
    status: 'available',
    title: 'TypeScript Developer',
    summary: 'Typed front-end code.',
    description: 'Writes TypeScript.',
    technologies: ['typescript'],
    competencies: [
      {
        id: 'basics',
        name: 'Basics',
        description: 'The basics.',
        activities: [
          { kind: 'skill', skillId: 'primitives' },
          { kind: 'skill', skillId: 'unions' },
        ],
      },
      {
        id: 'narrowing',
        name: 'Narrowing',
        description: 'Narrowing.',
        activities: [{ kind: 'skill', skillId: 'typeof' }],
      },
      {
        id: 'problems',
        name: 'Problem solving',
        description: 'Challenges.',
        activities: [
          { kind: 'challenge', challengeId: 'pangram', language: 'typescript' },
          { kind: 'challenge', challengeId: 'merge-intervals' },
        ],
      },
      { id: 'testing', name: 'Testing', description: 'Tests.', activities: [] },
    ],
  },
  {
    id: 'sql-developer',
    version: 1,
    status: 'coming-soon',
    title: 'SQL Server Developer',
    summary: 'T-SQL work.',
    technologies: ['sql-server', 'typescript'],
  },
];

/** A small mixed scenario: one challenge task, one question task. */
export const FIXTURE_SCENARIO: Scenario = {
  id: 'orders-api',
  version: 1,
  title: 'Orders API',
  summary: 'Fix the orders service.',
  difficulty: 'medium',
  estimatedMinutes: 30,
  technologies: ['C#'],
  relatedSkillIds: [],
  context: [{ kind: 'paragraph', text: 'The orders team needs help.' }],
  requirements: [{ kind: 'paragraph', text: 'Return 404 for unknown orders.' }],
  acceptanceCriteria: ['Unknown orders return 404.'],
  artifacts: [
    {
      id: 'log',
      title: 'Error log',
      description: 'From production.',
      snippet: { language: 'text', source: 'GET /orders/9 500' },
    },
  ],
  assessment: 'mixed',
  tasks: [
    {
      kind: 'challenge',
      id: 'build',
      title: 'Build the endpoint',
      brief: [{ kind: 'paragraph', text: 'Implement it.' }],
      challengeId: 'reverse-string',
      language: 'csharp',
    },
    {
      kind: 'question',
      id: 'status',
      title: 'Pick the status code',
      question: {
        id: 'orders-api-status',
        version: 1,
        skillId: 'scenario:orders-api',
        familyId: 'orders-api-status',
        difficulty: 2,
        prompt: [{ kind: 'paragraph', text: 'Which status for a missing order?' }],
        format: 'multiple-choice',
        options: [
          { id: 'a', text: '404' },
          { id: 'b', text: '500' },
        ],
        selection: 'single',
        hintCount: 0,
      },
    },
  ],
};

export class InMemoryContentRepository extends ContentRepository {
  constructor(
    private readonly challenges: readonly Challenge[] = FIXTURE_CHALLENGES,
    private readonly failure?: Error,
  ) {
    super();
  }

  override manifest(): Promise<PublicManifest> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve({
      schemaVersion: SCHEMA_VERSION,
      contentVersion: 'test',
      challenges: this.challenges.map(
        (c) => splitChallenge({ challenge: c, hiddenTests: [] }).summary,
      ),
      technologies: [{ ...FIXTURE_TRACK.technology, skillCount: FIXTURE_TRACK.skills.length }],
    });
  }

  override track(technologyId: string): Promise<TrackCatalog> {
    if (this.failure) return Promise.reject(this.failure);
    return technologyId === FIXTURE_TRACK.technology.id
      ? Promise.resolve(FIXTURE_TRACK)
      : Promise.reject(new Error(`No fixture track ${technologyId}`));
  }

  override roles(): Promise<RolesFile> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve({ roles: FIXTURE_ROLES });
  }

  override taxonomy(): Promise<TaxonomyFile> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve({ terms: FIXTURE_TAXONOMY });
  }

  override scenarios(): Promise<ScenariosFile> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve({ scenarios: [scenarioSummary(FIXTURE_SCENARIO)] });
  }

  override scenario(id: string, version: number): Promise<Scenario> {
    return id === FIXTURE_SCENARIO.id && version === FIXTURE_SCENARIO.version
      ? Promise.resolve(FIXTURE_SCENARIO)
      : Promise.reject(new Error(`No fixture scenario ${id}@${version}`));
  }

  override challenge(id: string, version: number): Promise<Challenge> {
    const found = this.challenges.find((c) => c.id === id && c.version === version);
    return found
      ? Promise.resolve(found)
      : Promise.reject(new Error(`No fixture ${id}@${version}`));
  }
}

export function provideTestContent(
  challenges: readonly Challenge[] = FIXTURE_CHALLENGES,
  failure?: Error,
): Provider {
  return {
    provide: ContentRepository,
    useValue: new InMemoryContentRepository(challenges, failure),
  };
}
