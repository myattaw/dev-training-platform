import type { ChallengeCategory, Difficulty } from './challenge';

/*
 * Company Interview Prep.
 *
 * Two kinds of content are kept strictly apart:
 *
 * - External problem references: problems on another provider (e.g. LeetCode)
 *   that a third-party dataset associates with a company. PracStack stores only
 *   facts about them (title, difficulty, link) with provenance; never their
 *   statements, tests or solutions. They cannot be practiced in PracStack.
 * - Owned challenges: problems written by PracStack (`content/src/challenges`),
 *   which can be practiced and graded here. They are linked to companies only
 *   as *recommended practice*, never as "asked by this company".
 */

/** Competency tags shared by owned challenges and (editorially tagged) external references. */
export const COMPETENCIES = {
  arrays: 'arrays',
  'hash-maps': 'hash maps',
  sets: 'sets',
  strings: 'string manipulation',
  stacks: 'stacks',
  'linked-lists': 'linked lists',
  sorting: 'sorting',
  design: 'class design',
  'cursor-state': 'cursor state management',
  'text-editing': 'insertion and deletion in text',
  'command-parsing': 'command processing',
  'undo-redo': 'undo and redo history',
  'index-boundaries': 'index boundaries',
  'two-pointers': 'two pointers',
  matrix: '2-D grids',
  simulation: 'step-by-step simulation',
  'dynamic-programming': 'dynamic programming',
  greedy: 'greedy choices',
  backtracking: 'backtracking',
  'binary-search': 'binary search',
  heaps: 'heaps',
  counting: 'counting',
  math: 'arithmetic',
  // Enterprise development (Enterprise Scenarios and their challenges).
  'rest-apis': 'REST API design',
  'input-validation': 'input validation',
  'access-control': 'access control',
  'data-aggregation': 'grouping and totals',
  refactoring: 'refactoring legacy code',
} as const;

export type Competency = keyof typeof COMPETENCIES;

export const isCompetency = (tag: string): tag is Competency => Object.hasOwn(COMPETENCIES, tag);

/** Whether a challenge can be practiced. */
export type ChallengeAvailability = 'available' | 'coming-soon' | 'retired';

/** Who can practice a challenge once it is available. Enforced by the API. */
export type ContentAccess = 'free' | 'pro';

/**
 * A challenge that is announced but not written yet. Only this metadata
 * exists; there is nothing to open, run or grade.
 */
export interface PlannedChallenge {
  readonly id: string;
  readonly title: string;
  /** Short, original description. */
  readonly summary: string;
  readonly category: ChallengeCategory;
  readonly difficulty: Difficulty;
  readonly tags: readonly Competency[];
  readonly availability: 'coming-soon';
  readonly access: ContentAccess;
  /** Skill Mastery skills that prepare for it. */
  readonly relatedSkills?: readonly string[];
}

/* ---------------- Sources and provenance ---------------- */

/**
 * Rights status of a third-party source.
 *
 * - `unverified`: no license found; only a small, manually curated sample may
 *   be used for demonstration, and bulk import is refused.
 * - `licensed`: written permission or an explicit license allows the use.
 */
export type SourceLicenseStatus = 'unverified' | 'licensed';

export interface DataSource {
  readonly id: string;
  readonly name: string;
  /** Where the data comes from (shown to learners as attribution). */
  readonly url: string;
  /** Provider of the referenced problems, e.g. LeetCode. */
  readonly provider: string;
  readonly providerUrl: string;
  /** ISO date of the snapshot the source states, e.g. `2026-07-12`. */
  readonly snapshotDate: string;
  readonly license: {
    readonly status: SourceLicenseStatus;
    /** What was checked and when; see docs/company-data-licensing.md. */
    readonly note: string;
  };
  /** Bulk import allowed. False unless the license status is `licensed`. */
  readonly bulkImportAllowed: boolean;
}

/**
 * Time window a source associates a problem with a company in, e.g. the
 * source's "Last 30 days" list.
 */
export type ObservationWindow =
  'thirty-days' | 'three-months' | 'six-months' | 'more-than-six-months' | 'all';

export const OBSERVATION_WINDOW_LABELS: Readonly<Record<ObservationWindow, string>> = {
  'thirty-days': 'Last 30 days',
  'three-months': 'Last 3 months',
  'six-months': 'Last 6 months',
  'more-than-six-months': 'More than 6 months ago',
  all: 'All time',
};

/** A problem on an external provider. Facts and a link only; no statement. */
export interface ExternalProblemReference {
  /** `<source>:<externalId>`, e.g. `lc-companywise:2296`. */
  readonly id: string;
  readonly sourceId: string;
  /** The provider's own problem number. */
  readonly externalId: string;
  readonly title: string;
  readonly externalUrl: string;
  readonly difficulty: Difficulty;
  /** Acceptance rate on the provider, 0–100, as stated by the source. */
  readonly acceptanceRate?: number;
  /**
   * Competencies, assigned by PracStack editors (not by the source). Used to
   * explain recommendations.
   */
  readonly editorialTags: readonly Competency[];
}

/** "The source lists this problem for this company, in this window." */
export interface CompanyQuestionAssociation {
  readonly companyId: string;
  readonly problemId: string;
  readonly sourceId: string;
  readonly window: ObservationWindow;
  /**
   * The source's "frequency" column, 0–100. Its meaning is defined by the
   * source (a relative ranking within the company's list), **not** a
   * probability of being asked.
   */
  readonly reportedFrequency?: number;
  readonly sourceSnapshotDate: string;
  /** ISO timestamp of the import that produced this association. */
  readonly importedAt: string;
}

export interface Company {
  /** Stable slug, e.g. `liberty-mutual`. Never reused. */
  readonly id: string;
  readonly displayName: string;
  /** Other names people search for, e.g. "Liberty Mutual Insurance". */
  readonly aliases: readonly string[];
}

/* ---------------- Recommendations ---------------- */

export type RecommendationConfidence = 'high' | 'medium' | 'low';

/**
 * A PracStack challenge recommended to someone preparing for a company. It is
 * related practice, never a claim that the company asks it.
 */
export interface CompanyRecommendation {
  readonly companyId: string;
  /** Owned challenge id, or a planned challenge id. */
  readonly challengeId: string;
  /** External reference the recommendation relates to, if any. */
  readonly sourceProblemId?: string;
  /** One sentence for learners, e.g. "Practices cursor state management." */
  readonly reason: string;
  readonly similarityTags: readonly Competency[];
  readonly confidence: RecommendationConfidence;
  /** `curated`: chosen by an editor; `computed`: ranked from shared competencies. */
  readonly origin: 'curated' | 'computed';
  readonly editorialReviewStatus: 'reviewed' | 'unreviewed';
}

/** One step of a company preparation path. */
export type PreparationTarget =
  | { readonly kind: 'skill'; readonly skillId: string }
  | { readonly kind: 'challenge'; readonly challengeId: string }
  | { readonly kind: 'timed-session' };

export interface PreparationStep {
  readonly title: string;
  readonly description: string;
  readonly target: PreparationTarget;
}

/** A structured plan; shown only when every step points at content that exists. */
export interface PreparationPath {
  readonly id: string;
  readonly companyId: string;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly PreparationStep[];
}

/** Everything the content build needs to know about one curated company. */
export interface CompanyContent {
  readonly company: Company;
  readonly references: readonly ExternalProblemReference[];
  readonly associations: readonly CompanyQuestionAssociation[];
  readonly recommendations: readonly CompanyRecommendation[];
  readonly preparationPaths: readonly PreparationPath[];
  /**
   * The demo sample holds only some of the source's rows for this company;
   * this is how many the source lists in total (for "6 of 63" labels).
   */
  readonly sourceRowCount?: number;
}

/** Private content file served by the API (`companies/<id>.json`). */
export const companyFile = (companyId: string): string => `companies/${companyId}.json`;
export const COMPANY_INDEX_FILE = 'companies/index.json';

/** Company search index row. */
export interface CompanyIndexEntry {
  readonly id: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  /** Lowercased, accent-free name and aliases, for matching. */
  readonly searchText: string;
  readonly questionCount: number;
  readonly sourceRowCount?: number;
}

export interface CompanyIndexFile {
  readonly sources: readonly DataSource[];
  readonly companies: readonly CompanyIndexEntry[];
}

/**
 * Normalizes a company name for search and comparison: lower case, accents
 * removed, `&` → `and`, punctuation dropped, whitespace collapsed.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Stable slug for a company name, e.g. "Liberty Mutual" → `liberty-mutual`. */
export function companySlug(name: string): string {
  return normalizeCompanyName(name).replace(/ /g, '-');
}
