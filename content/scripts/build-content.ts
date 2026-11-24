/**
 * Validates all content and writes:
 *   content/dist/public/   served to browsers (copied into the web build)
 *   content/dist/private/  grading data for the API and runners; never served
 *
 * Exits with code 1 if any validation error is found, so CI and `npm run build`
 * stop before broken content can ship.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  localOracle,
  localSqlServer,
  OracleSqlEngine,
  SqlServerSqlEngine,
} from '@pracstack/sql-engine';
import { buildContent, type FileSet } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'dist');

// Oracle reference queries are checked when the local Oracle is running (npm run oracle:start).
const oracle = await localOracle(resolve(here, '..', '..', '.local', 'oracle.json'), false).catch(
  () => undefined,
);
// T-SQL reference queries are checked when the local SQL Server is running (npm run sqlserver:start).
const sqlServer = await localSqlServer(
  resolve(here, '..', '..', '.local', 'sqlserver.json'),
  false,
).catch(() => undefined);
const build = await buildContent({
  sqlEngines: {
    ...(oracle ? { oracle: new OracleSqlEngine({ connection: oracle }) } : {}),
    ...(sqlServer ? { sqlserver: new SqlServerSqlEngine({ connection: sqlServer }) } : {}),
  },
});
const errors = build.issues.filter((i) => i.severity === 'error');
const warnings = build.issues.filter((i) => i.severity === 'warning');

for (const w of warnings) console.warn(`warning  ${w.path}: ${w.message}`);
for (const e of errors) console.error(`error    ${e.path}: ${e.message}`);

if (errors.length > 0) {
  console.error(`\nContent build failed with ${errors.length} error(s).`);
  process.exit(1);
}

writeAll(join(root, 'public'), build.publicFiles);
writeAll(join(root, 'private'), build.privateFiles);

console.log(
  `Content ${build.contentVersion}: ${build.publicFiles.size} public and ${build.privateFiles.size} private files` +
    (warnings.length > 0 ? `, ${warnings.length} warning(s)` : ''),
);

function writeAll(dir: string, files: FileSet): void {
  rmSync(dir, { recursive: true, force: true });
  for (const [path, value] of files) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  }
}
