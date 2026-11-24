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
}

/** Public file with every term (referenced from the manifest). */
export interface TaxonomyFile {
  readonly terms: readonly TaxonomyTerm[];
}

export const TAXONOMY_FILE = 'taxonomy.json';

/** A term is covered when PracStack has practice for it. */
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
    for (const track of term.tracks ?? []) {
      if (!context.technologyIds.has(track)) error(`${path}/tracks`, `unknown track "${track}"`);
    }
  }
  return issues;
}
