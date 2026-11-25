/**
 * Writes an empty PostgreSQL cluster dump to the path given as the first
 * argument. Run while building the SQL runner image (see sql.Dockerfile), with
 * the same PGlite the runner uses, so the runner never runs initdb.
 */
import { writeFileSync } from 'node:fs';
import { makeBaseCluster } from './base-cluster';

const out = process.argv[2];
if (!out) {
  console.error('Usage: make-base-cluster <output file>');
  process.exit(2);
}
const dump = await makeBaseCluster();
writeFileSync(out, Buffer.from(await dump.arrayBuffer()));
console.log(`Wrote ${out} (${Math.round(dump.size / 1024 / 1024)} MB)`);
