/**
 * Worker thread that executes SQL with PGlite (PostgreSQL compiled to
 * WebAssembly). Runs inside the SQL runner process, never in the API.
 *
 * Isolation layers (see docs/sql.md):
 * - a fresh database per run, started from an empty cluster (base-cluster.ts);
 * - the session user is switched to `learner`, a role that can only SELECT
 *   the exercise tables; `set_config` is revoked so the role cannot be reset;
 * - the query runs inside `DECLARE CURSOR` (one read-only query, no
 *   data-modifying CTEs) in a READ ONLY transaction;
 * - PGlite has no network or process access, and only a virtual filesystem;
 * - the supervising thread kills this worker on timeout or memory overuse.
 */
import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';
import { PGlite } from '@electric-sql/pglite';
import type { SqlColumn, SqlDatabaseSpec, SqlRunResult, SqlValue } from '../types';
import { cursorBody } from '../statement';
import { makeBaseCluster } from './base-cluster';

export interface WorkerJob {
  readonly database: SqlDatabaseSpec;
  readonly query: string;
  readonly maxRows: number;
}

const LEARNER_SETUP = `
  CREATE ROLE learner NOLOGIN;
  GRANT USAGE ON SCHEMA public TO learner;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO learner;
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION set_config(text, text, boolean) FROM PUBLIC;
`;

const TYPE_NAMES: Readonly<Record<number, string>> = {
  16: 'bool',
  20: 'int8',
  21: 'int2',
  23: 'int4',
  25: 'text',
  700: 'float4',
  701: 'float8',
  1042: 'bpchar',
  1043: 'varchar',
  1082: 'date',
  1083: 'time',
  1114: 'timestamp',
  1184: 'timestamptz',
  1186: 'interval',
  1700: 'numeric',
  114: 'json',
  3802: 'jsonb',
  2950: 'uuid',
};

/**
 * Closed PGlite instances keep their WebAssembly memory until garbage
 * collection; collecting right away returns it to the system, so it doesn't
 * linger into the next run. (The runner process is started with --expose-gc.)
 */
function collectGarbage(): void {
  (globalThis as { gc?: () => void }).gc?.();
}

/** Sent before the learner's query starts (see runner.ts). */
export const PREPARED = 'prepared';

/**
 * The empty cluster every run starts from: the dump shipped in the AWS runner
 * image (PRACSTACK_SQL_BASE), or one made on first use (about a second).
 */
let base: Promise<Blob> | undefined;
function baseCluster(): Promise<Blob> {
  base ??= (async () => {
    const shipped = process.env['PRACSTACK_SQL_BASE'];
    if (shipped) {
      try {
        return new Blob([await readFile(shipped)]);
      } catch {
        /* missing or unreadable: make one */
      }
    }
    const made = await makeBaseCluster();
    collectGarbage();
    return made;
  })();
  base.catch(() => (base = undefined));
  return base;
}

async function run(job: WorkerJob): Promise<SqlRunResult> {
  const started = performance.now();
  let db: PGlite;
  try {
    db = await PGlite.create({ loadDataDir: await baseCluster() });
  } catch (err) {
    return { kind: 'error', message: `The SQL engine could not start: ${messageOf(err)}` };
  }
  try {
    try {
      // As the setup superuser: the exercise's tables and rows (milliseconds), then the role.
      await db.exec(job.database.schemaSql);
      await db.exec(job.database.dataSql);
      await db.exec(LEARNER_SETUP);
    } catch (err) {
      // Exercise setup is authored content; a failure here is a content bug.
      return {
        kind: 'error',
        message: `The exercise database could not be created: ${messageOf(err)}`,
      };
    }
    // Setup done (our own work); from here on the learner's query is timed.
    parentPort?.postMessage(PREPARED);
    await db.exec('SET SESSION AUTHORIZATION learner');
    await db.exec('BEGIN READ ONLY');
    try {
      await db.query(`DECLARE pracstack_cursor NO SCROLL CURSOR FOR ${cursorBody(job.query)}`);
      const result = await db.query<SqlValue[]>(
        `FETCH ${job.maxRows + 1} FROM pracstack_cursor`,
        [],
        {
          rowMode: 'array',
        },
      );
      const columns: SqlColumn[] = result.fields.map((f) => ({
        name: f.name,
        type: TYPE_NAMES[f.dataTypeID] ?? `oid:${f.dataTypeID}`,
      }));
      const rows = result.rows
        .slice(0, job.maxRows)
        .map((row) => row.map((value, i) => normalizeValue(value, columns[i]?.type ?? '')));
      return {
        kind: 'rows',
        columns,
        rows,
        truncated: result.rows.length > job.maxRows,
        durationMs: Math.round(performance.now() - started),
      };
    } catch (err) {
      return { kind: 'error', message: messageOf(err) };
    }
  } finally {
    await db.close().catch(() => undefined);
    collectGarbage();
  }
}

/** Converts PGlite's parsed values into JSON-safe, display-friendly primitives. */
export function normalizeValue(value: unknown, type: string): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (value instanceof Uint8Array) return `\\x${Buffer.from(value).toString('hex')}`;
  return JSON.stringify(value, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

parentPort?.on('message', (job: WorkerJob) => {
  run(job).then(
    (result) => parentPort?.postMessage(result),
    (err: unknown) =>
      parentPort?.postMessage({ kind: 'error', message: messageOf(err) } satisfies SqlRunResult),
  );
});
// Start on the empty cluster now, so the first query does not wait for it.
if (parentPort) void baseCluster().catch(() => undefined);
parentPort?.postMessage('ready');
