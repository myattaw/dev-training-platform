import { executeTests } from '@pracstack/challenge-runtime';
import type { CodeRunner, CodeRunRequest, CodeRunResult } from '@pracstack/code-runner';
import {
  callTests,
  type ChallengeSource,
  type CompanyContent,
  type CompanyIndexEntry,
  type DataSource,
  type PlannedChallenge,
  splitChallenge,
  splitTrack,
} from '@pracstack/content-model';
import { createContentSource } from '../content/content-source';
import { FIXTURE_TRACK } from './fixtures';

export const SOURCE: DataSource = {
  id: 'lc-companywise',
  name: 'Test source',
  url: 'https://github.com/example/source',
  provider: 'LeetCode',
  providerUrl: 'https://leetcode.com',
  snapshotDate: '2026-07-12',
  license: { status: 'unverified', note: 'Test.' },
  bulkImportAllowed: false,
};

/** An owned, practisable challenge. */
export const DOUBLE: ChallengeSource = {
  challenge: {
    id: 'double',
    version: 1,
    title: 'Double',
    summary: 'Double a number.',
    category: 'arrays',
    difficulty: 'easy',
    tags: ['math'],
    instructions: [{ kind: 'paragraph', text: 'Double it.' }],
    languages: {
      typescript: { entryPoint: 'double', starterCode: 'export function double(n: number) {}' },
    },
    visibleTests: callTests<(n: number) => number>([
      { description: 'two', input: [2], expected: 4 },
    ]),
  },
  hiddenTests: callTests<(n: number) => number>([
    { description: 'hidden', input: [-7], expected: -14 },
  ]),
};

export const PLANNED: PlannedChallenge = {
  id: 'premium-editor',
  title: 'Premium Editor',
  summary: 'A planned Pro challenge.',
  category: 'data-structures',
  difficulty: 'hard',
  tags: ['text-editing'],
  availability: 'coming-soon',
  access: 'pro',
};

const IMPORTED_AT = '2026-11-22T00:00:00.000Z';

export const LIBERTY: CompanyContent = {
  company: {
    id: 'liberty-mutual',
    displayName: 'Liberty Mutual',
    aliases: ['Liberty Mutual Insurance'],
  },
  references: [
    {
      id: 'lc-companywise:2296',
      sourceId: 'lc-companywise',
      externalId: '2296',
      title: 'Design a Text Editor',
      externalUrl: 'https://leetcode.com/problems/design-a-text-editor',
      difficulty: 'hard',
      acceptanceRate: 51.1,
      editorialTags: ['text-editing', 'cursor-state'],
    },
  ],
  associations: (['all', 'more-than-six-months'] as const).map((window) => ({
    companyId: 'liberty-mutual',
    problemId: 'lc-companywise:2296',
    sourceId: 'lc-companywise',
    window,
    reportedFrequency: 100,
    sourceSnapshotDate: '2026-07-12',
    importedAt: IMPORTED_AT,
  })),
  recommendations: [
    {
      companyId: 'liberty-mutual',
      challengeId: 'double',
      sourceProblemId: 'lc-companywise:2296',
      reason: 'Practises arithmetic.',
      similarityTags: ['math'],
      confidence: 'high',
      origin: 'curated',
      editorialReviewStatus: 'reviewed',
    },
    {
      companyId: 'liberty-mutual',
      challengeId: 'premium-editor',
      reason: 'Practises text editing.',
      similarityTags: ['text-editing'],
      confidence: 'medium',
      origin: 'curated',
      editorialReviewStatus: 'reviewed',
    },
  ],
  preparationPaths: [
    {
      id: 'liberty-path',
      companyId: 'liberty-mutual',
      title: 'Path',
      summary: 'Steps.',
      steps: [
        {
          title: 'Solve Double',
          description: 'Do it.',
          target: { kind: 'challenge', challengeId: 'double' },
        },
        { title: 'Timed', description: 'Against the clock.', target: { kind: 'timed-session' } },
      ],
    },
  ],
  sourceRowCount: 1,
};

const entry = (id: string, displayName: string, aliases: string[] = []): CompanyIndexEntry => ({
  id,
  displayName,
  aliases,
  searchText: [displayName, ...aliases].map((n) => n.toLowerCase()).join(' | '),
  questionCount: 1,
});

/** Liberty Mutual plus 30 filler companies (for paging and letters). */
export function companyIndex(): CompanyIndexEntry[] {
  const fillers = Array.from({ length: 30 }, (_, i) =>
    entry(`acme-${String(i).padStart(2, '0')}`, `Acme ${String(i).padStart(2, '0')}`),
  );
  return [
    ...fillers,
    {
      ...entry('liberty-mutual', 'Liberty Mutual', ['Liberty Mutual Insurance']),
      sourceRowCount: 1,
    },
    entry('3m', '3M'),
  ].sort((a, b) => a.displayName.localeCompare(b.displayName, 'en'));
}

export function companyContent() {
  const { catalog, questionsBySkill } = splitTrack(FIXTURE_TRACK);
  const { challenge, grading } = splitChallenge(DOUBLE);
  const index = companyIndex();
  return createContentSource(
    'test',
    [catalog],
    questionsBySkill,
    [{ challenge, grading }],
    {
      index: { sources: [SOURCE], companies: index },
      companies: [
        LIBERTY,
        ...index
          .filter((c) => c.id !== 'liberty-mutual')
          .map((c) => ({
            ...LIBERTY,
            company: { id: c.id, displayName: c.displayName, aliases: [] },
            associations: LIBERTY.associations.map((a) => ({ ...a, companyId: c.id })),
            recommendations: [],
            preparationPaths: [],
          })),
      ],
    },
    [PLANNED],
  );
}

/** Runs `correct` as a right answer and `wrong` as a wrong one. */
export class DoubleRunner implements CodeRunner {
  readonly requests: CodeRunRequest[] = [];
  run(request: CodeRunRequest): Promise<CodeRunResult> {
    this.requests.push(request);
    const fn = request.code.trim() === 'correct' ? (n: number) => n * 2 : (n: number) => n;
    const result = executeTests({ double: fn }, request.entryPoint, request.tests);
    return Promise.resolve(
      result.kind === 'completed'
        ? { kind: 'completed', outcomes: result.outcomes, logs: [] }
        : { ...result, logs: [] },
    );
  }
}
