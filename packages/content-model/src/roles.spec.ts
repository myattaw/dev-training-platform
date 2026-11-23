import { describe, expect, it } from 'vitest';
import {
  activityKey,
  type AvailableJobRole,
  type JobRole,
  type RoleCompetency,
  type RoleValidationContext,
  validateRoles,
} from './roles';
import { type TaxonomyTerm, validateTaxonomy } from './taxonomy';

const context = {
  skillIds: new Set(['s1', 's2', 's3', 's4']),
  challengeIds: new Set(['pangram']),
  challengeLanguages: new Map([['pangram', ['typescript', 'csharp'] as const]]),
  termIds: new Set(['csharp', 'sql']),
};

const competency = (id: string, skillId?: string): RoleCompetency => ({
  id,
  name: `Competency ${id}`,
  description: 'Something to learn.',
  activities: skillId ? [{ kind: 'skill', skillId }] : [],
});

const role = (overrides: Partial<AvailableJobRole> = {}): AvailableJobRole => ({
  id: 'backend',
  version: 1,
  status: 'available',
  title: 'Backend',
  summary: 'Server work.',
  description: 'Builds servers.',
  technologies: ['csharp'],
  competencies: [
    competency('a', 's1'),
    competency('b', 's2'),
    competency('c', 's3'),
    competency('d', 's4'),
    competency('later'),
  ],
  ...overrides,
});

const messages = (roles: readonly JobRole[], ctx: RoleValidationContext = context) =>
  validateRoles(roles, ctx).map((i) => `${i.path}: ${i.message}`);

describe('validateRoles', () => {
  it('accepts an available role with four practised competencies and an empty one', () => {
    expect(messages([role()])).toEqual([]);
  });

  it('rejects duplicate role ids and unknown technology terms', () => {
    expect(messages([role(), role({ technologies: ['csharp', 'cobol'] })])).toEqual([
      'role:backend: duplicate role id',
      'role:backend/technologies: unknown term "cobol"',
    ]);
  });

  it('rejects unknown skills, challenges and languages', () => {
    const bad = role({
      competencies: [
        ...role().competencies,
        {
          ...competency('e'),
          activities: [
            { kind: 'skill', skillId: 'nope' },
            { kind: 'challenge', challengeId: 'missing' },
            { kind: 'challenge', challengeId: 'pangram', language: 'java' },
          ],
        },
      ],
    });
    expect(messages([bad])).toEqual([
      'role:backend/e/activities[0]: unknown skill "nope"',
      'role:backend/e/activities[1]: unknown challenge "missing"',
      'role:backend/e/activities[2]: challenge "pangram" is not offered in java',
    ]);
  });

  it('treats scenario references as invalid until scenario ids are passed in', () => {
    const withScenario = role({
      competencies: [
        ...role().competencies,
        { ...competency('e'), activities: [{ kind: 'scenario', scenarioId: 'order-api' }] },
      ],
    });
    expect(messages([withScenario])).toEqual([
      'role:backend/e/activities[0]: unknown scenario "order-api" (Enterprise Scenarios are not registered)',
    ]);
    expect(messages([withScenario], { ...context, scenarioIds: new Set(['order-api']) })).toEqual(
      [],
    );
  });

  it('needs at least four competencies with practice for an available role', () => {
    const thin = role({ competencies: [competency('a', 's1'), competency('b'), competency('c')] });
    expect(messages([thin])).toEqual([
      'role:backend: an available role needs at least 4 competencies with practice (has 1); mark it coming-soon instead',
    ]);
  });

  it('rejects coming-soon roles with competencies or a description', () => {
    const soon = {
      id: 'azure',
      version: 1,
      status: 'coming-soon',
      title: 'Azure Developer',
      summary: 'Cloud.',
      technologies: ['csharp'],
    } as const;
    expect(messages([soon])).toEqual([]);
    const withPath = { ...soon, competencies: [], description: 'x' } as unknown as JobRole;
    expect(messages([withPath])).toEqual([
      'role:azure: a coming-soon role must not list competencies',
      'role:azure: a coming-soon role has no description (only title, summary, technologies)',
    ]);
  });

  it('rejects duplicate competencies, repeated activities and bad ids', () => {
    const bad = role({
      id: 'Bad Id',
      competencies: [
        competency('a', 's1'),
        competency('a', 's2'),
        competency('c', 's1'),
        competency('d', 's4'),
      ],
    });
    expect(messages([bad])).toEqual([
      'role:Bad Id: id "Bad Id" must be lowercase kebab-case',
      'role:Bad Id/a: duplicate competency id',
      'role:Bad Id/c/activities[0]: "skill:s1" appears twice',
    ]);
  });
});

describe('activityKey', () => {
  it('is stable and includes the language', () => {
    expect(activityKey({ kind: 'skill', skillId: 'cs-oop' })).toBe('skill:cs-oop');
    expect(activityKey({ kind: 'challenge', challengeId: 'pangram' })).toBe('challenge:pangram');
    expect(activityKey({ kind: 'challenge', challengeId: 'pangram', language: 'csharp' })).toBe(
      'challenge:pangram:csharp',
    );
  });
});

describe('validateTaxonomy', () => {
  const term = (overrides: Partial<TaxonomyTerm> = {}): TaxonomyTerm => ({
    id: 'csharp',
    label: 'C#',
    category: 'language',
    aliases: ['C Sharp'],
    practice: [{ kind: 'skill', skillId: 's1' }],
    tracks: ['csharp'],
    ...overrides,
  });
  const check = (terms: readonly TaxonomyTerm[]) =>
    validateTaxonomy(terms, { ...context, technologyIds: new Set(['csharp']) }).map(
      (i) => `${i.path}: ${i.message}`,
    );

  it('accepts a valid term', () => {
    expect(check([term()])).toEqual([]);
  });

  it('rejects a name used by two terms (case-insensitively) and duplicate ids', () => {
    expect(
      check([
        term(),
        term({ id: 'csharp', label: 'c sharp', aliases: [] }),
        term({ id: 'x', label: 'X', aliases: ['C#'] }),
      ]),
    ).toEqual([
      'term:csharp: duplicate term id',
      'term:csharp: "c sharp" is listed twice',
      'term:x: "C#" is already a name of "csharp"',
    ]);
  });

  it('rejects unknown practice, tracks, categories and matchCase entries', () => {
    expect(
      check([
        term({
          category: 'astrology' as TaxonomyTerm['category'],
          practice: [{ kind: 'skill', skillId: 'nope' }],
          tracks: ['cobol'],
          matchCase: ['CS'],
        }),
      ]),
    ).toEqual([
      'term:csharp: unknown category "astrology"',
      'term:csharp: matchCase "CS" is not one of the term\'s names',
      'term:csharp/practice[0]: unknown skill "nope"',
      'term:csharp/tracks: unknown track "cobol"',
    ]);
  });

  it('requires a note and aliases for ambiguity', () => {
    expect(check([term({ ambiguity: { aliases: [], note: ' ' } })])).toEqual([
      'term:csharp: ambiguity needs at least one alias',
      'term:csharp: ambiguity needs a note',
    ]);
  });
});
