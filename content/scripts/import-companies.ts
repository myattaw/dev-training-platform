/**
 * Imports a folder of company CSVs (one sub-folder per company, one CSV per
 * time window) into a normalized dataset file, for sources that PracStack is
 * authorized to use.
 *
 *   npx tsx content/scripts/import-companies.ts --source <id> --dir <folder> --out <dataset.json> [--dry-run]
 *
 * - Refuses sources whose license review does not allow bulk import
 *   (`bulkImportAllowed`, see content/src/companies/sources.ts).
 * - Incremental and repeatable: an existing `--out` file is loaded and merged;
 *   importing the same files again changes nothing.
 * - Prints a summary; rejected rows and conflicts are listed, never applied.
 *   Exits with code 1 if there are any.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCompanyFile, WINDOW_FILES } from '../src/companies/import/company-csv';
import {
  type CompanyDataset,
  emptyDataset,
  emptySummary,
  formatSummary,
  mergeCompanyFile,
} from '../src/companies/import/dataset';
import { EDITORIAL_TAGS, SOURCES } from '../src/companies/sources';

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    dir: { type: 'string' },
    out: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const source = SOURCES.find((s) => s.id === values.source);
if (!source || !values.dir || !values.out) {
  console.error(
    'Usage: import-companies --source <id> --dir <folder> --out <dataset.json> [--dry-run]',
  );
  process.exit(2);
}
if (!source.bulkImportAllowed) {
  console.error(
    `Refusing to import "${source.id}": its license status is "${source.license.status}". ${source.license.note}`,
  );
  process.exit(1);
}

let dataset: CompanyDataset = existsSync(values.out)
  ? (JSON.parse(readFileSync(values.out, 'utf8')) as CompanyDataset)
  : emptyDataset();
const summary = emptySummary();
const importedAt = new Date().toISOString();

for (const folder of readdirSync(values.dir).sort()) {
  const dir = join(values.dir, folder);
  if (!statSync(dir).isDirectory()) continue;
  for (const fileName of readdirSync(dir).sort()) {
    if (!(fileName in WINDOW_FILES)) continue;
    try {
      const parsed = parseCompanyFile({
        source,
        companyFolder: folder,
        fileName,
        text: readFileSync(join(dir, fileName), 'utf8'),
        importedAt,
        editorialTags: EDITORIAL_TAGS,
      });
      dataset = mergeCompanyFile(dataset, parsed, source, summary).dataset;
    } catch (err) {
      summary.rejectedRows.push({
        file: `${folder}/${fileName}`,
        line: 0,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

console.log(formatSummary(summary));
for (const r of summary.rejectedRows) console.log(`rejected  ${r.file}:${r.line}  ${r.reason}`);
for (const c of summary.conflicts) {
  console.log(`conflict  ${c.subject}: kept "${c.existing}", ignored "${c.incoming}"`);
}
if (!values['dry-run']) writeFileSync(values.out, JSON.stringify(dataset, null, 2) + '\n');
process.exit(summary.rejectedRows.length + summary.conflicts.length > 0 ? 1 : 0);
