/**
 * Runs learner T-SQL on SQL Server (locally: the Developer edition container;
 * see sqlserver-container.ts and scripts/sqlserver.mts).
 *
 * There is one long-lived server, so isolation comes from SQL Server itself,
 * set up and enforced here:
 *
 * - every dataset (schema + data) lives in its own database, built once by
 *   `sa` and then set READ_ONLY: nothing can change it, and readers take no
 *   locks, so one learner cannot block another;
 * - learner SQL runs as a dataset-specific login whose only permission is
 *   SELECT on that database's `dbo` schema; `guest` is disabled, so it cannot
 *   open other datasets (hidden data included), and it cannot list databases;
 * - each run uses a FRESH connection, so nothing a batch leaves in its
 *   session (temp tables, SET options) reaches another run;
 * - limits: a per-request timeout (the batch is cancelled), a lock timeout,
 *   rows fetched (the batch is cancelled after one extra row), one result
 *   set per query, and runs at a time;
 * - server-level features that reach the file system or network stay off
 *   (`xp_cmdshell`, OLE automation, ad hoc OPENROWSET, CLR, external
 *   scripts), and the file-system extended procedures are revoked from
 *   `public`.
 *
 * The `sa` password never reaches learner sessions.
 */
import { createHash, createHmac } from 'node:crypto';
import { Connection, Request } from 'tedious';
import { precheckQuery, splitStatements } from './statement';
import {
  DEFAULT_SQL_LIMITS,
  type SqlEngine,
  type SqlLimits,
  type SqlRunRequest,
  type SqlRunResult,
  type SqlValue,
} from './types';

export interface SqlServerConnectionInfo {
  readonly host: string;
  readonly port: number;
  /** Password of `sa` (setup only; never used for learner SQL). */
  readonly adminPassword: string;
}

export interface SqlServerEngineOptions {
  readonly connection: SqlServerConnectionInfo;
  readonly limits?: Partial<SqlLimits>;
  readonly maxConcurrent?: number;
  readonly maxQueue?: number;
}

/** Prefixes of the databases and logins this engine creates (and may drop). */
const DATABASE_PREFIX = 'ps_d_';
const LOGIN_PREFIX = 'ps_l_';
const LOCK_TIMEOUT_MS = 1000;
const SESSION_SETTINGS =
  `SET LOCK_TIMEOUT ${LOCK_TIMEOUT_MS}; SET LANGUAGE us_english; ` +
  'SET DATEFORMAT ymd; SET DATEFIRST 7; SET TEXTSIZE 65536;';
/** Off by default; enforced in case the server was changed. */
const DISABLED_OPTIONS = [
  'xp_cmdshell',
  'Ole Automation Procedures',
  'Ad Hoc Distributed Queries',
  'clr enabled',
  'external scripts enabled',
];
/** Extended procedures granted to public that read the server's file system or registry. */
const REVOKED_FROM_PUBLIC = [
  'xp_dirtree',
  'xp_fileexist',
  'xp_subdirs',
  'xp_regread',
  'xp_instance_regread',
  'xp_getnetname',
  'xp_msver',
];

interface Dataset {
  readonly database: string;
  readonly login: string;
  readonly password: string;
}

interface ColumnMeta {
  readonly colName: string;
  readonly dataLength: number | undefined;
  readonly type: { readonly name: string };
}
interface ColumnValue {
  readonly value: unknown;
  readonly metadata: ColumnMeta;
}

export class SqlServerSqlEngine implements SqlEngine {
  /** Content checks run this many questions at once (see checkSqlQuestions). */
  readonly concurrency: number;
  private readonly limits: SqlLimits;
  private readonly maxQueue: number;
  private ready: Promise<void> | undefined;
  private readonly datasets = new Map<string, Promise<Dataset>>();
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: SqlServerEngineOptions) {
    this.limits = { ...DEFAULT_SQL_LIMITS, ...options.limits };
    this.concurrency = options.maxConcurrent ?? 4;
    this.maxQueue = options.maxQueue ?? 20;
  }

  async run(request: SqlRunRequest): Promise<SqlRunResult> {
    const problem = precheckQuery(request.query, this.limits.maxQueryLength);
    if (problem) return { kind: 'rejected', message: problem };
    if (this.running >= this.concurrency && this.waiting.length >= this.maxQueue) {
      return { kind: 'rejected', message: 'The SQL service is busy. Try again in a moment.' };
    }
    await this.acquire();
    try {
      let dataset: Dataset;
      try {
        await this.setUp();
        dataset = await this.dataset(request);
      } catch (err) {
        if (isConnectFailure(err)) return unavailable();
        return {
          kind: 'error',
          message: `The practice database could not be prepared: ${errorMessage(err)}`,
        };
      }
      return await this.execute(dataset, request);
    } finally {
      this.release();
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  /** Removes every database and login this engine created. */
  async reset(): Promise<void> {
    const admin = await this.admin();
    try {
      const logins = await query(
        admin,
        `SELECT name FROM sys.server_principals WHERE name LIKE '${LOGIN_PREFIX}%'`,
      );
      for (const [name] of logins) await query(admin, `DROP LOGIN ${bracket(String(name))}`);
      const dbs = await query(
        admin,
        `SELECT name FROM sys.databases WHERE name LIKE '${DATABASE_PREFIX}%'`,
      );
      for (const [name] of dbs) await dropDatabase(admin, String(name));
    } finally {
      admin.close();
    }
    this.datasets.clear();
  }

  private async execute(dataset: Dataset, request: SqlRunRequest): Promise<SqlRunResult> {
    const started = Date.now();
    const remaining = () => Math.max(1, this.limits.timeoutMs - (Date.now() - started));
    let connection: Connection | undefined;
    try {
      // A fresh session for every run: nothing a previous batch did carries over.
      connection = await connect(this.options.connection, {
        user: dataset.login,
        password: dataset.password,
        database: dataset.database,
        timeoutMs: remaining(),
      });
      await query(connection, SESSION_SETTINGS, remaining());
      const result = await collect(connection, request.query, request.maxRows, remaining());
      if (result.kind !== 'rows') return result;
      return { ...result, durationMs: Date.now() - started };
    } catch (err) {
      return classifySqlServerError(err, this.limits.timeoutMs);
    } finally {
      connection?.close();
    }
  }

  /** One-time hardening. Idempotent. */
  private setUp(): Promise<void> {
    this.ready ??= (async () => {
      const admin = await this.admin();
      try {
        await query(admin, "EXEC sp_configure 'show advanced options', 1; RECONFIGURE;");
        for (const option of DISABLED_OPTIONS) {
          await query(
            admin,
            `BEGIN TRY EXEC sp_configure '${option}', 0; RECONFIGURE; END TRY BEGIN CATCH END CATCH`,
          );
        }
        for (const proc of REVOKED_FROM_PUBLIC) {
          await query(
            admin,
            `BEGIN TRY REVOKE EXECUTE ON sys.${proc} FROM public; END TRY BEGIN CATCH END CATCH`,
          );
        }
        // Learners see only master, tempdb and their own dataset in sys.databases.
        await query(admin, 'REVOKE VIEW ANY DATABASE FROM public;');
      } finally {
        admin.close();
      }
    })().catch((err: unknown) => {
      this.ready = undefined;
      throw err;
    });
    return this.ready;
  }

  /** Creates (once) the database and the learner login of a dataset. */
  private dataset(request: SqlRunRequest): Promise<Dataset> {
    const key = createHash('sha256')
      .update(request.database.schemaSql)
      .update('\0')
      .update(request.database.dataSql)
      .digest('hex')
      .slice(0, 20);
    let entry = this.datasets.get(key);
    if (!entry) {
      entry = this.createDataset(key, request).catch((err: unknown) => {
        this.datasets.delete(key);
        throw err;
      });
      this.datasets.set(key, entry);
    }
    return entry;
  }

  /**
   * Creates a dataset's database and learner login, or reuses them. Safe when
   * several processes share one server (the API, a content build, tests): the
   * learner password is derived from the admin password and the dataset, so
   * every process computes the same one, and the login is enabled only once
   * the dataset is complete, which marks it ready.
   */
  private async createDataset(key: string, request: SqlRunRequest): Promise<Dataset> {
    const dataset: Dataset = {
      database: `${DATABASE_PREFIX}${key}`,
      login: `${LOGIN_PREFIX}${key}`,
      password: `Pl!${createHmac('sha256', this.options.connection.adminPassword)
        .update(key)
        .digest('base64url')
        .slice(0, 28)}`,
    };
    const admin = await this.admin();
    const resource = `pracstack_build_${key}`;
    try {
      // One build at a time per dataset, across every process using this server.
      const [[granted]] = await query(
        admin,
        `DECLARE @r int; EXEC @r = sp_getapplock @Resource = N'${resource}', ` +
          "@LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 60000; SELECT @r;",
      );
      if (typeof granted !== 'number' || granted < 0)
        throw new Error(`Could not lock the dataset (sp_getapplock ${String(granted)}).`);
      try {
        const [state] = await query(
          admin,
          `SELECT is_disabled FROM sys.server_principals WHERE name = N'${dataset.login}'`,
        );
        if (state?.[0] !== false) await build(admin, dataset, request);
      } finally {
        await query(
          admin,
          `USE master; EXEC sp_releaseapplock @Resource = N'${resource}', @LockOwner = 'Session';`,
        );
      }
      return dataset;
    } finally {
      admin.close();
    }
  }

  private admin(): Promise<Connection> {
    return connect(this.options.connection, {
      user: 'sa',
      password: this.options.connection.adminPassword,
      database: 'master',
      timeoutMs: 120_000,
    });
  }

  private acquire(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(() => resolve()));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }
}

async function build(
  admin: Connection,
  { database, login, password }: Dataset,
  request: SqlRunRequest,
): Promise<void> {
  const db = bracket(database);
  const user = bracket(login);
  // Leftovers of an interrupted build are removed first.
  await query(admin, `IF SUSER_ID(N'${login}') IS NOT NULL DROP LOGIN ${user};`);
  await dropDatabase(admin, database);
  await query(admin, `CREATE DATABASE ${db}; ALTER DATABASE ${db} SET RECOVERY SIMPLE;`);
  await query(admin, `USE ${db};`);
  for (const sql of splitStatements(request.database.schemaSql)) await query(admin, sql);
  for (const sql of splitStatements(request.database.dataSql)) await query(admin, sql);
  await query(admin, 'REVOKE CONNECT FROM guest;');
  await query(
    admin,
    `USE master; CREATE LOGIN ${user} WITH PASSWORD = N'${password}', ` +
      `DEFAULT_DATABASE = ${db}, CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF; ALTER LOGIN ${user} DISABLE;`,
  );
  await query(
    admin,
    `USE ${db}; CREATE USER ${user} FOR LOGIN ${user}; GRANT SELECT ON SCHEMA::dbo TO ${user};`,
  );
  await query(admin, `USE master; ALTER DATABASE ${db} SET READ_ONLY WITH ROLLBACK IMMEDIATE;`);
  // Ready: only now can the learner log in.
  await query(admin, `ALTER LOGIN ${user} ENABLE;`);
}

async function dropDatabase(admin: Connection, name: string): Promise<void> {
  const db = bracket(name);
  await query(
    admin,
    `USE master; IF DB_ID(N'${name}') IS NOT NULL BEGIN ` +
      `ALTER DATABASE ${db} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${db}; END`,
  );
}

/** Quotes an identifier this engine generated (letters, digits and `_` only). */
function bracket(name: string): string {
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Unexpected identifier "${name}"`);
  return `[${name}]`;
}

function connect(
  info: SqlServerConnectionInfo,
  login: { user: string; password: string; database: string; timeoutMs: number },
): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const connection = new Connection({
      server: info.host,
      authentication: {
        type: 'default',
        options: { userName: login.user, password: login.password },
      },
      options: {
        port: info.port,
        database: login.database,
        // The local container has a self-signed certificate.
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: Math.max(1000, Math.min(login.timeoutMs, 10_000)),
        requestTimeout: login.timeoutMs,
        useUTC: true,
        useColumnNames: false,
        rowCollectionOnDone: false,
        rowCollectionOnRequestCompletion: false,
        appName: 'pracstack',
      },
    });
    // Errors after connecting (the server closing the socket) surface on requests.
    connection.on('error', () => undefined);
    connection.connect((err) => (err ? reject(err) : resolve(connection)));
  });
}

/** Runs a batch and returns its rows as raw values (setup and admin queries). */
function query(connection: Connection, sql: string, timeoutMs?: number): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const rows: unknown[][] = [];
    const request = new Request(sql, (err) => (err ? reject(err) : resolve(rows)));
    if (timeoutMs !== undefined) request.setTimeout(timeoutMs);
    request.on('row', (columns: ColumnValue[]) => rows.push(columns.map((c) => c.value)));
    connection.execSqlBatch(request);
  });
}

/**
 * Runs learner SQL as one batch and collects its single result set, up to
 * `maxRows + 1` rows; the batch is cancelled as soon as there are enough rows,
 * or when a second result set starts.
 */
function collect(
  connection: Connection,
  sql: string,
  maxRows: number,
  timeoutMs: number,
): Promise<SqlRunResult> {
  return new Promise((resolve, reject) => {
    let columns: ColumnMeta[] | undefined;
    const rows: SqlValue[][] = [];
    let stop: 'truncated' | 'second-result' | undefined;
    const request = new Request(sql, (err) => {
      if (stop === 'second-result') {
        resolve({
          kind: 'rejected',
          message: 'Write a single query: this returns more than one result set.',
        });
      } else if (err && !stop) {
        reject(err);
      } else if (!columns) {
        resolve({ kind: 'error', message: 'The query did not return a result set.' });
      } else {
        resolve({
          kind: 'rows',
          columns: columns.map((c) => ({ name: c.colName, type: typeName(c) })),
          rows: rows.slice(0, maxRows),
          truncated: rows.length > maxRows,
          durationMs: 0,
        });
      }
    });
    request.setTimeout(timeoutMs);
    request.on('columnMetadata', (metadata) => {
      // An array, because useColumnNames is off.
      const meta = metadata as unknown as ColumnMeta[];
      if (stop) return;
      if (columns) {
        stop = 'second-result';
        connection.cancel();
        return;
      }
      columns = meta;
    });
    request.on('row', (values: ColumnValue[]) => {
      if (stop) return;
      rows.push(values.map((v) => sqlServerValue(v.value, typeName(v.metadata))));
      if (rows.length > maxRows) {
        stop = 'truncated';
        connection.cancel();
      }
    });
    connection.execSqlBatch(request);
  });
}

/** The T-SQL type name of a result column (tedious reports nullable types as e.g. `IntN`). */
export function typeName(meta: Pick<ColumnMeta, 'dataLength' | 'type'>): string {
  const length = meta.dataLength;
  switch (meta.type.name) {
    case 'IntN':
      return (
        ({ 1: 'tinyint', 2: 'smallint', 4: 'int', 8: 'bigint' } as Record<number, string>)[
          length ?? 4
        ] ?? 'int'
      );
    case 'FloatN':
      return length === 4 ? 'real' : 'float';
    case 'DateTimeN':
      return length === 4 ? 'smalldatetime' : 'datetime';
    case 'MoneyN':
      return length === 4 ? 'smallmoney' : 'money';
    case 'DecimalN':
      return 'decimal';
    case 'NumericN':
      return 'numeric';
    case 'BitN':
      return 'bit';
    default:
      return meta.type.name.toLowerCase();
  }
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Converts a fetched value into the engine-neutral SqlValue. Exported for tests. */
export function sqlServerValue(value: unknown, type: string): SqlValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // tedious reads values without a time zone as UTC (useUTC).
    const day = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    const ms = value.getUTCMilliseconds();
    const time =
      `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}` +
      (ms ? `.${pad(ms, 3)}` : '');
    if (type === 'date') return day;
    if (type === 'time') return time;
    if (type === 'datetimeoffset') return value.toISOString();
    return time === '00:00:00' ? day : `${day} ${time}`;
  }
  if (type === 'bigint' && typeof value === 'string') {
    // tedious returns BIGINT as text; a number when it is exact.
    return Number.isSafeInteger(Number(value)) ? Number(value) : value;
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string')
    return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  return JSON.stringify(value);
}

/** Opens and closes an `sa` connection (readiness check). */
export async function pingSqlServer(info: SqlServerConnectionInfo): Promise<void> {
  const connection = await connect(info, {
    user: 'sa',
    password: info.adminPassword,
    database: 'master',
    timeoutMs: 5000,
  });
  try {
    await query(connection, 'SELECT 1');
  } finally {
    connection.close();
  }
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0] ?? message;
}

const errorProp = (err: unknown, key: string): unknown =>
  typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[key] : undefined;

/** Network-level failures to reach the server or log in. */
export function isConnectFailure(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Error).name === 'ConnectionError' &&
    ['ESOCKET', 'ETIMEOUT', 'ELOGIN'].includes(String(errorProp(err, 'code')))
  );
}

const unavailable = (): SqlRunResult => ({
  kind: 'error',
  message: 'The SQL engine is not available. Is the SQL Server container running?',
});

/** Maps a SQL Server or driver error to a result. Exported for tests. */
export function classifySqlServerError(err: unknown, timeoutMs: number): SqlRunResult {
  const code = errorProp(err, 'code');
  const number = errorProp(err, 'number');
  if (isConnectFailure(err)) return unavailable();
  // Request timeout (the batch is cancelled), or waiting for a lock (1222).
  if (code === 'ETIMEOUT' || number === 1222) return { kind: 'timeout', timeoutMs };
  // Out of memory or space (data, log or tempdb).
  if (typeof number === 'number' && [701, 802, 1105, 1204, 8645, 9002].includes(number)) {
    return {
      kind: 'resource-limit',
      message: 'The query used too many resources and was stopped.',
    };
  }
  if (typeof number === 'number') {
    const level = errorProp(err, 'class');
    const line = errorProp(err, 'lineNumber');
    return {
      kind: 'error',
      message:
        `Msg ${number}, Level ${String(level)}` +
        (typeof line === 'number' && line > 0 ? `, Line ${line}` : '') +
        `: ${errorMessage(err)}`,
    };
  }
  return unavailable();
}
