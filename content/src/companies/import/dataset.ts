import type {
  Company,
  CompanyQuestionAssociation,
  DataSource,
  ExternalProblemReference,
} from '@pracstack/content-model';
import type { ParsedCompanyFile, RejectedRow } from './company-csv';

/**
 * The normalised result of all imports: companies, problem references (each
 * stored once, however many companies list it) and the many-to-many
 * associations between them.
 *
 * Merging is pure and repeatable: importing the same file twice changes
 * nothing. Disagreements are reported as conflicts and the existing data is
 * kept; nothing is silently overwritten.
 */
export interface CompanyDataset {
  readonly sources: readonly DataSource[];
  readonly companies: Readonly<Record<string, Company>>;
  readonly references: Readonly<Record<string, ExternalProblemReference>>;
  readonly associations: readonly CompanyQuestionAssociation[];
}

export const emptyDataset = (): CompanyDataset => ({
  sources: [],
  companies: {},
  references: {},
  associations: [],
});

export interface ImportConflict {
  /** What disagrees, e.g. `reference lc:2296 title`. */
  readonly subject: string;
  readonly existing: string;
  readonly incoming: string;
}

export interface ImportSummary {
  companiesAdded: number;
  referencesAdded: number;
  referencesUpdated: number;
  referencesUnchanged: number;
  associationsAdded: number;
  associationsUpdated: number;
  associationsUnchanged: number;
  /** Incoming associations older than the stored ones; ignored. */
  associationsStale: number;
  readonly rejectedRows: RejectedRow[];
  readonly conflicts: ImportConflict[];
}

export const emptySummary = (): ImportSummary => ({
  companiesAdded: 0,
  referencesAdded: 0,
  referencesUpdated: 0,
  referencesUnchanged: 0,
  associationsAdded: 0,
  associationsUpdated: 0,
  associationsUnchanged: 0,
  associationsStale: 0,
  rejectedRows: [],
  conflicts: [],
});

const associationKey = (a: CompanyQuestionAssociation): string =>
  [a.companyId, a.problemId, a.sourceId, a.window].join('|');

/** Adds one parsed file to the dataset. Returns a new dataset; the input is not changed. */
export function mergeCompanyFile(
  dataset: CompanyDataset,
  file: ParsedCompanyFile,
  source: DataSource,
  summary: ImportSummary = emptySummary(),
): { dataset: CompanyDataset; summary: ImportSummary } {
  const sources = dataset.sources.some((s) => s.id === source.id)
    ? dataset.sources
    : [...dataset.sources, source];
  const companies = { ...dataset.companies };
  const references = { ...dataset.references };
  const associations = new Map(dataset.associations.map((a) => [associationKey(a), a]));
  summary.rejectedRows.push(...file.rejected);

  const existingCompany = companies[file.company.id];
  if (!existingCompany) {
    companies[file.company.id] = file.company;
    summary.companiesAdded++;
  } else if (existingCompany.displayName !== file.company.displayName) {
    summary.conflicts.push({
      subject: `company ${file.company.id} name`,
      existing: existingCompany.displayName,
      incoming: file.company.displayName,
    });
  }

  /** Problem ids whose reference conflicted; their associations are skipped too. */
  const conflicted = new Set<string>();
  for (const incoming of file.references) {
    const existing = references[incoming.id];
    if (!existing) {
      references[incoming.id] = incoming;
      summary.referencesAdded++;
      continue;
    }
    let conflict = false;
    for (const field of ['title', 'externalUrl', 'difficulty'] as const) {
      if (existing[field] !== incoming[field]) {
        conflict = true;
        summary.conflicts.push({
          subject: `reference ${incoming.id} ${field}`,
          existing: existing[field],
          incoming: incoming[field],
        });
      }
    }
    if (conflict) {
      conflicted.add(incoming.id);
      continue;
    }
    const tags = [...new Set([...existing.editorialTags, ...incoming.editorialTags])];
    // The acceptance rate is a live statistic on the provider; the newest value wins.
    if (
      existing.acceptanceRate !== incoming.acceptanceRate ||
      tags.length !== existing.editorialTags.length
    ) {
      references[incoming.id] = {
        ...existing,
        ...(incoming.acceptanceRate !== undefined
          ? { acceptanceRate: incoming.acceptanceRate }
          : {}),
        editorialTags: tags,
      };
      summary.referencesUpdated++;
    } else {
      summary.referencesUnchanged++;
    }
  }

  for (const incoming of file.associations) {
    if (conflicted.has(incoming.problemId)) continue;
    const key = associationKey(incoming);
    const existing = associations.get(key);
    if (!existing) {
      associations.set(key, incoming);
      summary.associationsAdded++;
    } else if (incoming.sourceSnapshotDate > existing.sourceSnapshotDate) {
      associations.set(key, incoming);
      summary.associationsUpdated++;
    } else if (incoming.sourceSnapshotDate < existing.sourceSnapshotDate) {
      summary.associationsStale++;
    } else if (existing.reportedFrequency !== incoming.reportedFrequency) {
      summary.conflicts.push({
        subject: `association ${key} frequency (same snapshot)`,
        existing: String(existing.reportedFrequency),
        incoming: String(incoming.reportedFrequency),
      });
    } else {
      summary.associationsUnchanged++;
    }
  }

  return {
    dataset: { sources, companies, references, associations: [...associations.values()] },
    summary,
  };
}

/** One-line report for the console. */
export function formatSummary(summary: ImportSummary): string {
  return [
    `companies +${summary.companiesAdded}`,
    `references +${summary.referencesAdded} ~${summary.referencesUpdated} =${summary.referencesUnchanged}`,
    `associations +${summary.associationsAdded} ~${summary.associationsUpdated} =${summary.associationsUnchanged} stale ${summary.associationsStale}`,
    `rejected rows ${summary.rejectedRows.length}`,
    `conflicts ${summary.conflicts.length}`,
  ].join(', ');
}
