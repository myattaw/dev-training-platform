import type { Provider } from '@angular/core';
import {
  type Challenge,
  callTests,
  type PublicManifest,
  SCHEMA_VERSION,
  splitChallenge,
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
  technology: { id: 'typescript', name: 'TypeScript', description: 'Types for JavaScript.' },
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
