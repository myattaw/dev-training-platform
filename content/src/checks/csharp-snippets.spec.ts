import { DockerCodeRunner } from '@pracstack/code-runner';
import type { TrackSource } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { cs, text } from '../skill-mastery/helpers';
import { TRACKS } from '../skill-mastery';
import {
  checkCSharpSnippets,
  collectCSharpSnippets,
  type CSharpProgramRunner,
} from './csharp-snippets';

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

const base = {
  version: 1,
  difficulty: 1 as const,
  prompt: text('Q'),
  hints: [],
  explanation: text('E'),
};

/** A runner that "compiles" code without `ERROR` and prints the text after `print:`. */
const fakeRunner: CSharpProgramRunner = {
  run: ({ code }) =>
    Promise.resolve(
      code.includes('ERROR')
        ? { kind: 'compile-error', diagnostics: [{ line: 1, message: 'CS0000: bad' }] }
        : {
            kind: 'completed',
            outcomes: [code.includes('THROW') ? { kind: 'call', error: 'Boom' } : { kind: 'call' }],
            logs: [/print:(\w*)/.exec(code)?.[1] ?? ''],
          },
    ),
};

describe('C# snippet checks (logic)', () => {
  it('collects every kind of C# snippet, and ignores other languages', () => {
    const snippets = collectCSharpSnippets([
      track([
        {
          ...base,
          id: 'p',
          format: 'predict-output',
          code: cs('print:x'),
          answer: { output: 'x' },
        },
        {
          ...base,
          id: 'm',
          format: 'multiple-choice',
          code: cs('a'),
          options: [{ id: 'a', text: 'A' }],
          selection: 'single',
          answer: { correct: ['a'] },
        },
        {
          ...base,
          id: 'c',
          format: 'multiple-choice',
          code: cs('ERROR'),
          options: [
            { id: 'a', text: 'Yes, it compiles' },
            { id: 'b', text: 'No' },
          ],
          selection: 'single',
          answer: { correct: ['b'] },
          csharpCheck: { kind: 'compiles' },
        },
        {
          ...base,
          id: 'f',
          format: 'fill-in-blank',
          template: cs('var x = {{blank:v}};'),
          answer: { blanks: { v: { accepted: ['1', '2'] } } },
        },
        {
          ...base,
          id: 'ts',
          format: 'predict-output',
          code: { language: 'typescript', source: 'x' },
          answer: { output: 'x' },
        },
      ]),
    ]);
    expect(snippets.map((s) => s.source)).toEqual([
      'print:x',
      'a',
      'ERROR',
      'var x = 1;',
      'var x = 2;',
    ]);
    expect(snippets[2]?.keySaysCompiles).toBe(false);
  });

  it('reports wrong outputs, exceptions, compile errors and wrong answer keys', async () => {
    const issues = await checkCSharpSnippets(
      [
        track([
          {
            ...base,
            id: 'ok',
            format: 'predict-output',
            code: cs('print:x'),
            answer: { output: 'x' },
          },
          {
            ...base,
            id: 'wrong',
            format: 'predict-output',
            code: cs('print:y'),
            answer: { output: 'x' },
          },
          {
            ...base,
            id: 'throws',
            format: 'predict-output',
            code: cs('THROW print:x'),
            answer: { output: 'x' },
          },
          {
            ...base,
            id: 'broken',
            format: 'predict-output',
            code: cs('ERROR'),
            answer: { output: 'x' },
          },
          {
            ...base,
            id: 'key',
            format: 'multiple-choice',
            code: cs('fine'),
            options: [
              { id: 'a', text: 'Yes' },
              { id: 'b', text: 'No' },
            ],
            selection: 'single',
            answer: { correct: ['b'] },
            csharpCheck: { kind: 'compiles' },
          },
        ]),
      ],
      fakeRunner,
    );
    expect(issues.map((i) => `${i.path.split('/').pop()}: ${i.message}`)).toEqual([
      'wrong: expected output "x" but the code prints "y"',
      'throws: throws: Boom',
      'broken: does not compile: line 1: CS0000: bad',
      'key: answer key says this does not compile, but it does',
    ]);
  });
});

/*
 * Every C# question in the real tracks, through the real C# runner container.
 * Needs Docker and the runner images (`npm run runners:build`).
 */
describe.skipIf(skipDocker)('C# Skill Mastery questions (real compiler)', () => {
  it('compile, run and match their answer keys', { timeout: 600_000 }, async () => {
    const runner = new DockerCodeRunner({ maxConcurrent: 4, maxQueue: 10_000 });
    const status = await runner.check();
    if (!status.ok)
      throw new Error(`${status.message} (set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip)`);
    const snippets = collectCSharpSnippets(TRACKS);
    expect(snippets.length).toBeGreaterThan(0);
    expect(await checkCSharpSnippets(TRACKS, runner)).toEqual([]);
  });
});
