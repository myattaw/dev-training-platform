/**
 * Runs learner SQL on Oracle Database Free (a local Docker container; see
 * docs/sql.md and scripts/oracle.ts).
 *
 * Unlike PGlite there is one long-lived database, so isolation comes from
 * Oracle itself, set up and enforced here:
 *
 * - every dataset (schema + data) lives in its own schema owned by a user
 *   that cannot log in, created once by the setup account;
 * - learner SQL runs as a dataset-specific user that can only log in and
 *   read (the READ privilege: no writes, no row locks) that one dataset's
 *   tables: it cannot see other datasets
 *   (hidden data included), cannot write, and cannot create anything;
 * - each run uses a FRESH connection, so nothing a query changes in its
 *   session (inline PL/SQL can) reaches another run;
 * - limits: a client-side call timeout (the query is cancelled), a CPU and
 *   logical-read limit per call (profile), a small dedicated temporary
 *   tablespace, rows fetched, and runs at a time;
 * - network and file packages are revoked from PUBLIC (they are already
 *   blocked by Oracle's default network ACLs).
 *
 * The setup account's password never reaches learner sessions.
 */
import { createHash, createHmac } from 'node:crypto';
import oracledb from 'oracledb';
import { precheckQuery, splitStatements, stripComments } from './statement';
import {
  DEFAULT_SQL_LIMITS,
  type SqlColumn,
  type SqlEngine,
  type SqlLimits,
  type SqlRunRequest,
  type SqlRunResult,
  type SqlValue,
} from './types';

export interface OracleConnectionInfo {
  /** e.g. `localhost:1521/FREEPDB1` */
  readonly connectString: string;
  /** Password of SYS and SYSTEM (setup only; never used for learner SQL). */
  readonly adminPassword: string;
}

export interface OracleEngineOptions {
  readonly connection: OracleConnectionInfo;
  readonly limits?: Partial<SqlLimits>;
  readonly maxConcurrent?: number;
  readonly maxQueue?: number;
}

const PROFILE = 'PRACSTACK_LEARNER';
const TEMP_TABLESPACE = 'PRACSTACK_TEMP';
/** Prefixes of the users this engine creates (and may drop). */
const OWNER_PREFIX = 'PS_D_';
const LEARNER_PREFIX = 'PS_L_';
/** Granted to PUBLIC by default; none is needed to query data. */
const REVOKED_FROM_PUBLIC = [
  'UTL_HTTP',
  'UTL_TCP',
  'UTL_SMTP',
  'UTL_INADDR',
  'UTL_FILE',
  'DBMS_LDAP',
  'HTTPURITYPE',
];
const SESSION_SETTINGS = [
  "ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD'",
  "ALTER SESSION SET NLS_TIMESTAMP_FORMAT = 'YYYY-MM-DD HH24:MI:SS.FF3'",
  "ALTER SESSION SET NLS_NUMERIC_CHARACTERS = '.,'",
  "ALTER SESSION SET TIME_ZONE = 'UTC'",
];

interface Dataset {
  readonly owner: string;
  readonly learner: string;
  readonly password: string;
}

export class OracleSqlEngine implements SqlEngine {
  private readonly limits: SqlLimits;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private ready: Promise<void> | undefined;
  private readonly datasets = new Map<string, Promise<Dataset>>();
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: OracleEngineOptions) {
    this.limits = { ...DEFAULT_SQL_LIMITS, ...options.limits };
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.maxQueue = options.maxQueue ?? 20;
  }

  async run(request: SqlRunRequest): Promise<SqlRunResult> {
    const problem =
      precheckQuery(request.query, this.limits.maxQueryLength) ?? oracleProblem(request.query);
    if (problem) return { kind: 'rejected', message: problem };
    if (this.running >= this.maxConcurrent && this.waiting.length >= this.maxQueue) {
      return { kind: 'rejected', message: 'The SQL service is busy. Try again in a moment.' };
    }
    await this.acquire();
    try {
      let dataset: Dataset;
      try {
        await this.setUp();
        dataset = await this.dataset(request);
      } catch (err) {
        return {
          kind: 'error',
          message: `The practice database could not be prepared: ${oracleMessage(err)}`,
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

  /** Removes every user this engine created (their schemas included). */
  async reset(): Promise<void> {
    const admin = await this.admin();
    try {
      const users = await admin.execute<[string]>(
        `SELECT username FROM all_users WHERE username LIKE '${OWNER_PREFIX}%' OR username LIKE '${LEARNER_PREFIX}%'`,
      );
      for (const [name] of users.rows ?? []) await admin.execute(`DROP USER ${name} CASCADE`);
    } finally {
      await admin.close();
    }
    this.datasets.clear();
  }

  private async execute(dataset: Dataset, request: SqlRunRequest): Promise<SqlRunResult> {
    const started = Date.now();
    let connection: oracledb.Connection | undefined;
    try {
      // A fresh session for every run: nothing a previous query did carries over.
      connection = await this.learnerConnection(dataset);
      for (const sql of SESSION_SETTINGS) await connection.execute(sql);
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${dataset.owner}`);
      connection.callTimeout = Math.max(1, this.limits.timeoutMs - (Date.now() - started));

      const result = await connection.execute<unknown[]>(queryBody(request.query), [], {
        outFormat: oracledb.OUT_FORMAT_ARRAY,
        maxRows: request.maxRows + 1,
        fetchTypeHandler: fetchAsDisplayValue,
      });
      const rows = (result.rows ?? []).map((row) => row.map(normalizeOracleValue));
      const columns: SqlColumn[] = (result.metaData ?? []).map((m) => ({
        name: m.name.toLowerCase(),
        type: (m.dbTypeName ?? 'unknown').toLowerCase(),
      }));
      return {
        kind: 'rows',
        columns,
        rows: rows.slice(0, request.maxRows),
        truncated: rows.length > request.maxRows,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return classifyError(err, this.limits.timeoutMs);
    } finally {
      await connection?.close().catch(() => undefined);
    }
  }

  /** One-time hardening and shared objects. Idempotent. */
  private setUp(): Promise<void> {
    this.ready ??= (async () => {
      const sys = await oracledb.getConnection({
        user: 'sys',
        password: this.options.connection.adminPassword,
        connectString: this.options.connection.connectString,
        privilege: oracledb.SYSDBA,
      });
      try {
        for (const pkg of REVOKED_FROM_PUBLIC) {
          await ignore(sys.execute(`REVOKE EXECUTE ON SYS.${pkg} FROM PUBLIC`), [1927, 942, 4042]);
        }
        // Lets the setup account serialize dataset builds across processes (see createDataset).
        await sys.execute('GRANT EXECUTE ON SYS.DBMS_LOCK TO SYSTEM');
      } finally {
        await sys.close();
      }
      const admin = await this.admin();
      try {
        await ignore(
          admin.execute(
            `CREATE PROFILE ${PROFILE} LIMIT SESSIONS_PER_USER 10 ` +
              `CPU_PER_CALL ${Math.ceil(this.limits.timeoutMs / 10)} LOGICAL_READS_PER_CALL 500000 ` +
              'IDLE_TIME 5 CONNECT_TIME 10 FAILED_LOGIN_ATTEMPTS UNLIMITED PASSWORD_LIFE_TIME UNLIMITED',
          ),
          [2379],
        );
        // A small, fixed-size temporary tablespace: big sorts fail instead of filling the disk.
        // Its file goes next to the database's own temp file (no automatic file naming here).
        const existing = await admin.execute<[string]>(
          'SELECT file_name FROM dba_temp_files FETCH FIRST 1 ROWS ONLY',
        );
        const dir = (existing.rows?.[0]?.[0] ?? '').replace(/[^/]+$/, '');
        await ignore(
          admin.execute(
            `CREATE TEMPORARY TABLESPACE ${TEMP_TABLESPACE} TEMPFILE '${dir}pracstack_temp01.dbf' ` +
              'SIZE 64M AUTOEXTEND OFF',
          ),
          [1543],
        );
      } finally {
        await admin.close();
      }
    })().catch((err: unknown) => {
      this.ready = undefined;
      throw err;
    });
    return this.ready;
  }

  /** Creates (once) the schema and the learner user of a dataset. */
  private dataset(request: SqlRunRequest): Promise<Dataset> {
    const key = createHash('sha256')
      .update(request.database.schemaSql)
      .update('\0')
      .update(request.database.dataSql)
      .digest('hex')
      .slice(0, 20)
      .toUpperCase();
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
   * Creates a dataset's schema and learner user, or reuses them. Safe when
   * several processes share one database (the API, a content build, tests):
   * the learner password is derived from the admin password and the dataset,
   * so every process computes the same one, and the learner account is
   * unlocked only once the dataset is complete, which marks it ready.
   */
  private async createDataset(key: string, request: SqlRunRequest): Promise<Dataset> {
    const owner = `${OWNER_PREFIX}${key}`;
    const learner = `${LEARNER_PREFIX}${key}`;
    const password = `P${createHmac('sha256', this.options.connection.adminPassword)
      .update(key)
      .digest('base64url')
      .slice(0, 28)}`;
    const dataset = { owner, learner, password };

    const admin = await this.admin();
    try {
      // One build at a time per dataset, across every process using this database.
      // A DBMS_LOCK lock belongs to the session, so the DDL's implicit commits keep it.
      const handle = await lockDataset(admin, owner);
      try {
        if ((await accountStatus(admin, learner)) !== 'OPEN')
          await this.build(admin, dataset, request);
      } finally {
        await admin.execute('BEGIN :r := DBMS_LOCK.RELEASE(:h); END;', {
          h: handle,
          r: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        });
      }
      return dataset;
    } finally {
      await admin.close();
    }
  }

  private async build(
    admin: oracledb.Connection,
    { owner, learner, password }: Dataset,
    request: SqlRunRequest,
  ): Promise<void> {
    // Leftovers of an interrupted build are removed first.
    for (const user of [learner, owner])
      await ignore(admin.execute(`DROP USER ${user} CASCADE`), [1918]);
    await admin.execute(`CREATE USER ${owner} NO AUTHENTICATION QUOTA 20M ON USERS`);
    await admin.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${owner}`);
    for (const sql of SESSION_SETTINGS) await admin.execute(sql);
    for (const sql of splitStatements(request.database.schemaSql)) await admin.execute(sql);
    for (const sql of splitStatements(request.database.dataSql)) await admin.execute(sql);
    await admin.commit();

    await admin.execute(
      `CREATE USER ${learner} IDENTIFIED BY "${password}" PROFILE ${PROFILE} ` +
        `TEMPORARY TABLESPACE ${TEMP_TABLESPACE} DEFAULT TABLESPACE USERS QUOTA 0 ON USERS ACCOUNT LOCK`,
    );
    await admin.execute(`GRANT CREATE SESSION TO ${learner}`);
    const tables = await admin.execute<[string]>(
      'SELECT table_name FROM all_tables WHERE owner = :owner',
      { owner },
    );
    for (const [table] of tables.rows ?? []) {
      // READ, not SELECT: queries only, without even SELECT ... FOR UPDATE row locks.
      await admin.execute(`GRANT READ ON ${owner}."${table}" TO ${learner}`);
    }
    // Ready: only now can the learner user log in.
    await admin.execute(`ALTER USER ${learner} ACCOUNT UNLOCK`);
  }

  /**
   * Logs in as the dataset's learner. A user left by an older engine version
   * (with a different password) is reset to this dataset's password once.
   */
  private async learnerConnection(dataset: Dataset): Promise<oracledb.Connection> {
    const connect = () =>
      oracledb.getConnection({
        user: dataset.learner,
        password: dataset.password,
        connectString: this.options.connection.connectString,
      });
    try {
      return await connect();
    } catch (err) {
      if (errorNum(err) !== 1017) throw err;
      const admin = await this.admin();
      try {
        await admin.execute(`ALTER USER ${dataset.learner} IDENTIFIED BY "${dataset.password}"`);
      } finally {
        await admin.close();
      }
      return connect();
    }
  }

  private admin(): Promise<oracledb.Connection> {
    return oracledb.getConnection({
      user: 'system',
      password: this.options.connection.adminPassword,
      connectString: this.options.connection.connectString,
    });
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
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

/** Oracle-specific friendly checks (not a security control; see the file comment). */
function oracleProblem(sql: string): string | undefined {
  const body = stripComments(sql).trim();
  if (/^with\s+(function|procedure)\b/i.test(body)) {
    return 'PL/SQL in the WITH clause is not available here. Write a plain query.';
  }
  return undefined;
}

/** Oracle rejects a trailing semicolon in a single statement. */
function queryBody(sql: string): string {
  return sql.trim().replace(/;\s*$/, '');
}

/**
 * Fetches by column type, so values don't depend on this machine's time zone
 * or on float rounding: numbers and dates as text, converted per type.
 */
function fetchAsDisplayValue(
  meta: oracledb.Metadata<unknown>,
): oracledb.FetchTypeResponse | undefined {
  const t = meta.dbType;
  if (
    t === oracledb.DB_TYPE_NUMBER ||
    t === oracledb.DB_TYPE_BINARY_DOUBLE ||
    t === oracledb.DB_TYPE_BINARY_FLOAT
  ) {
    return { type: oracledb.STRING, converter: (v: unknown) => numberValue(v) };
  }
  if (t === oracledb.DB_TYPE_DATE) {
    // The driver reads DATE (no time zone) as local time; format those same components.
    return { converter: (v: unknown) => dateValue(v) };
  }
  if (
    t === oracledb.DB_TYPE_TIMESTAMP ||
    t === oracledb.DB_TYPE_TIMESTAMP_TZ ||
    t === oracledb.DB_TYPE_TIMESTAMP_LTZ ||
    t === oracledb.DB_TYPE_CLOB ||
    t === oracledb.DB_TYPE_NCLOB
  ) {
    return { type: oracledb.STRING };
  }
  return undefined;
}

/** Oracle NUMBER text → a JSON number when exact, else the exact text. Exported for tests. */
export function numberValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  // Oracle writes 0.5 as ".5".
  const text = String(value)
    .trim()
    .replace(/^(-?)\./, '$10.');
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    // Only when the number round-trips exactly; otherwise keep the exact text.
    return String(n) === text ? n : text;
  }
  return text;
}

/** Oracle DATE (read as local time) → `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM:SS` when it has a time. Exported for tests. */
export function dateValue(value: unknown): SqlValue {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    return value === null ? null : String(value);
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  const time = `${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}`;
  return time === '00:00:00' ? day : `${day} ${time}`;
}

/** Converts other fetched values into the engine-neutral SqlValue. Exported for tests. */
export function normalizeOracleValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function oracleMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0] ?? message;
}

function errorNum(err: unknown): number | undefined {
  const n = (err as { errorNum?: unknown }).errorNum;
  return typeof n === 'number' ? n : undefined;
}

/** Maps an Oracle error to a result. Exported for tests. */
export function classifyError(err: unknown, timeoutMs: number): SqlRunResult {
  const message = oracleMessage(err);
  const code = (err as { code?: unknown }).code;
  if (
    /call timeout/i.test(message) ||
    code === 'NJS-123' ||
    code === 'DPI-1067' ||
    errorNum(err) === 1013
  ) {
    return { kind: 'timeout', timeoutMs };
  }
  // CPU or reads per call (profile), temp space, or the instance's memory limit.
  if ([2393, 2395, 1652, 4036, 4030].includes(errorNum(err) ?? 0)) {
    return {
      kind: 'resource-limit',
      message: 'The query used too many resources and was stopped.',
    };
  }
  if (/^ORA-\d+/.test(message)) return { kind: 'error', message };
  return {
    kind: 'error',
    message: 'The SQL engine is not available. Is the Oracle container running?',
  };
}

/** Takes the exclusive build lock of a dataset (waits up to 60 s). Returns its handle. */
async function lockDataset(admin: oracledb.Connection, owner: string): Promise<string> {
  const res = await admin.execute<{ h: string; r: number }>(
    `DECLARE h VARCHAR2(128);
     BEGIN
       DBMS_LOCK.ALLOCATE_UNIQUE(:name, h);
       :r := DBMS_LOCK.REQUEST(h, DBMS_LOCK.X_MODE, 60, FALSE);
       :h := h;
     END;`,
    {
      name: `PRACSTACK_BUILD_${owner}`,
      r: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      h: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 128 },
    },
  );
  const out = res.outBinds as { h: string; r: number };
  // 0: granted; 4: this session already holds it.
  if (out.r !== 0 && out.r !== 4)
    throw new Error(`Could not lock the dataset (DBMS_LOCK ${out.r}).`);
  return out.h;
}

async function accountStatus(
  admin: oracledb.Connection,
  user: string,
): Promise<string | undefined> {
  const res = await admin.execute<[string]>(
    'SELECT account_status FROM dba_users WHERE username = :name',
    { name: user },
  );
  return res.rows?.[0]?.[0];
}

async function ignore<T>(promise: Promise<T>, errorNums: number[]): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    if (errorNums.includes(errorNum(err) ?? -1)) return undefined;
    throw err;
  }
}
