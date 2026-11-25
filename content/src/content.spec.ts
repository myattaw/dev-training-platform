import { WEB_CHALLENGES } from './web-challenges';
import {
  analyzeJobDescription,
  type JobRole,
  type PublicManifest,
  type QuestionSource,
  type RolesFile,
  type TaxonomyFile,
  type TrackSource,
} from '@pracstack/content-model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContent, type ContentBuild } from './build';
import { CHALLENGES } from './challenges';
import { SqlCheckPool } from './checks/sql-check-pool';
import { ROLES } from './roles/roles';
import { TAXONOMY } from './roles/taxonomy';
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
      'employee-api',
      'transaction-batch',
      'secure-customer-api',
      'legacy-invoice-refactor',
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
      expect.objectContaining({ id: 'oracle-plsql', skillCount: 8 }),
      expect.objectContaining({ id: 'csharp', skillCount: 15 }),
      expect.objectContaining({ id: 'python', skillCount: 18 }),
      expect.objectContaining({ id: 'java', skillCount: 18 }),
      expect.objectContaining({ id: 'swift', skillCount: 15 }),
      expect.objectContaining({ id: 'aspnet-core', skillCount: 8 }),
      expect.objectContaining({ id: 'spring-boot', skillCount: 15 }),
      expect.objectContaining({ id: 'django', skillCount: 15 }),
      expect.objectContaining({ id: 'sql-server', skillCount: 9 }),
      expect.objectContaining({ id: 'aws', skillCount: 5 }),
      expect.objectContaining({ id: 'azure', skillCount: 5 }),
      expect.objectContaining({ id: 'power-platform', skillCount: 6 }),
      expect.objectContaining({ id: 'engineering-practices', skillCount: 5 }),
    ]);
    expect(manifest.contentVersion).toMatch(/^[0-9a-f]{12}$/);
  });

  it('lists web challenges in the manifest and keeps their projects, tests and references private', () => {
    const manifest = result.publicFiles.get('manifest.json') as PublicManifest;
    const ids = (manifest.webChallenges ?? []).map((w) => w.id);
    expect(ids).toEqual(WEB_CHALLENGES.map((w) => w.source.challenge.id));
    for (const w of manifest.webChallenges ?? []) expect(w.frameworks.length).toBeGreaterThan(0);
    const publicText = JSON.stringify([...result.publicFiles.values()]);
    for (const { source } of WEB_CHALLENGES) {
      for (const hidden of source.hiddenTests) expect(publicText).not.toContain(hidden.description);
      for (const impl of source.implementations) {
        for (const content of Object.values(impl.reference)) {
          if (content.length > 200)
            expect(publicText).not.toContain(JSON.stringify(content).slice(1, 200));
        }
      }
      const id = source.challenge.id;
      expect([...result.publicFiles.keys()].some((k) => k.includes(id))).toBe(false);
      expect(
        [...result.privateFiles.keys()].filter((k) => k.startsWith(`web-challenges/${id}@`)),
      ).toHaveLength(2);
    }
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
      .filter(
        (i) =>
          i.severity === 'warning' && !i.path.includes('oracle') && !i.path.includes('sqlserver'),
      )
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

  it('never publishes build-time answer checks (typeCheck, csharpCheck, plsqlCheck, codeCheck)', () => {
    const files = JSON.stringify([...result.publicFiles.values(), ...result.privateFiles.values()]);
    expect(files).not.toContain('typeCheck');
    expect(files).not.toContain('options-compile');
    expect(files).not.toContain('csharpCheck');
    expect(files).not.toContain('plsqlCheck');
    expect(files).not.toContain('codeCheck');
  });

  it('publishes job roles and the taxonomy as public files referenced from the manifest', () => {
    const manifest = result.publicFiles.get('manifest.json') as PublicManifest;
    expect(manifest.preparation).toEqual({
      rolesFile: 'roles.json',
      taxonomyFile: 'taxonomy.json',
    });
    const roles = (result.publicFiles.get('roles.json') as RolesFile).roles;
    expect(roles.map((r) => [r.id, r.status])).toEqual([
      ['dotnet-backend-developer', 'available'],
      ['fullstack-angular-dotnet-developer', 'available'],
      ['csharp-dotnet-developer', 'available'],
      ['aspnet-core-backend-developer', 'available'],
      ['sql-server-database-developer', 'available'],
      ['azure-developer', 'available'],
      ['aws-developer', 'available'],
      ['power-platform-developer', 'available'],
      ['java-backend-developer', 'available'],
      ['python-backend-developer', 'available'],
      ['swift-developer-fundamentals', 'available'],
      ['associate-software-engineer', 'available'],
      ['enterprise-application-developer', 'coming-soon'],
      ['power-platform-solution-architect', 'coming-soon'],
    ]);
    const terms = (result.publicFiles.get('taxonomy.json') as TaxonomyFile).terms;
    expect(terms.length).toBeGreaterThanOrEqual(50);
    // Nothing private: the files are exactly the authored roles and terms.
    expect(roles).toEqual(ROLES);
    expect(terms).toEqual(TAXONOMY);
    expect(result.privateFiles.has('roles.json')).toBe(false);
  });

  it('builds the .NET Backend Developer path in the specified order, from real content only', () => {
    const role = ROLES.find((r) => r.id === 'dotnet-backend-developer');
    if (role?.status !== 'available') throw new Error('missing role');
    expect(role.competencies.map((c) => c.name)).toEqual([
      'C# fundamentals',
      'Collections and LINQ',
      'Object-oriented programming',
      'Exceptions and async',
      'SQL fundamentals',
      'SQL Server and T-SQL',
      'REST APIs',
      'ASP.NET Core',
      'Automated testing',
      'Application security',
      'CI/CD',
      'Enterprise development scenario',
    ]);
    const csharpSkills = role.competencies
      .flatMap((c) => c.activities)
      .flatMap((a) => (a.kind === 'skill' && a.skillId.startsWith('cs-') ? [a.skillId] : []));
    // C# skills, each once, in the role's learning order (testing comes with the testing step).
    expect(csharpSkills).toEqual([
      'cs-value-reference-types',
      'cs-nullable-types',
      'cs-pattern-matching',
      'cs-collections',
      'cs-linq',
      'cs-linq-execution',
      'cs-oop',
      'cs-records-immutability',
      'cs-generics-methods',
      'cs-delegates-events',
      'cs-exceptions',
      'cs-async',
      'cs-unit-testing',
      'cs-solid-di',
    ]);
    // Every competency has real practice; the last step is the C# Enterprise Scenarios.
    expect(role.competencies.filter((c) => c.activities.length === 0)).toEqual([]);
    expect(role.competencies.at(-1)?.activities).toEqual([
      { kind: 'scenario', scenarioId: 'employee-management-api' },
      { kind: 'scenario', scenarioId: 'transaction-processing' },
      { kind: 'scenario', scenarioId: 'secure-customer-api' },
      { kind: 'scenario', scenarioId: 'legacy-modernization' },
    ]);
    // C# challenges are opened in C#.
    for (const a of role.competencies.flatMap((c) => c.activities)) {
      if (a.kind === 'challenge') expect(a.language, a.challengeId).toBe('csharp');
    }
  });

  it('analyses a real-world style posting with the real taxonomy', () => {
    const analysis = analyzeJobDescription(
      'Senior .NET Developer: 5+ years of C#, ASP.NET Core and SQL Server (T-SQL). Azure DevOps, Power Automate.',
      TAXONOMY,
    );
    expect(analysis.terms.map((t) => [t.term.id, t.covered])).toEqual([
      ['csharp', true],
      ['dotnet', true],
      ['aspnet-core', true],
      ['sql-server', true],
      ['azure-devops', true],
      ['power-automate', true],
    ]);
    expect(analysis.experience).toHaveLength(1);
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

  it('fails when a job role points at content that does not exist', async () => {
    const roles: JobRole[] = ROLES.map((r) =>
      r.id === 'csharp-dotnet-developer' && r.status === 'available'
        ? {
            ...r,
            technologies: [...r.technologies, 'cobol'],
            competencies: r.competencies.map((c, i) =>
              i === 0
                ? {
                    ...c,
                    activities: [
                      ...c.activities,
                      { kind: 'skill', skillId: 'cs-missing' },
                      { kind: 'scenario', scenarioId: 'order-api' },
                    ],
                  }
                : c,
            ),
          }
        : r,
    );
    const roleErrors = errorsOf(await build({ roles })).filter((e) => e.startsWith('role:'));
    expect(roleErrors).toEqual([
      'role:csharp-dotnet-developer/technologies: unknown term "cobol"',
      'role:csharp-dotnet-developer/language-fundamentals/activities[4]: unknown skill "cs-missing"',
      'role:csharp-dotnet-developer/language-fundamentals/activities[5]: unknown scenario "order-api" (Enterprise Scenarios are not registered)',
    ]);
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
