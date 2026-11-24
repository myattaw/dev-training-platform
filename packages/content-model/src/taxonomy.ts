import { type ActivityRef, activityKey, checkActivityRef, type ContentIds } from './roles';
import { ID_PATTERN, type ValidationIssue } from './validate';

/*
 * Technology and practice taxonomy used by job roles and the job description
 * analyzer. Each term lists the names a job posting may use for it and the
 * PracStack practice that covers it. A term with no practice is "not covered
 * yet": the analyzer reports it honestly instead of pointing at something
 * unrelated.
 */

export type TermCategory =
  | 'language'
  | 'framework'
  | 'database'
  | 'cloud'
  | 'devops'
  | 'testing'
  | 'security'
  | 'business-apps'
  | 'engineering'
  | 'practice'
  | 'architecture';

/** Display order, which is also the order of a suggested preparation path. */
export const TERM_CATEGORIES: readonly TermCategory[] = [
  'language',
  'framework',
  'database',
  'testing',
  'security',
  'architecture',
  'devops',
  'cloud',
  'business-apps',
  'engineering',
  'practice',
];

export const TERM_CATEGORY_LABELS: Readonly<Record<TermCategory, string>> = {
  language: 'Languages',
  framework: 'Frameworks and libraries',
  database: 'Databases and data',
  testing: 'Testing',
  security: 'Security',
  architecture: 'Architecture and integration',
  devops: 'DevOps and tooling',
  cloud: 'Cloud',
  'business-apps': 'Business applications',
  engineering: 'Engineering competencies',
  practice: 'Ways of working',
};

/**
 * Spellings that can mean something else, e.g. "ADO" (Azure DevOps, or
 * ActiveX Data Objects) or "ASP.NET" on its own (classic or Core). They are
 * reported with low confidence.
 */
export interface TermAmbiguity {
  readonly aliases: readonly string[];
  /**
   * When set, an ambiguous alias counts only if one of these words (or words
   * starting with them, e.g. "pipeline" → "pipelines") is in the same
   * sentence or line. Without it, the alias always counts, with low confidence.
   */
  readonly context?: readonly string[];
  /** Why it is ambiguous; shown next to the result. */
  readonly note: string;
}

export interface TaxonomyTerm {
  /** Stable kebab-case id, e.g. `aspnet-core`. Saved plans store these. */
  readonly id: string;
  /** Canonical name; an exact match is high confidence. */
  readonly label: string;
  readonly category: TermCategory;
  /** Unambiguous alternative names (high confidence, like the label). */
  readonly aliases: readonly string[];
  /** Abbreviations, informal or historical names (medium confidence). */
  readonly variants?: readonly string[];
  /**
   * Names (label, aliases, variants or ambiguous aliases) that only match with
   * exactly this case, e.g. "REST" (not "the rest of"), "React" (not "react to").
   */
  readonly matchCase?: readonly string[];
  readonly ambiguity?: TermAmbiguity;
  /** PracStack practice for this term, in learning order. Empty: not covered yet. */
  readonly practice: readonly ActivityRef[];
  /** Skill Mastery tracks (technology ids) about this term, for "browse the track" links. */
  readonly tracks?: readonly string[];
  /** Shown with the term, e.g. "Formerly Microsoft Flow." */
  readonly note?: string;
  /**
   * How well `practice` covers the term. Defaults: `executable` when the practice
   * includes a coding challenge or scenario, `conceptual` for skills only,
   * `related` when only `relatedPractice` exists, `none` otherwise. Set it to
   * say `partial` (or `executable` for skills whose questions run code or SQL).
   */
  readonly coverage?: CoverageLevel;
  /**
   * Practice that teaches something close but not the term itself, e.g. modern
   * C# for .NET Framework, ASP.NET Core for classic ASP.NET MVC. Never counted
   * as coverage.
   */
  readonly relatedPractice?: readonly ActivityRef[];
  /** What PracStack does not cover, and where to study it instead. */
  readonly gap?: TermGap;
}

/**
 * How PracStack covers a term:
 * - `executable`: you write code or SQL that is run and graded;
 * - `conceptual`: knowledge questions (multiple choice, predict the output…);
 * - `partial`: direct practice for part of the term only;
 * - `related`: only related practice (transferable, but not the term itself);
 * - `none`: not covered.
 */
export type CoverageLevel = 'executable' | 'conceptual' | 'partial' | 'related' | 'none';

export const COVERAGE_LEVELS: readonly CoverageLevel[] = [
  'executable',
  'conceptual',
  'partial',
  'related',
  'none',
];

export const COVERAGE_LABELS: Readonly<Record<CoverageLevel, string>> = {
  executable: 'Hands-on practice',
  conceptual: 'Knowledge practice',
  partial: 'Partly covered',
  related: 'Related practice only',
  none: 'Not covered',
};

/** An official learning resource (documentation), for what PracStack does not cover. */
export interface TermResource {
  readonly label: string;
  /** https only, on an allowed documentation host (see RESOURCE_HOSTS). */
  readonly url: string;
}

export interface TermGap {
  /** What is not covered, in one or two sentences. */
  readonly notCovered: string;
  readonly resources?: readonly TermResource[];
}

/** Documentation hosts resource links may point at (official vendor documentation). */
export const RESOURCE_HOSTS: readonly string[] = [
  'learn.microsoft.com',
  'docs.aws.amazon.com',
  'git-scm.com',
  'docs.github.com',
  'kubernetes.io',
  'docs.docker.com',
  'react.dev',
  'docs.python.org',
  'www.w3.org',
  'owasp.org',
];

/** The coverage level of a term (explicit, or derived from its practice). */
export function coverageOf(
  term: Pick<TaxonomyTerm, 'practice' | 'coverage' | 'relatedPractice'>,
): CoverageLevel {
  if (term.coverage) return term.coverage;
  if (term.practice.length > 0) {
    return term.practice.some((r) => r.kind !== 'skill') ? 'executable' : 'conceptual';
  }
  return (term.relatedPractice?.length ?? 0) > 0 ? 'related' : 'none';
}

/** Direct practice exists (hands-on or knowledge questions), for all or part of the term. */
export const isDirectCoverage = (level: CoverageLevel): boolean =>
  level === 'executable' || level === 'conceptual';

/** Public file with every term (referenced from the manifest). */
export interface TaxonomyFile {
  readonly terms: readonly TaxonomyTerm[];
}

export const TAXONOMY_FILE = 'taxonomy.json';

/** A term is covered when PracStack has direct practice for it (all or part of it). */
export const isCovered = (term: Pick<TaxonomyTerm, 'practice'>): boolean =>
  term.practice.length > 0;

/** Every name a term can be matched by, with the confidence of a match. */
export function termNames(
  term: TaxonomyTerm,
): { readonly name: string; readonly confidence: 'high' | 'medium' | 'low' }[] {
  return [
    { name: term.label, confidence: 'high' as const },
    ...term.aliases.map((name) => ({ name, confidence: 'high' as const })),
    ...(term.variants ?? []).map((name) => ({ name, confidence: 'medium' as const })),
    ...(term.ambiguity?.aliases ?? []).map((name) => ({ name, confidence: 'low' as const })),
  ];
}

const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

export interface TaxonomyValidationContext extends ContentIds {
  /** Skill Mastery technology ids. */
  readonly technologyIds: ReadonlySet<string>;
}

/** Unique ids and names, known categories, and practice that exists. */
export function validateTaxonomy(
  terms: readonly TaxonomyTerm[],
  context: TaxonomyValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });

  const ids = new Set<string>();
  /** Normalized name → term id, across the whole taxonomy. */
  const owners = new Map<string, string>();
  for (const term of terms) {
    const path = `term:${term.id}`;
    if (ids.has(term.id)) error(path, 'duplicate term id');
    ids.add(term.id);
    if (!ID_PATTERN.test(term.id)) error(path, `id "${term.id}" must be lowercase kebab-case`);
    if (term.label.trim() === '') error(path, 'label is required');
    if (!TERM_CATEGORIES.includes(term.category)) {
      error(path, `unknown category "${term.category}"`);
    }

    const names = termNames(term);
    for (const { name } of names) {
      if (name.trim() === '') {
        error(path, 'names must not be empty');
        continue;
      }
      const key = normalizeName(name);
      const owner = owners.get(key);
      if (owner === term.id) error(path, `"${name}" is listed twice`);
      else if (owner) error(path, `"${name}" is already a name of "${owner}"`);
      owners.set(key, term.id);
    }
    for (const name of term.matchCase ?? []) {
      if (!names.some((n) => n.name === name)) {
        error(path, `matchCase "${name}" is not one of the term's names`);
      }
    }
    if (term.ambiguity) {
      if (term.ambiguity.aliases.length === 0) error(path, 'ambiguity needs at least one alias');
      if (term.ambiguity.note.trim() === '') error(path, 'ambiguity needs a note');
      if (term.ambiguity.context?.some((c) => c.trim() === '')) {
        error(path, 'ambiguity context words must not be empty');
      }
    }

    const keys = new Set<string>();
    term.practice.forEach((ref, i) => {
      const problem = checkActivityRef(ref, context);
      if (problem) error(`${path}/practice[${i}]`, problem);
      const key = activityKey(ref);
      if (keys.has(key)) error(`${path}/practice[${i}]`, `"${key}" appears twice`);
      keys.add(key);
    });
    term.relatedPractice?.forEach((ref, i) => {
      const problem = checkActivityRef(ref, context);
      if (problem) error(`${path}/relatedPractice[${i}]`, problem);
      if (keys.has(activityKey(ref))) {
        error(`${path}/relatedPractice[${i}]`, `"${activityKey(ref)}" is also direct practice`);
      }
    });
    if (term.coverage !== undefined) {
      if (!COVERAGE_LEVELS.includes(term.coverage)) {
        error(path, `unknown coverage "${term.coverage}"`);
      } else if (
        term.practice.length > 0 &&
        (term.coverage === 'none' || term.coverage === 'related')
      ) {
        error(path, `coverage "${term.coverage}" contradicts its direct practice`);
      } else if (
        term.practice.length === 0 &&
        term.coverage !== 'none' &&
        term.coverage !== 'related'
      ) {
        error(path, `coverage "${term.coverage}" needs direct practice`);
      }
    }
    const level = coverageOf(term);
    if (level !== 'executable' && level !== 'conceptual' && !term.gap) {
      error(path, `a term with coverage "${level}" needs a gap explaining what is not covered`);
    }
    if (term.gap) {
      if (term.gap.notCovered.trim() === '') error(`${path}/gap`, 'notCovered is required');
      for (const r of term.gap.resources ?? []) {
        let host = '';
        try {
          const url = new URL(r.url);
          host = url.protocol === 'https:' ? url.hostname : '';
        } catch {
          host = '';
        }
        if (!RESOURCE_HOSTS.includes(host)) {
          error(
            `${path}/gap`,
            `resource "${r.url}" must be https on an allowed documentation host`,
          );
        }
        if (r.label.trim() === '') error(`${path}/gap`, 'resource label is required');
      }
    }
    for (const track of term.tracks ?? []) {
      if (!context.technologyIds.has(track)) error(`${path}/tracks`, `unknown track "${track}"`);
    }
  }
  return issues;
}
