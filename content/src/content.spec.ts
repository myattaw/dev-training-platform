import type { PublicManifest, QuestionSource, TrackSource } from '@pracstack/content-model';
import { ChildProcessSqlEngine } from '@pracstack/sql-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContent, type ContentBuild } from './build';
import { CHALLENGES } from './challenges';
import { TRACKS } from './skill-mastery';

// One SQL engine for the whole file; building content runs every reference query.
const sqlEngine = new ChildProcessSqlEngine();
afterAll(() => sqlEngine.close());
const build = (options: Parameters<typeof buildContent>[0] = {}) =>
  buildContent({ sqlEngine, ...options });

const errorsOf = (build: ContentBuild): string[] =>
  build.issues.filter((i) => i.severity === 'error').map((i) => `${i.path}: ${i.message}`);

/** Replaces one question in the TypeScript track, leaving everything else as is. */
function withQuestion(id: string, change: (q: QuestionSource) => QuestionSource): TrackSource[] {
  return TRACKS.map((track) => ({
    ...track,
    topics: track.topics.map((topic) => ({
      ...topic,
      skills: topic.skills.map((skill) => ({
        ...skill,
        questions: skill.questions.map((q) => (q.id === id ? change(q) : q)),
      })),
    })),
  }));
}

describe('the real content', { timeout: 120_000 }, () => {
  let result: ContentBuild;
  beforeAll(async () => {
    result = await build();
  }, 120_000);

  it('has no validation errors (including executed checks)', () => {
    expect(errorsOf(result)).toEqual([]);
  });

  it('publishes a manifest listing every challenge and technology', () => {
    const manifest = result.publicFiles.get('manifest.json') as PublicManifest;
    expect(manifest.challenges.map((c) => c.id)).toEqual([
      'pangram',
      'reverse-string',
      'balanced-brackets',
      'merge-intervals',
      'lru-cache',
    ]);
    expect(manifest.technologies).toEqual([
      expect.objectContaining({ id: 'typescript', skillCount: 4 }),
      expect.objectContaining({ id: 'postgresql', skillCount: 4 }),
      expect.objectContaining({ id: 'oracle-sql', skillCount: 5 }),
    ]);
    expect(manifest.contentVersion).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic: building twice gives the same content version', async () => {
    expect((await build()).contentVersion).toBe(result.contentVersion);
  });

  it('keeps every hidden test, answer, hint and explanation out of the public files', () => {
    const publicJson = JSON.stringify([...result.publicFiles.values()]);
    for (const { source } of CHALLENGES) {
      for (const test of source.hiddenTests) {
        expect(publicJson).not.toContain(`"description":${JSON.stringify(test.description)}`);
      }
    }
    for (const track of TRACKS) {
      for (const skill of track.topics.flatMap((t) => t.skills)) {
        for (const q of skill.questions) {
          expect(publicJson).not.toContain(JSON.stringify(q.explanation[0]));
          for (const hint of q.hints) expect(publicJson).not.toContain(JSON.stringify(hint));
          // The question bank itself is private too: prompts are served one at a time.
          expect(publicJson).not.toContain(q.id);
        }
      }
    }
  });
});

describe('content checks catch broken content', { timeout: 120_000 }, () => {
  it('fails when a hidden test has the wrong expected value', async () => {
    const broken = CHALLENGES.map((entry) =>
      entry.source.challenge.id === 'reverse-string'
        ? {
            ...entry,
            source: {
              ...entry.source,
              hiddenTests: [
                { kind: 'call' as const, description: 'wrong', input: ['ab'], expected: 'ab' },
              ],
            },
          }
        : entry,
    );
    expect(errorsOf(await build({ challenges: broken }))).toEqual([
      'challenge:reverse-string/typescript: reference solution fails "wrong": expected "ab", got "ba"',
    ]);
  });

  it('fails when a predict-output answer does not match what the code prints', async () => {
    const tracks = withQuestion('ts-narrowing-truthiness', (q) =>
      q.format === 'predict-output' ? { ...q, answer: { output: 'text,text,empty,number' } } : q,
    );
    const errors = errorsOf(await build({ tracks }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('but the code prints "empty,text,empty,number"');
  });

  it('fails when predict-output code does not type-check', async () => {
    const tracks = withQuestion('ts-primitives-typeof-values', (q) =>
      q.format === 'predict-output'
        ? { ...q, code: { ...q.code, source: "const n: number = 'x';\nconsole.log(n);" } }
        : q,
    );
    expect(errorsOf(await build({ tracks }))[0]).toContain(
      "does not compile: line 1: Type 'string' is not assignable to type 'number'.",
    );
  });

  it('fails when an accepted fill-in-blank answer does not compile', async () => {
    const tracks = withQuestion('ts-narrowing-typeof-number', (q) =>
      q.format === 'fill-in-blank'
        ? { ...q, answer: { blanks: { kind: { accepted: ["'number'", "'string'"] } } } }
        : q,
    );
    const errors = errorsOf(await build({ tracks }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`(blank "kind" = "'string'")`);
    expect(errors[0]).toContain('does not compile');
  });
});
