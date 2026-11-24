/**
 * Local SQL Server 2022 Developer edition for the SQL Server (T-SQL) track.
 * Developer edition is free for development and testing (not production).
 * Starting it accepts Microsoft's SQL Server license terms (ACCEPT_EULA=Y).
 *
 *   npm run sqlserver:start   # starts (or reuses) the "pracstack-sqlserver" container on 127.0.0.1:1433
 *   npm run sqlserver:stop    # stops it; the next start reuses its data and password
 *   npm run sqlserver:remove  # deletes it (and .local/sqlserver.json)
 *
 * About 1.6 GB to download once; uses up to 2 CPU threads and 2.5 GB of memory.
 */
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { localSqlServer, SQLSERVER_CONTAINER } from '@pracstack/sql-engine';

const stateFile = join(import.meta.dirname, '..', '.local', 'sqlserver.json');
const command = process.argv[2];

if (command === 'start') {
  console.log('Starting SQL Server 2022 Developer edition (first start downloads ~1.6 GB)…');
  const server = await localSqlServer(stateFile, true);
  console.log(
    `SQL Server is ready on ${server?.host}:${server?.port}. Restart "npm start" to use it.`,
  );
} else if (command === 'stop') {
  execFileSync('docker', ['stop', SQLSERVER_CONTAINER], { stdio: 'inherit' });
} else if (command === 'remove') {
  execFileSync('docker', ['rm', '-f', SQLSERVER_CONTAINER], { stdio: 'inherit' });
  rmSync(stateFile, { force: true });
  console.log('Removed the local SQL Server container and its settings.');
} else {
  console.error('Usage: tsx scripts/sqlserver.mts start|stop|remove');
  process.exit(1);
}
