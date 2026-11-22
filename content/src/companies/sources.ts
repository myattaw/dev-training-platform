import type { Competency, DataSource } from '@pracstack/content-model';

/**
 * Third-party sources of company ↔ problem associations, with the outcome of
 * their licence review (docs/company-data-licensing.md).
 */
export const LC_COMPANYWISE: DataSource = {
  id: 'lc-companywise',
  name: 'leetcode-companywise-interview-questions (GitHub)',
  url: 'https://github.com/snehasishroy/leetcode-companywise-interview-questions',
  provider: 'LeetCode',
  providerUrl: 'https://leetcode.com',
  snapshotDate: '2026-07-12',
  license: {
    status: 'unverified',
    note: 'Checked 2026-11-22: the repository has no licence file and GitHub reports no licence, so redistribution rights are not granted. Only a small, manually curated demonstration sample is used.',
  },
  bulkImportAllowed: false,
};

export const SOURCES: readonly DataSource[] = [LC_COMPANYWISE];

/** A company in the demonstration sample. The CSVs are in `demo/<folder>/`. */
export interface DemoCompany {
  readonly folder: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly files: readonly string[];
  /** Rows the source lists for this company in `all.csv`; the sample holds only the first few. */
  readonly sourceRowCount: number;
}

/**
 * Manually curated sample: Liberty Mutual's complete list (one problem) and
 * the first rows of four other companies' lists, copied as they appear in the
 * source snapshot. Small on purpose; see `bulkImportAllowed`.
 */
export const DEMO_COMPANIES: readonly DemoCompany[] = [
  {
    folder: 'liberty-mutual',
    displayName: 'Liberty Mutual',
    aliases: ['Liberty Mutual Insurance'],
    files: ['all.csv', 'more-than-six-months.csv'],
    sourceRowCount: 1,
  },
  {
    folder: 'capital-one',
    displayName: 'Capital One',
    aliases: ['CapitalOne'],
    files: ['all.csv'],
    sourceRowCount: 63,
  },
  { folder: 'geico', displayName: 'GEICO', aliases: [], files: ['all.csv'], sourceRowCount: 18 },
  { folder: 'intuit', displayName: 'Intuit', aliases: [], files: ['all.csv'], sourceRowCount: 64 },
  {
    folder: 'paypal',
    displayName: 'PayPal',
    aliases: ['Pay Pal'],
    files: ['all.csv'],
    sourceRowCount: 103,
  },
];

/**
 * Competencies of the sample's problems, assigned by PracStack editors from
 * the problems' titles and well-known topics (not copied from the provider).
 * Keyed by the provider's problem number.
 */
export const EDITORIAL_TAGS: Readonly<Record<string, readonly Competency[]>> = {
  '2296': ['text-editing', 'cursor-state', 'stacks', 'design', 'index-boundaries'],
  '2': ['linked-lists', 'math'],
  '546': ['dynamic-programming'],
  '48': ['matrix', 'arrays'],
  '68': ['strings', 'simulation'],
  '71': ['stacks', 'strings', 'command-parsing'],
  '723': ['matrix', 'simulation'],
  '36': ['hash-maps', 'matrix'],
  '41': ['arrays', 'hash-maps'],
  '1405': ['greedy', 'heaps', 'strings'],
  '2384': ['greedy', 'counting', 'strings'],
  '1': ['arrays', 'hash-maps'],
  '20': ['stacks', 'strings'],
  '22': ['backtracking', 'strings'],
  '37': ['backtracking', 'matrix'],
  '49': ['hash-maps', 'strings', 'sorting'],
  '4': ['binary-search', 'arrays'],
  '6': ['strings', 'simulation'],
  '11': ['two-pointers', 'arrays'],
  '15': ['two-pointers', 'sorting', 'arrays'],
};
