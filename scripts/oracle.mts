/**
 * Local Oracle Database Free for the Oracle SQL track.
 *
 *   npm run oracle:start   # starts (or reuses) the "pracstack-oracle" container on 127.0.0.1:1521
 *   npm run oracle:stop    # stops it; the next start reuses its data and password
 *   npm run oracle:remove  # deletes it (and .local/oracle.json)
 *
 * About 1.3 GB to download once; uses up to 2 CPU threads and 2.5 GB of memory.
 */
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { LOCAL_CONTAINER, localOracle, stopContainer } from '@pracstack/sql-engine';

const stateFile = join(import.meta.dirname, '..', '.local', 'oracle.json');
const command = process.argv[2];

if (command === 'start') {
  console.log('Starting Oracle Database Free (first start downloads ~1.3 GB)…');
  const oracle = await localOracle(stateFile, true);
  console.log(`Oracle is ready on ${oracle?.connectString}. Restart "npm start" to use it.`);
} else if (command === 'stop') {
  execFileSync('docker', ['stop', LOCAL_CONTAINER], { stdio: 'inherit' });
} else if (command === 'remove') {
  await stopContainer(LOCAL_CONTAINER);
  rmSync(stateFile, { force: true });
  console.log('Removed the local Oracle container and its settings.');
} else {
  console.error('Usage: tsx scripts/oracle.mts start|stop|remove');
  process.exit(1);
}
