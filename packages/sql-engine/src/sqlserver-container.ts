/**
 * Runs SQL Server 2022 Developer edition in Docker for local development and
 * tests. Developer edition is free for development and testing only (not for
 * production); starting it accepts Microsoft's SQL Server license terms
 * (ACCEPT_EULA=Y), which the project owner has accepted.
 *
 * The server listens on 127.0.0.1 only. Its `sa` password is random and kept
 * in .local/sqlserver.json (git-ignored); it is used only to set up practice
 * datasets, never for learner SQL (see sqlserver-engine.ts).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { containerLogs, docker, hostPort, running, stopContainer } from './docker';
import { pingSqlServer, type SqlServerConnectionInfo } from './sqlserver-engine';

/** Microsoft's SQL Server 2022 Linux image (CU updates under 2022-latest), pinned. */
export const SQLSERVER_IMAGE =
  'mcr.microsoft.com/mssql/server:2022-latest@sha256:4525e3efac9f3e241cb003bb2ff2a82818b502f37e12049d788b1a9fa7e13b7f';
export const SQLSERVER_CONTAINER = 'pracstack-sqlserver';

export interface SqlServerContainer extends SqlServerConnectionInfo {
  readonly name: string;
}

/** A random password that meets SQL Server's complexity policy (upper, lower, digit, symbol). */
export const randomSqlServerPassword = (): string => `Ps!${randomBytes(18).toString('hex')}`;

async function waitUntilReady(
  name: string,
  connection: SqlServerConnectionInfo,
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (!(await running(name))) {
      const tail = (await containerLogs(name)).split('\n').slice(-5).join('\n');
      throw new Error(`The SQL Server container "${name}" stopped while starting.\n${tail}`);
    }
    if ((await containerLogs(name)).includes('SQL Server is now ready for client connections')) {
      try {
        await pingSqlServer(connection);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `SQL Server did not become ready within ${timeoutMs / 1000} s: ${String(lastError)}`,
  );
}

async function startContainer(name: string, password: string): Promise<SqlServerContainer> {
  try {
    await docker([
      'run',
      '-d',
      '--name',
      name,
      '-p',
      '127.0.0.1:1433:1433',
      '--memory',
      '2560m',
      '--cpus',
      '2',
      '-e',
      'ACCEPT_EULA=Y',
      '-e',
      'MSSQL_PID=Developer',
      '-e',
      'MSSQL_MEMORY_LIMIT_MB=2048',
      '-e',
      `MSSQL_SA_PASSWORD=${password}`,
      SQLSERVER_IMAGE,
    ]);
  } catch (err) {
    throw new Error(
      `Could not start SQL Server (${SQLSERVER_IMAGE}). Is Docker running, and is port 1433 free? ${(err as Error).message}`,
      { cause: err },
    );
  }
  const port = await hostPort(name, '1433/tcp');
  const container = { name, host: '127.0.0.1', port, adminPassword: password };
  await waitUntilReady(name, container);
  return container;
}

/** The repository's local SQL Server settings (git-ignored). */
export const LOCAL_SQLSERVER_STATE_FILE = fileURLToPath(
  new URL('../../../.local/sqlserver.json', import.meta.url),
);

interface LocalState {
  readonly password: string;
  readonly port: number;
}

/**
 * The local development SQL Server: started if needed, reused across runs.
 * Returns undefined when it is not running and `start` is false.
 */
export async function localSqlServer(
  stateFile: string,
  start: boolean,
): Promise<SqlServerContainer | undefined> {
  const state = existsSync(stateFile)
    ? (JSON.parse(readFileSync(stateFile, 'utf8')) as LocalState)
    : undefined;
  const fromState = (s: LocalState): SqlServerContainer => ({
    name: SQLSERVER_CONTAINER,
    host: '127.0.0.1',
    port: s.port,
    adminPassword: s.password,
  });
  if (state && (await running(SQLSERVER_CONTAINER))) return fromState(state);
  if (!start) return undefined;
  if (state) {
    // Stopped: start it again with the same data and password.
    await docker(['start', SQLSERVER_CONTAINER]).catch(() => '');
    if (await running(SQLSERVER_CONTAINER)) {
      await waitUntilReady(SQLSERVER_CONTAINER, fromState(state));
      return fromState(state);
    }
  }
  await stopContainer(SQLSERVER_CONTAINER);
  const password = randomSqlServerPassword();
  const container = await startContainer(SQLSERVER_CONTAINER, password);
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ password, port: container.port }, null, 2), {
    mode: 0o600,
  });
  return container;
}

/** The SQL Server used by tests: the local development server, started if it is not running. */
export async function sqlServerForTests(): Promise<SqlServerContainer> {
  const server = await localSqlServer(LOCAL_SQLSERVER_STATE_FILE, true);
  if (!server) throw new Error('SQL Server did not start.');
  return server;
}
