/**
 * Runs Oracle Database Free in Docker for local development and tests.
 * The database listens on 127.0.0.1 only. Its SYS/SYSTEM password is random
 * and kept in .local/oracle.json (git-ignored); it is used only to set up
 * practice datasets, never for learner SQL (see oracle-engine.ts).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { containerLogs, docker, hostPort, running, stopContainer } from './docker';
import type { OracleConnectionInfo } from './oracle-engine';

export { stopContainer };

/** Oracle Database 23ai Free, slim build (community image by Oracle's Gerald Venzl), pinned. */
export const ORACLE_IMAGE =
  'gvenzl/oracle-free:23-slim-faststart@sha256:cebd977833411a42170777d8e9ccf616a028a2bb137ae96498354ab6c7510268';
export const LOCAL_CONTAINER = 'pracstack-oracle';

export interface OracleContainer extends OracleConnectionInfo {
  readonly name: string;
  readonly port: number;
}

interface StartOptions {
  readonly name: string;
  /** Host port on 127.0.0.1; 0 picks a free one. */
  readonly port: number;
  readonly password: string;
  /** Remove the container when it stops (tests). */
  readonly ephemeral: boolean;
}

async function waitUntilReady(name: string, timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await containerLogs(name)).includes('DATABASE IS READY TO USE')) return;
    if (!(await running(name)))
      throw new Error(`The Oracle container "${name}" stopped while starting.`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Oracle did not become ready within ${timeoutMs / 1000} s.`);
}

export async function startContainer(options: StartOptions): Promise<OracleContainer> {
  try {
    await docker([
      'run',
      '-d',
      ...(options.ephemeral ? ['--rm'] : []),
      '--name',
      options.name,
      '-p',
      `127.0.0.1:${options.port === 0 ? '' : options.port}:1521`,
      // Oracle Free uses at most 2 CPU threads and 2 GB of memory.
      '--memory',
      '2560m',
      '--cpus',
      '2',
      '-e',
      `ORACLE_PASSWORD=${options.password}`,
      ORACLE_IMAGE,
    ]);
  } catch (err) {
    throw new Error(
      `Could not start Oracle (${ORACLE_IMAGE}). Is Docker running? ${(err as Error).message}`,
      { cause: err },
    );
  }
  await waitUntilReady(options.name);
  const port = await hostPort(options.name, '1521/tcp');
  return {
    name: options.name,
    port,
    connectString: `localhost:${port}/FREEPDB1`,
    adminPassword: options.password,
  };
}

/** A strong random password Oracle accepts (letters and digits, starting with a letter). */
export const randomOraclePassword = (): string => `P${randomBytes(18).toString('hex')}`;

/** The repository's local Oracle settings (git-ignored). */
export const LOCAL_STATE_FILE = fileURLToPath(
  new URL('../../../.local/oracle.json', import.meta.url),
);

/**
 * The Oracle used by tests: the local development database, started if it
 * is not running. One shared database (about 2.5 GB of memory) instead of one
 * per test suite; tests only create content-addressed datasets, which the
 * engine shares safely between processes.
 */
export async function oracleForTests(): Promise<OracleContainer> {
  const oracle = await localOracle(LOCAL_STATE_FILE, true);
  if (!oracle) throw new Error('Oracle did not start.');
  return oracle;
}

interface LocalState {
  readonly password: string;
  readonly port: number;
}

/**
 * The local development database: started if needed, reused across runs.
 * Returns undefined when it is not running and `start` is false.
 */
export async function localOracle(
  stateFile: string,
  start: boolean,
): Promise<OracleContainer | undefined> {
  const state = existsSync(stateFile)
    ? (JSON.parse(readFileSync(stateFile, 'utf8')) as LocalState)
    : undefined;
  if (state && (await running(LOCAL_CONTAINER))) {
    return {
      name: LOCAL_CONTAINER,
      port: state.port,
      connectString: `localhost:${state.port}/FREEPDB1`,
      adminPassword: state.password,
    };
  }
  if (!start) return undefined;
  if (state) {
    // Stopped: start it again with the same data and password.
    await docker(['start', LOCAL_CONTAINER]).catch(() => '');
    if (await running(LOCAL_CONTAINER)) {
      await waitUntilReady(LOCAL_CONTAINER);
      return localOracle(stateFile, false);
    }
  }
  await stopContainer(LOCAL_CONTAINER);
  const password = randomOraclePassword();
  const container = await startContainer({
    name: LOCAL_CONTAINER,
    port: 1521,
    password,
    ephemeral: false,
  });
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ password, port: container.port }, null, 2), {
    mode: 0o600,
  });
  return container;
}
