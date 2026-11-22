import { readFileSync } from 'node:fs';
import {
  type ChallengeSummary,
  COMPANY_INDEX_FILE,
  type CompanyContent,
  companyFile,
  type CompanyIndexEntry,
  type CompanyIndexFile,
  isCompetency,
  normalizeCompanyName,
  type PlannedChallenge,
  type PreparationPath,
  type TrackSource,
  type ValidationIssue,
} from '@pracstack/content-model';
import { parseCompanyFile } from './import/company-csv';
import {
  type CompanyDataset,
  emptyDataset,
  emptySummary,
  mergeCompanyFile,
} from './import/dataset';
import { CURATED_RECOMMENDATIONS, PREPARATION_PATHS } from './curation';
import { PLANNED_CHALLENGES } from './planned';
import { type CuratedRecommendation, recommend } from './recommend';
import {
  DEMO_COMPANIES,
  type DemoCompany,
  EDITORIAL_TAGS,
  LC_COMPANYWISE,
  SOURCES,
} from './sources';

/** Fixed import time for the demo sample, so the content hash is stable. */
export const DEMO_IMPORTED_AT = '2026-11-22T00:00:00.000Z';

/** Phrases that would present a reference or recommendation as more than it is. */
const UNSUPPORTED_CLAIMS =
  /\b(asks|asked|will ask|official|guarantee|chance|definitely|likely to appear)\b/i;

export interface CompanyBuildInput {
  readonly challenges: readonly ChallengeSummary[];
  readonly tracks: readonly TrackSource[];
  readonly planned?: readonly PlannedChallenge[];
  readonly demo?: readonly DemoCompany[];
  readonly readDemoFile?: (folder: string, file: string) => string;
  readonly curated?: Readonly<Record<string, readonly CuratedRecommendation[]>>;
  readonly paths?: readonly PreparationPath[];
}

export interface CompanyBuild {
  readonly issues: ValidationIssue[];
  readonly files: Map<string, unknown>;
  readonly dataset: CompanyDataset;
}

const readDemo = (folder: string, file: string): string =>
  readFileSync(new URL(`./demo/${folder}/${file}`, import.meta.url), 'utf8');

/** Imports the demo sample through the real pipeline and produces the private company files. */
export function buildCompanies(input: CompanyBuildInput): CompanyBuild {
  const planned = input.planned ?? PLANNED_CHALLENGES;
  const demo = input.demo ?? DEMO_COMPANIES;
  const curated = input.curated ?? CURATED_RECOMMENDATIONS;
  const paths = input.paths ?? PREPARATION_PATHS;
  const read = input.readDemoFile ?? readDemo;
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });

  // ---- import ----
  let dataset = emptyDataset();
  const summary = emptySummary();
  for (const company of demo) {
    for (const fileName of company.files) {
      const parsed = parseCompanyFile({
        source: LC_COMPANYWISE,
        companyFolder: company.folder,
        fileName,
        text: read(company.folder, fileName),
        importedAt: DEMO_IMPORTED_AT,
        displayName: company.displayName,
        editorialTags: EDITORIAL_TAGS,
      });
      dataset = mergeCompanyFile(dataset, parsed, LC_COMPANYWISE, summary).dataset;
    }
  }
  for (const row of summary.rejectedRows) {
    error(`company-data:${row.file}:${row.line}`, `rejected row: ${row.reason}`);
  }
  for (const c of summary.conflicts) {
    error(`company-data:${c.subject}`, `conflict: "${c.existing}" vs "${c.incoming}"`);
  }

  // ---- references to content ----
  const owned = new Map(input.challenges.map((c) => [c.id, c]));
  const plannedById = new Map(planned.map((p) => [p.id, p]));
  const skills = new Set(
    input.tracks.flatMap((t) => t.topics.flatMap((topic) => topic.skills.map((s) => s.id))),
  );
  for (const p of planned) {
    if (owned.has(p.id)) error(`planned:${p.id}`, 'id is already used by an available challenge');
    for (const tag of p.tags)
      if (!isCompetency(tag)) error(`planned:${p.id}`, `unknown tag ${tag}`);
    for (const s of p.relatedSkills ?? []) {
      if (!skills.has(s)) error(`planned:${p.id}`, `unknown related skill ${s}`);
    }
  }
  for (const c of input.challenges) {
    for (const tag of c.tags) {
      if (!isCompetency(tag)) {
        issues.push({
          severity: 'warning',
          path: `challenge:${c.id}`,
          message: `tag "${tag}" is not a known competency, so it is not used for recommendations`,
        });
      }
    }
  }
  for (const ref of Object.values(dataset.references)) {
    if (ref.editorialTags.length === 0) {
      issues.push({
        severity: 'warning',
        path: `reference:${ref.id}`,
        message: 'no editorial tags, so it cannot drive recommendations',
      });
    }
  }

  // ---- per company ----
  const files = new Map<string, unknown>();
  const index: CompanyIndexEntry[] = [];
  for (const demoCompany of demo) {
    const company = dataset.companies[demoCompany.folder];
    if (!company) continue;
    const withAliases = { ...company, aliases: [...demoCompany.aliases] };
    const associations = dataset.associations.filter((a) => a.companyId === company.id);
    const problemIds = new Set(associations.map((a) => a.problemId));
    const references = [...problemIds]
      .map((id) => dataset.references[id])
      .filter((r) => r !== undefined)
      .sort((a, b) => a.title.localeCompare(b.title));
    const path = `company:${company.id}`;
    if (references.length === 0) error(path, 'has no references');

    const companyCurated = curated[company.id] ?? [];
    for (const c of companyCurated) {
      if (!owned.has(c.challengeId) && !plannedById.has(c.challengeId)) {
        error(path, `curated recommendation for unknown challenge ${c.challengeId}`);
      }
      if (c.sourceProblemId && !problemIds.has(c.sourceProblemId)) {
        error(
          path,
          `curated recommendation cites ${c.sourceProblemId}, which is not listed for it`,
        );
      }
    }
    const recommendations = recommend({
      companyId: company.id,
      references,
      associations,
      challenges: input.challenges,
      curated: companyCurated,
    });
    for (const r of recommendations) {
      if (UNSUPPORTED_CLAIMS.test(r.reason)) {
        error(path, `recommendation reason makes an unsupported claim: "${r.reason}"`);
      }
    }

    const companyPaths = paths.filter((p) => p.companyId === company.id);
    for (const p of companyPaths) {
      p.steps.forEach((step, i) => {
        const t = step.target;
        const where = `${path}/paths/${p.id}/steps[${i}]`;
        if (t.kind === 'challenge' && !owned.has(t.challengeId)) {
          error(where, `step needs available challenge ${t.challengeId}`);
        }
        if (t.kind === 'skill' && !skills.has(t.skillId))
          error(where, `unknown skill ${t.skillId}`);
      });
    }

    const content: CompanyContent = {
      company: withAliases,
      references,
      associations,
      recommendations,
      preparationPaths: companyPaths,
      sourceRowCount: demoCompany.sourceRowCount,
    };
    files.set(companyFile(company.id), content);
    index.push({
      id: company.id,
      displayName: company.displayName,
      aliases: withAliases.aliases,
      searchText: [company.displayName, ...withAliases.aliases]
        .map(normalizeCompanyName)
        .join(' | '),
      questionCount: references.length,
      sourceRowCount: demoCompany.sourceRowCount,
    });
  }
  for (const p of paths) {
    if (!dataset.companies[p.companyId]) error(`path:${p.id}`, `unknown company ${p.companyId}`);
  }
  for (const id of Object.keys(curated)) {
    if (!dataset.companies[id]) error(`curation:${id}`, 'unknown company');
  }

  index.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en'));
  files.set(COMPANY_INDEX_FILE, { sources: SOURCES, companies: index } satisfies CompanyIndexFile);
  return { issues, files, dataset };
}
