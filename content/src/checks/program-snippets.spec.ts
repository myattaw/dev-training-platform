import { DockerCodeRunner } from '@pracstack/code-runner';
import type { TrackSource } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { programBuilders } from '../skill-mastery/program-builders';
import { TRACKS } from '../skill-mastery';
import {
  checkProgramSnippets,
  collectProgramSnippets,
  PROGRAM_LANGUAGES,
  type ProgramRunner,
} from './program-snippets';

const skipDocker = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

const track = (questions: TrackSource['topics'][number]['skills'][number]['questions']) =>
  ({
    id: 't',
    name: 'T',
    category: 'languages',
    description: 'd',
    topics: [
      {
        id: 'top',
        name: 'Top',
        description: 'd',
        skills: [{ id: 's', name: 'S', description: 'd', questions }],
      },
    ],
  }) satisfies TrackSource;

/**
 * "Compiles" code without `ERROR`, prints the text after `print:`, and fails
 * with the text after `raise:`.
 */
const fakeRunner: ProgramRunner = {
  run: ({ code }) => {
    const raised = /raise:(\w+)/.exec(code)?.[1];
    return Promise.resolve(
      code.includes('ERROR')
        ? { kind: 'compile-error', diagnostics: [{ line: 1, message: 'bad syntax' }] }
        : {
            kind: 'completed',
            outcomes: [raised ? { kind: 'call', error: `${raised}: boom` } : { kind: 'call' }],
            logs: [/print:(\w*)/.exec(code)?.[1] ?? ''],
          },
    );
  },
};

const py = programBuilders('python');
const java = programBuilders('java');
const choiceBase = { correct: 'r', wrong: ['w'], why: 'w' };

describe('program snippet checks (logic)', () => {
  it('collects every kind of snippet, and only compiles Java without a main method', () => {
    const snippets = collectProgramSnippets([
      track([
        ...py.output('o', 1, [], [{ key: 'a', code: 'print:x', output: 'x', why: 'w' }]),
        ...py.outputChoice('oc', 1, 'h', [
          { key: 'a', code: 'print:x', correct: 'x', wrong: ['y'], why: 'w' },
        ]),
        ...java.codeChoice('cc', 1, 'h', [
          { key: 'a', question: 'q', code: 'class Dto {}', ...choiceBase },
        ]),
        ...py.fails('f', 1, 'h', [
          { key: 'a', question: 'q', code: 'raise:KeyError', error: 'KeyError', ...choiceBase },
        ]),
        ...py.whichCompile('wc', 1, 'h', [
          { key: 'a', question: 'q', options: ['ok', 'ERROR'], correct: ['ok'], why: 'w' },
        ]),
        ...py.blank('b', 1, 'h', [
          {
            key: 'a',
            prompt: 'p',
            template: 'x = {{blank:v}}',
            blanks: { v: ['1', '2'] },
            why: 'w',
          },
        ]),
      ]),
    ]);
    expect(
      snippets.map((s) => [
        s.path.split('/').pop(),
        s.keySaysCompiles,
        s.expectedOutput,
        s.expectedError,
      ]),
    ).toEqual([
      ['o-a', undefined, 'x', undefined],
      ['oc-a', undefined, 'x', undefined],
      ['cc-a', true, undefined, undefined],
      ['f-a', undefined, undefined, 'KeyError'],
      ['wc-a (option a: `ok`)', true, undefined, undefined],
      ['wc-a (option b: `ERROR`)', false, undefined, undefined],
      ['b-a (blank "v" = "1")', undefined, undefined, undefined],
      ['b-a (blank "v" = "2")', undefined, undefined, undefined],
    ]);
  });

  it('reports wrong outputs, unexpected errors, missing errors and wrong keys', async () => {
    const issues = await checkProgramSnippets(
      [
        track([
          ...py.output(
            'o',
            1,
            [],
            [
              { key: 'good', code: 'print:x', output: 'x', why: 'w' },
              { key: 'bad', code: 'print:y', output: 'x', why: 'w' },
              { key: 'throws', code: 'print:x raise:ValueError', output: 'x', why: 'w' },
            ],
          ),
          ...py.fails('f', 1, 'h', [
            { key: 'ran', question: 'q', code: 'print:x', error: 'KeyError', ...choiceBase },
            {
              key: 'other',
              question: 'q',
              code: 'raise:TypeError',
              error: 'KeyError',
              ...choiceBase,
            },
          ]),
          ...py.compiles('c', 1, 'h', [{ key: 'wrong', code: 'ERROR', compiles: true, why: 'w' }]),
        ]),
      ],
      fakeRunner,
    );
    expect(issues.map((i) => i.path.split('/').pop())).toEqual([
      'o-bad',
      'o-throws',
      'f-ran',
      'f-other',
      'c-wrong',
    ]);
  });
});

describe.skipIf(skipDocker)('Java, Python and Swift Skill Mastery questions (real runners)', () => {
  it('compile, run and match their answer keys', { timeout: 3_600_000 }, async () => {
    const runner = new DockerCodeRunner({
      maxConcurrent: 4,
      maxQueue: 100_000,
      // Content checks verify answer keys, not learner time limits (tested in
      // docker-runner.spec.ts): allow for container start-up when many specs run at once.
      limits: {
        java: { timeoutMs: 90_000 },
        python: { timeoutMs: 60_000 },
        swift: { timeoutMs: 120_000 },
      },
    });
    const status = await runner.check();
    if (!status.ok) {
      throw new Error(`${status.message} (set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip)`);
    }
    const issues = await checkProgramSnippets(TRACKS, runner, {
      concurrency: 4,
      languages: PROGRAM_LANGUAGES,
    });
    expect(issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
  });
});
