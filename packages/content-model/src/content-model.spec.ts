import { describe, expect, it } from 'vitest';
import { type ChallengeSource, callTests, operationTests } from './challenge';
import type { QuestionSource, TrackSource } from './skill';
import { splitChallenge, splitTrack } from './split';
import { validateChallenges, validateTracks } from './validate';

const challenge = (overrides: Partial<ChallengeSource['challenge']> = {}): ChallengeSource => ({
  challenge: {
    id: 'add',
    version: 1,
    title: 'Add',
    summary: 'Add two numbers.',
    category: 'arrays',
    difficulty: 'easy',
    tags: ['math'],
    instructions: [{ kind: 'paragraph', text: 'Implement `add`.' }],
    languages: {
      typescript: {
        entryPoint: 'add',
        starterCode: 'export function add(a: number, b: number): number {}',
      },
    },
    visibleTests: callTests<(a: number, b: number) => number>([
      { description: 'one plus one', input: [1, 1], expected: 2 },
    ]),
    ...overrides,
  },
  hiddenTests: callTests<(a: number, b: number) => number>([
    { description: 'negatives', input: [-1, -2], expected: -3 },
  ]),
});

const mcq = (overrides: Partial<Extract<QuestionSource, { format: 'multiple-choice' }>> = {}) =>
  ({
    id: 'q-one',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: [{ kind: 'paragraph', text: 'Pick one.' }],
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['Think.'],
    explanation: [{ kind: 'paragraph', text: 'Because A is right.' }],
    ...overrides,
  }) satisfies QuestionSource;

const track = (questions: QuestionSource[]): TrackSource => ({
  id: 'ts',
  name: 'TypeScript',
  description: 'Types.',
  topics: [
    {
      id: 'basics',
      name: 'Basics',
      description: 'Basics.',
      skills: [{ id: 'unions', name: 'Unions', description: 'Union types.', questions }],
    },
  ],
});

const three = (q: QuestionSource): QuestionSource[] => [
  q,
  { ...q, id: `${q.id}-2` },
  { ...q, id: `${q.id}-3` },
];

const errors = (issues: { severity: string; message: string }[]) =>
  issues.filter((i) => i.severity === 'error').map((i) => i.message);

describe('validateChallenges', () => {
  it('accepts a valid challenge', () => {
    expect(validateChallenges([challenge()])).toEqual([]);
  });

  it('rejects bad ids, duplicate ids and bad versions', () => {
    const issues = validateChallenges([
      challenge({ id: 'Bad_Id', version: 0 }),
      challenge(),
      challenge(),
    ]);
    expect(errors(issues)).toEqual(
      expect.arrayContaining([
        'duplicate challenge id',
        'id "Bad_Id" must be lowercase kebab-case',
        'version must be a positive integer (got 0)',
      ]),
    );
  });

  it('requires starter code to export the entry point', () => {
    const issues = validateChallenges([
      challenge({
        languages: { typescript: { entryPoint: 'add', starterCode: 'function add() {}' } },
      }),
    ]);
    expect(errors(issues)).toContain('starter code must export "add"');
  });

  it('requires hidden tests and rejects mixed test kinds', () => {
    const source: ChallengeSource = {
      ...challenge(),
      hiddenTests: [],
    };
    expect(errors(validateChallenges([source]))).toContain(
      'at least one hidden test is required for server-side grading',
    );

    type Counter = new () => { inc(): number };
    const mixed: ChallengeSource = {
      ...challenge(),
      hiddenTests: operationTests<Counter>([
        {
          description: 'counts',
          constructorArgs: [],
          steps: [{ call: 'inc', args: [], expected: 1 }],
        },
      ]),
    };
    expect(errors(validateChallenges([mixed]))).toContain(
      'all tests must be the same kind (either "call" or "operations")',
    );
  });

  it('warns when a hidden test duplicates a visible one', () => {
    const source: ChallengeSource = {
      ...challenge(),
      hiddenTests: challenge().challenge.visibleTests.map((t) => ({ ...t, description: 'copy' })),
    };
    expect(validateChallenges([source])).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: 'duplicates a visible test, so it hides nothing',
      }),
    );
  });

  it('rejects unbalanced backticks in instructions', () => {
    const issues = validateChallenges([
      challenge({ instructions: [{ kind: 'paragraph', text: 'Use `add' }] }),
    ]);
    expect(errors(issues)).toContain('unbalanced backticks');
  });
});

describe('validateTracks', () => {
  it('accepts a valid track (warning only for missing difficulty levels)', () => {
    const issues = validateTracks([track(three(mcq()))]);
    expect(errors(issues)).toEqual([]);
    expect(issues[0]?.message).toContain('no questions at difficulty 2, 3, 4, 5');
  });

  it('requires a minimum number of questions per skill', () => {
    expect(errors(validateTracks([track([mcq()])]))).toContain('needs at least 3 questions');
  });

  it('checks multiple-choice answer keys', () => {
    const issues = validateTracks([
      track([
        mcq({ id: 'x1', answer: { correct: ['z'] } }),
        mcq({ id: 'x2', answer: { correct: ['a', 'b'] } }),
        mcq({
          id: 'x3',
          options: [
            { id: 'a', text: 'A' },
            { id: 'a', text: 'B' },
          ],
        }),
      ]),
    ]);
    expect(errors(issues)).toEqual(
      expect.arrayContaining([
        'correct answer "z" is not an option',
        'single-selection questions need exactly one correct option',
        'duplicate option id "a"',
      ]),
    );
  });

  it('checks that fill-in-blank answers match the template', () => {
    const blank: QuestionSource = {
      id: 'blank',
      version: 1,
      difficulty: 2,
      format: 'fill-in-blank',
      prompt: [{ kind: 'paragraph', text: 'Fill it.' }],
      template: { language: 'typescript', source: 'let x: {{blank:type}} = 1;' },
      answer: { blanks: { kind: { accepted: ['number'] } } },
      hints: [],
      explanation: [{ kind: 'paragraph', text: 'Numbers.' }],
    };
    const issues = validateTracks([track(three(blank))]);
    expect(errors(issues)).toEqual(
      expect.arrayContaining([
        'blank "type" has no accepted answers',
        'answer for unknown blank "kind"',
      ]),
    );
  });

  it('rejects question ids reused across skills', () => {
    const t = track(three(mcq()));
    const twice: TrackSource = { ...t, topics: [...t.topics, { ...t.topics[0]!, id: 'other' }] };
    expect(errors(validateTracks([twice]))).toEqual(
      expect.arrayContaining(['duplicate question id', 'duplicate skill id']),
    );
  });
});

describe('splitChallenge', () => {
  it('keeps hidden tests out of the public challenge and summary', () => {
    const { challenge: pub, summary, grading } = splitChallenge(challenge());
    expect(JSON.stringify([pub, summary])).not.toContain('negatives');
    expect(grading.hiddenTests).toHaveLength(1);
    expect(grading.limits).toEqual({ timeoutMs: 5000, memoryMb: 256, outputKb: 64 });
    expect(summary).toMatchObject({ languages: ['typescript'], visibleTestCount: 1 });
  });

  it('whitelists public fields, so unknown authoring fields stay private', () => {
    const source = challenge();
    const withExtra = {
      ...source,
      challenge: { ...source.challenge, referenceSolution: 'SECRET' },
    };
    expect(JSON.stringify(splitChallenge(withExtra))).not.toContain('SECRET');
  });
});

describe('splitTrack', () => {
  it('publishes the catalog without questions, and keeps answers, hints and explanations private', () => {
    const { catalog, questionsBySkill } = splitTrack(track(three(mcq())));
    expect(catalog.skills).toEqual([
      {
        id: 'unions',
        topicId: 'basics',
        name: 'Unions',
        description: 'Union types.',
        questionCount: 3,
      },
    ]);
    expect(JSON.stringify(catalog)).not.toContain('Pick one.');

    const [first] = questionsBySkill['unions']!;
    expect(first!.question).not.toHaveProperty('answer');
    expect(first!.question).not.toHaveProperty('hints');
    expect(first!.question).not.toHaveProperty('explanation');
    expect(first!.question).toMatchObject({ skillId: 'unions', hintCount: 1 });
    expect(first!.grading).toMatchObject({
      questionId: 'q-one',
      answer: { format: 'multiple-choice', correct: ['a'] },
    });
  });
});
