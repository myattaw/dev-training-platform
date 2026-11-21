/**
 * Worker thread that executes SQL with PGlite (PostgreSQL compiled to
 * WebAssembly). Runs inside the SQL runner process, never in the API.
 *
 * Isolation layers (see docs/sql.md):
 * - a fresh database per run, cloned from a prepared template;
 * - the session user is switched to `learner`, a role that can only SELECT
 *   the exercise tables; `set_config` is revoked so the role cannot be reset;
 * - the query runs inside `DECLARE CURSOR` (one read-only query, no
 *   data-modifying CTEs) in a READ ONLY transaction;
 * - PGlite has no network or process access, and only a virtual filesystem;
 * - the supervising thread kills this worker on timeout or memory overuse.
 */
import { createHash } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import { PGlite } from '@electric-sql/pglite';
import type { SqlColumn, SqlDatabaseSpec, SqlRunResult, SqlValue } from '../types';
import { cursorBody } from '../statement';

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

/** Prepared databases (data directory dumps), keyed by a hash of their setup SQL. */
const templates = new Map<string, Promise<File | Blob>>();
const MAX_TEMPLATES = 16;

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

function template(spec: SqlDatabaseSpec): Promise<File | Blob> {
  const key = createHash('sha256')
    .update(spec.schemaSql)
    .update('\0')
    .update(spec.dataSql)
    .digest('hex');
  let cached = templates.get(key);
  if (!cached) {
    cached = (async () => {
      const admin = await PGlite.create();
      try {
        await admin.exec(spec.schemaSql);
        await admin.exec(spec.dataSql);
        await admin.exec(LEARNER_SETUP);
        return await admin.dumpDataDir('none');
      } finally {
        await admin.close();
        collectGarbage();
      }
    })();
    cached.catch(() => templates.delete(key));
    if (templates.size >= MAX_TEMPLATES) templates.delete(templates.keys().next().value!);
    templates.set(key, cached);
  }
  return cached;
}

async function run(job: WorkerJob): Promise<SqlRunResult> {
  const started = performance.now();
  let dataDir: File | Blob;
  try {
    dataDir = await template(job.database);
  } catch (err) {
    // Exercise setup is authored content; a failure here is a content bug.
    return {
      kind: 'error',
      message: `The exercise database could not be created: ${messageOf(err)}`,
    };
  }

  const db = await PGlite.create({ loadDataDir: dataDir });
  // Setup done (our own work); from here on the learner's query is timed.
  parentPort?.postMessage(PREPARED);
  try {
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
parentPort?.postMessage('ready');
