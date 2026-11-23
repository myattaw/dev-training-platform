import type { PublicManifest, QuestionSource, TrackSource } from '@pracstack/content-model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContent, type ContentBuild } from './build';
import { CHALLENGES } from './challenges';
import { SqlCheckPool } from './checks/sql-check-pool';
import { TRACKS } from './skill-mastery';

// One SQL engine pool for the whole file: building content runs every reference
// query, and the pool runs each distinct query once, however often content is built.
const sqlEngine = new SqlCheckPool();
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
  }, 300_000); // first build runs every SQL check; CI runners are small

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
      'apply-edit-commands',
      'text-cursor-buffer',
      'undo-redo-history',
    ]);
    // Announced challenges are listed separately and have no tests or code.
    expect(manifest.plannedChallenges?.map((c) => [c.id, c.availability, c.access])).toEqual([
      ['editor-with-selection', 'coming-soon', 'pro'],
      ['piece-table-editor', 'coming-soon', 'pro'],
    ]);
    expect(manifest.technologies).toEqual([
      expect.objectContaining({ id: 'typescript', skillCount: 8 }),
      expect.objectContaining({ id: 'angular', skillCount: 2 }),
      expect.objectContaining({ id: 'postgresql', skillCount: 6 }),
      expect.objectContaining({ id: 'oracle-sql', skillCount: 5 }),
    ]);
    expect(manifest.contentVersion).toMatch(/^[0-9a-f]{12}$/);
  });

  it('keeps company data private (served by the API to signed-in users)', () => {
    const publicPaths = [...result.publicFiles.keys()];
    expect(publicPaths.filter((p) => p.startsWith('companies/'))).toEqual([]);
    expect(
      [...result.privateFiles.keys()].filter((p) => p.startsWith('companies/')).sort(),
    ).toEqual([
      'companies/capital-one.json',
      'companies/geico.json',
      'companies/index.json',
      'companies/intuit.json',
      'companies/liberty-mutual.json',
      'companies/paypal.json',
    ]);
  });

  it('has no warnings for TypeScript or PostgreSQL: every reference query ran, and the hidden data differs', () => {
    const warnings = result.issues
      .filter((i) => i.severity === 'warning' && !i.path.includes('oracle'))
      .map((i) => `${i.path}: ${i.message}`);
    expect(warnings).toEqual([]);
  });

  it('gives every skill enough new questions to reach mastery without repeats', () => {
    for (const track of TRACKS) {
      for (const skill of track.topics.flatMap((t) => t.skills)) {
        const at = (d: number) => skill.questions.filter((q) => q.difficulty === d).length;
        // Two first-time correct answers promote, so every tier needs at least two questions;
        // a perfect run to 100 answers seven questions at tiers 4 and 5 (docs/scoring.md).
        for (const d of [1, 2, 3, 4, 5])
          expect(at(d), `${skill.id} tier ${d}`).toBeGreaterThanOrEqual(2);
        expect(at(4) + at(5), `${skill.id} tiers 4-5`).toBeGreaterThanOrEqual(7);
        expect(skill.questions.length, skill.id).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('never publishes build-time answer checks (typeCheck)', () => {
    const files = JSON.stringify([...result.publicFiles.values(), ...result.privateFiles.values()]);
    expect(files).not.toContain('typeCheck');
    expect(files).not.toContain('options-compile');
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

  it('fails when a "does it compile?" answer key disagrees with the compiler', async () => {
    const tracks = withQuestion('ts-union-member-access-to-upper', (q) =>
      q.format === 'multiple-choice' ? { ...q, answer: { correct: ['a'] } } : q,
    );
    const errors = errorsOf(await build({ tracks }));
    expect(errors).toEqual([
      expect.stringContaining('answer key says this compiles, but it does not'),
    ]);
  });

  it('fails when a "which compile?" answer key disagrees with the compiler', async () => {
    const tracks = withQuestion('ts-primitives-strict-assignments', (q) =>
      q.format === 'multiple-choice' ? { ...q, answer: { correct: ['a', 'b', 'c'] } } : q,
    );
    const errors = errorsOf(await build({ tracks }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('(option a: `let n: number = null;`)');
    expect(errors[0]).toContain('answer key says this compiles, but it does not');
  });

  it('fails when a "what type is inferred?" answer key is not exactly the inferred type', async () => {
    const tracks = withQuestion('ts-inferred-primitive-boolean', (q) => {
      if (q.format !== 'multiple-choice') return q;
      const literal = q.options.find((o) => o.text === '`false`');
      return { ...q, answer: { correct: [literal?.id ?? ''] } };
    });
    const errors = errorsOf(await build({ tracks }));
    expect(errors).toHaveLength(2);
    expect(errors.join('\n')).toContain('(option');
    expect(errors.join('\n')).toContain(
      '`boolean`): answer key says this does not compile, but it does',
    );
  });

  it('checks Angular code against the real Angular types', async () => {
    // Claim that setting a computed signal compiles: the Angular types say it does not.
    const tracks = withQuestion('ng-signal-writes-checked-set-computed', (q) =>
      q.format === 'multiple-choice' ? { ...q, answer: { correct: ['a'] } } : q,
    );
    const errors = errorsOf(await build({ tracks }));
    expect(errors).toEqual([
      expect.stringMatching(
        /answer key says this compiles, but it does not: .*'set' does not exist/,
      ),
    ]);
  });
});
