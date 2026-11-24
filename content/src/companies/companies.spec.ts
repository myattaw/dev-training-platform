import {
  companySlug,
  type DataSource,
  type ExternalProblemReference,
  normalizeCompanyName,
} from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { CHALLENGES } from '../challenges';
import { TRACKS } from '../skill-mastery';
import { buildCompanies, DEMO_IMPORTED_AT } from './build-companies';
import {
  CompanyFileError,
  parseCompanyFile,
  parsePercent,
  parseProblemUrl,
  sanitizeText,
} from './import/company-csv';
import { CsvSyntaxError, parseCsv } from './import/csv';
import { emptyDataset, emptySummary, mergeCompanyFile } from './import/dataset';
import { recommend, scoreChallenge } from './recommend';
import { LC_COMPANYWISE } from './sources';

const HEADER = 'ID,URL,Title,Difficulty,Acceptance %,Frequency %';
/** The confirmed Liberty Mutual row from the source snapshot. */
const LIBERTY_ROW =
  '2296,https://leetcode.com/problems/design-a-text-editor,Design a Text Editor,Hard,51.1%,100.0%';

const parse = (text: string, overrides: Partial<Parameters<typeof parseCompanyFile>[0]> = {}) =>
  parseCompanyFile({
    source: LC_COMPANYWISE,
    companyFolder: 'liberty-mutual',
    fileName: 'all.csv',
    text,
    importedAt: '2026-11-22T10:00:00.000Z',
    ...overrides,
  });

describe('parseCsv', () => {
  it('parses quoted fields, escaped quotes, embedded commas and newlines', () => {
    const records = parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n');
    expect(records).toEqual([
      { line: 1, fields: ['a', 'b, c', 'say "hi"'] },
      { line: 2, fields: ['1', 'two\nlines', '3'] },
    ]);
  });

  it('strips a byte-order mark and skips blank lines', () => {
    expect(parseCsv('﻿a,b\n\n1,2').map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n,,').map((r) => r.fields)).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('rejects unterminated quotes and text after a closing quote', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(CsvSyntaxError);
    expect(() => parseCsv('"a"b,c')).toThrow(/after a closing quote/);
    expect(() => parseCsv('a"b,c')).toThrow(/unexpected quote/);
  });
});

describe('field parsing', () => {
  it('parses percentages safely', () => {
    expect(parsePercent('51.1%')).toBe(51.1);
    expect(parsePercent(' 100.0% ')).toBe(100);
    expect(parsePercent('7')).toBe(7);
    expect(parsePercent('')).toBeUndefined();
    for (const bad of ['101%', '-1%', 'abc', '1e3', '50%%', 'NaN']) {
      expect(() => parsePercent(bad)).toThrow();
    }
  });

  it('accepts only https problem pages on known hosts', () => {
    expect(parseProblemUrl('https://leetcode.com/problems/two-sum/')).toBe(
      'https://leetcode.com/problems/two-sum',
    );
    for (const bad of [
      'http://leetcode.com/problems/two-sum',
      'https://evil.example/problems/two-sum',
      'https://leetcode.com.evil.example/problems/two-sum',
      'https://user:pw@leetcode.com/problems/two-sum',
      'https://leetcode.com/problems/two-sum/solutions',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(() => parseProblemUrl(bad), bad).toThrow();
    }
  });

  it('removes control and bidirectional-override characters from text', () => {
    const rlo = String.fromCharCode(0x202e);
    expect(sanitizeText(`  Two\u0000 Sum${rlo}\t \n`)).toBe('Two Sum');
  });
});

describe('parseCompanyFile', () => {
  it('imports the confirmed Liberty Mutual row with provenance', () => {
    const parsed = parse(`${HEADER}\n${LIBERTY_ROW}\n`, { displayName: 'Liberty Mutual' });
    expect(parsed.rejected).toEqual([]);
    expect(parsed.company).toEqual({
      id: 'liberty-mutual',
      displayName: 'Liberty Mutual',
      aliases: [],
    });
    expect(parsed.references).toEqual([
      {
        id: 'lc-companywise:2296',
        sourceId: 'lc-companywise',
        externalId: '2296',
        title: 'Design a Text Editor',
        externalUrl: 'https://leetcode.com/problems/design-a-text-editor',
        difficulty: 'hard',
        acceptanceRate: 51.1,
        editorialTags: [],
      },
    ]);
    expect(parsed.associations).toEqual([
      {
        companyId: 'liberty-mutual',
        problemId: 'lc-companywise:2296',
        sourceId: 'lc-companywise',
        window: 'all',
        reportedFrequency: 100,
        sourceSnapshotDate: '2026-07-12',
        importedAt: '2026-11-22T10:00:00.000Z',
      },
    ]);
  });

  it('maps file names to observation windows and rejects unknown ones', () => {
    expect(parse(`${HEADER}\n`, { fileName: 'more-than-six-months.csv' }).window).toBe(
      'more-than-six-months',
    );
    expect(() => parse(`${HEADER}\n`, { fileName: 'notes.csv' })).toThrow(CompanyFileError);
  });

  it('accepts columns in any order and case, and reports extra columns', () => {
    const parsed = parse(
      'title,id,url,DIFFICULTY,frequency %,acceptance %,Notes\nTwo Sum,1,https://leetcode.com/problems/two-sum,easy,50%,57.8%,x\n',
    );
    expect(parsed.rejected).toEqual([]);
    expect(parsed.references[0]?.title).toBe('Two Sum');
    expect(parsed.ignoredColumns).toEqual(['Notes']);
  });

  it('rejects files with missing or duplicate columns', () => {
    expect(() => parse('ID,URL,Title,Difficulty\n')).toThrow(/missing column "Acceptance %"/);
    expect(() => parse(`${HEADER},ID\n`)).toThrow(/duplicate column "ID"/);
    expect(() => parse('')).toThrow(/empty file/);
  });

  it('rejects malformed rows and keeps the valid ones', () => {
    const parsed = parse(
      [
        HEADER,
        LIBERTY_ROW,
        'abc,https://leetcode.com/problems/x,X,Easy,1%,1%',
        '5,https://leetcode.com/problems/y,Y,Trivial,1%,1%',
        '6,https://elsewhere.example/problems/z,Z,Easy,1%,1%',
        '7,https://leetcode.com/problems/w,W,Easy,140%,1%',
        '8,https://leetcode.com/problems/v,,Easy,1%,1%',
        '9,https://leetcode.com/problems/u,U,Easy,1%',
        LIBERTY_ROW,
        '2296,https://leetcode.com/problems/design-a-text-editor,Renamed,Hard,51.1%,100.0%',
      ].join('\n'),
    );
    expect(parsed.references.map((r) => r.externalId)).toEqual(['2296']);
    expect(parsed.rejected.map((r) => [r.line, r.reason])).toEqual([
      [3, 'invalid ID "abc"'],
      [4, 'unknown difficulty "Trivial"'],
      [5, 'URL host elsewhere.example is not allowed'],
      [6, '"140%" is not a percentage'],
      [7, 'invalid title'],
      [8, 'expected 6 fields, found 5'],
      [9, 'duplicate of an earlier row for problem 2296'],
      [10, 'conflicts with an earlier row for problem 2296'],
    ]);
  });

  it('requires kebab-case folders that produce a stable slug', () => {
    expect(() => parse(`${HEADER}\n`, { companyFolder: 'Liberty Mutual' })).toThrow(/kebab-case/);
  });
});

describe('company names', () => {
  it('normalizes names for search', () => {
    expect(normalizeCompanyName('  AT&T ')).toBe('at and t');
    expect(normalizeCompanyName('Société Générale')).toBe('societe generale');
    expect(normalizeCompanyName("McDonald's")).toBe('mcdonalds');
    expect(normalizeCompanyName('Liberty   Mutual, Inc.')).toBe('liberty mutual inc');
  });

  it('makes stable slugs', () => {
    expect(companySlug('Liberty Mutual')).toBe('liberty-mutual');
    expect(companySlug('PayPal')).toBe('paypal');
    expect(companySlug('Capital One')).toBe('capital-one');
  });
});

describe('mergeCompanyFile', () => {
  const file = (text: string, folder = 'liberty-mutual', snapshotDate = '2026-07-12') =>
    parseCompanyFile({
      source: { ...LC_COMPANYWISE, snapshotDate },
      companyFolder: folder,
      fileName: 'all.csv',
      text,
      importedAt: '2026-11-22T10:00:00.000Z',
    });

  it('stores a problem once when several companies list it (many-to-many)', () => {
    const twoSum = '1,https://leetcode.com/problems/two-sum,Two Sum,Easy,57.8%,62.5%';
    let { dataset } = mergeCompanyFile(
      emptyDataset(),
      file(`${HEADER}\n${twoSum}`, 'intuit'),
      LC_COMPANYWISE,
    );
    const result = mergeCompanyFile(
      dataset,
      file(`${HEADER}\n${twoSum.replace('62.5%', '75.0%')}`, 'paypal'),
      LC_COMPANYWISE,
    );
    dataset = result.dataset;
    expect(Object.keys(dataset.references)).toEqual(['lc-companywise:1']);
    expect(dataset.associations.map((a) => [a.companyId, a.reportedFrequency])).toEqual([
      ['intuit', 62.5],
      ['paypal', 75],
    ]);
    expect(result.summary.referencesUnchanged).toBe(1);
  });

  it('is repeatable: importing the same file again changes nothing', () => {
    const parsed = file(`${HEADER}\n${LIBERTY_ROW}`);
    const first = mergeCompanyFile(emptyDataset(), parsed, LC_COMPANYWISE);
    const second = mergeCompanyFile(first.dataset, parsed, LC_COMPANYWISE);
    expect(second.dataset).toEqual(first.dataset);
    expect(second.summary).toMatchObject({
      companiesAdded: 0,
      referencesAdded: 0,
      referencesUnchanged: 1,
      associationsAdded: 0,
      associationsUnchanged: 1,
      conflicts: [],
    });
  });

  it('reports conflicting facts instead of overwriting them', () => {
    const first = mergeCompanyFile(
      emptyDataset(),
      file(`${HEADER}\n${LIBERTY_ROW}`),
      LC_COMPANYWISE,
    );
    const changed = LIBERTY_ROW.replace('Design a Text Editor', 'Text Editor Design').replace(
      'Hard',
      'Medium',
    );
    const second = mergeCompanyFile(first.dataset, file(`${HEADER}\n${changed}`), LC_COMPANYWISE);
    expect(second.summary.conflicts.map((c) => c.subject)).toEqual([
      'reference lc-companywise:2296 title',
      'reference lc-companywise:2296 difficulty',
    ]);
    expect(second.dataset.references['lc-companywise:2296']?.title).toBe('Design a Text Editor');
  });

  it('updates associations from a newer snapshot and ignores older ones', () => {
    const base = mergeCompanyFile(
      emptyDataset(),
      file(`${HEADER}\n${LIBERTY_ROW}`),
      LC_COMPANYWISE,
    );
    const lower = `${HEADER}\n${LIBERTY_ROW.replace('100.0%', '80.0%')}`;
    const newer = mergeCompanyFile(
      base.dataset,
      file(lower, 'liberty-mutual', '2026-09-01'),
      LC_COMPANYWISE,
    );
    expect(newer.summary.associationsUpdated).toBe(1);
    expect(newer.dataset.associations[0]?.reportedFrequency).toBe(80);

    const older = mergeCompanyFile(
      base.dataset,
      file(lower, 'liberty-mutual', '2026-01-01'),
      LC_COMPANYWISE,
    );
    expect(older.summary.associationsStale).toBe(1);
    expect(older.dataset.associations[0]?.reportedFrequency).toBe(100);

    const same = mergeCompanyFile(base.dataset, file(lower), LC_COMPANYWISE);
    expect(same.summary.conflicts).toHaveLength(1);
    expect(same.dataset.associations[0]?.reportedFrequency).toBe(100);
  });

  it('collects rejected rows in the summary', () => {
    const summary = emptySummary();
    mergeCompanyFile(emptyDataset(), file(`${HEADER}\nbad row`), LC_COMPANYWISE, summary);
    expect(summary.rejectedRows).toHaveLength(1);
  });
});

describe('recommendations', () => {
  const ref = (id: string, title: string, tags: ExternalProblemReference['editorialTags']) => ({
    id,
    sourceId: 's',
    externalId: id,
    title,
    externalUrl: `https://leetcode.com/problems/${id}`,
    difficulty: 'medium' as const,
    editorialTags: tags,
  });
  const assoc = (problemId: string, reportedFrequency?: number) => ({
    companyId: 'acme',
    problemId,
    sourceId: 's',
    window: 'all' as const,
    ...(reportedFrequency !== undefined ? { reportedFrequency } : {}),
    sourceSnapshotDate: '2026-07-12',
    importedAt: DEMO_IMPORTED_AT,
  });
  const references = [
    ref('path', 'Simplify Path', ['stacks', 'strings', 'command-parsing']),
    ref('grid', 'Rotate Image', ['matrix', 'arrays']),
  ];
  const associations = [assoc('path', 100), assoc('grid', 50)];
  const challenges = [
    { id: 'brackets', title: 'Brackets', tags: ['stacks', 'strings'] },
    { id: 'commands', title: 'Commands', tags: ['command-parsing', 'strings'] },
    { id: 'sorting', title: 'Sorting', tags: ['sorting'] },
    { id: 'arrays-only', title: 'Arrays', tags: ['arrays'] },
  ];

  it('ranks by shared competencies weighted by frequency, broad tags counting half', () => {
    const recs = recommend({ companyId: 'acme', references, associations, challenges });
    expect(recs.map((r) => r.challengeId)).toEqual(['brackets', 'commands']);
    expect(recs[0]).toMatchObject({
      reason: 'Practices stacks and string manipulation, like “Simplify Path”.',
      sourceProblemId: 'path',
      similarityTags: ['stacks', 'strings'],
      origin: 'computed',
      editorialReviewStatus: 'unreviewed',
      confidence: 'medium',
    });
  });

  it('drops weak matches instead of padding the list', () => {
    // "arrays" with frequency 50 scores 0.25, below the threshold.
    expect(scoreChallenge(challenges[3]!, references, new Map([['grid', 50]]))).toBeUndefined();
    const recs = recommend({ companyId: 'acme', references, associations, challenges });
    expect(recs.some((r) => r.challengeId === 'sorting' || r.challengeId === 'arrays-only')).toBe(
      false,
    );
  });

  it('needs at least one specific competency in common', () => {
    const strings = { id: 'strings-only', title: 'S', tags: ['strings'] };
    expect(scoreChallenge(strings, references, new Map([['path', 100]]))).toBeUndefined();
  });

  it('puts curated recommendations first, in order, without duplicates', () => {
    const recs = recommend({
      companyId: 'acme',
      references,
      associations,
      challenges,
      curated: [
        {
          challengeId: 'commands',
          reason: 'Editor pick.',
          similarityTags: ['command-parsing'],
          confidence: 'high',
        },
      ],
    });
    expect(recs.map((r) => [r.challengeId, r.origin])).toEqual([
      ['commands', 'curated'],
      ['brackets', 'computed'],
    ]);
  });

  it('is deterministic and respects the limit', () => {
    const input = { companyId: 'acme', references, associations, challenges, limit: 1 };
    expect(recommend(input)).toEqual(
      recommend({ ...input, challenges: [...challenges].reverse() }),
    );
    expect(recommend(input)).toHaveLength(1);
  });

  it('ignores references not associated with the company', () => {
    const recs = recommend({
      companyId: 'acme',
      references,
      associations: [assoc('grid', 50)],
      challenges,
    });
    expect(recs).toEqual([]);
  });
});

describe('company content build', () => {
  const challenges = CHALLENGES.map((c) => ({
    id: c.source.challenge.id,
    version: c.source.challenge.version,
    title: c.source.challenge.title,
    summary: c.source.challenge.summary,
    category: c.source.challenge.category,
    difficulty: c.source.challenge.difficulty,
    tags: c.source.challenge.tags,
    languages: [],
    visibleTestCount: c.source.challenge.visibleTests.length,
  }));
  const build = buildCompanies({ challenges, tracks: TRACKS });

  it('has no errors or warnings', () => {
    expect(build.issues).toEqual([]);
  });

  it('shows Design a Text Editor for Liberty Mutual, with curated practice and a path', () => {
    const liberty = build.files.get('companies/liberty-mutual.json') as {
      references: { title: string; difficulty: string; externalUrl: string }[];
      associations: { window: string }[];
      recommendations: { challengeId: string; origin: string }[];
      preparationPaths: { steps: unknown[] }[];
    };
    expect(liberty.references).toEqual([
      expect.objectContaining({
        title: 'Design a Text Editor',
        difficulty: 'hard',
        externalUrl: 'https://leetcode.com/problems/design-a-text-editor',
      }),
    ]);
    expect(liberty.associations.map((a) => a.window).sort()).toEqual([
      'all',
      'more-than-six-months',
    ]);
    expect(liberty.recommendations.slice(0, 3).map((r) => r.challengeId)).toEqual([
      'text-cursor-buffer',
      'apply-edit-commands',
      'undo-redo-history',
    ]);
    expect(liberty.preparationPaths[0]?.steps).toHaveLength(5);
  });

  it('stores shared problems once (Two Sum is listed by Intuit and PayPal)', () => {
    const twoSum = build.dataset.associations.filter((a) => a.problemId === 'lc-companywise:1');
    expect(twoSum.map((a) => a.companyId).sort()).toEqual(['intuit', 'paypal']);
  });

  it('writes a compact, alphabetical index with search text', () => {
    const index = build.files.get('companies/index.json') as {
      sources: DataSource[];
      companies: { id: string; searchText: string; questionCount: number }[];
    };
    expect(index.companies.map((c) => c.id)).toEqual([
      'capital-one',
      'geico',
      'intuit',
      'liberty-mutual',
      'paypal',
    ]);
    expect(index.companies.find((c) => c.id === 'liberty-mutual')).toMatchObject({
      searchText: 'liberty mutual | liberty mutual insurance',
      questionCount: 1,
    });
    expect(index.sources[0]?.bulkImportAllowed).toBe(false);
  });

  it('fails on recommendations that overclaim or point at missing content', () => {
    const bad = buildCompanies({
      challenges,
      tracks: TRACKS,
      curated: {
        'liberty-mutual': [
          { challengeId: 'nope', reason: 'Fine.', similarityTags: [], confidence: 'low' },
          {
            challengeId: 'pangram',
            reason: 'Liberty Mutual definitely asks this.',
            similarityTags: [],
            confidence: 'low',
          },
        ],
      },
      paths: [
        {
          id: 'p',
          companyId: 'liberty-mutual',
          title: 'P',
          summary: 'S',
          steps: [
            { title: 'x', description: 'y', target: { kind: 'challenge', challengeId: 'missing' } },
          ],
        },
      ],
    });
    const messages = bad.issues.map((i) => i.message).join('\n');
    expect(messages).toMatch(/unknown challenge nope/);
    expect(messages).toMatch(/unsupported claim/);
    expect(messages).toMatch(/available challenge missing/);
  });
});
