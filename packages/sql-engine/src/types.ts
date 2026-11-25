/** A value in a query result, normalized to JSON-safe primitives. */
export type SqlValue = string | number | boolean | null;

export interface SqlColumn {
  readonly name: string;
  /** PostgreSQL type name, e.g. `int4`, `numeric`, `text`. */
  readonly type: string;
}

/** A database to run against: DDL plus data, executed as the setup superuser. */
export interface SqlDatabaseSpec {
  readonly schemaSql: string;
  readonly dataSql: string;
}

export interface SqlRunRequest {
  readonly database: SqlDatabaseSpec;
  /** Learner (or reference) SQL. Runs as a restricted, read-only role. */
  readonly query: string;
  /** Rows to return; one more is fetched to detect truncation. */
  readonly maxRows: number;
}

export type SqlRunResult =
  | {
      readonly kind: 'rows';
      readonly columns: readonly SqlColumn[];
      readonly rows: readonly (readonly SqlValue[])[];
      /** True when the query returned more than `maxRows` rows. */
      readonly truncated: boolean;
      readonly durationMs: number;
    }
  /** PostgreSQL rejected or failed the query. The message is safe to show for sample data. */
  | { readonly kind: 'error'; readonly message: string }
  /** Rejected before execution (empty, too long, not a query). */
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  | { readonly kind: 'resource-limit'; readonly message: string };

/** One query against several databases (the sample data and the hidden datasets). */
export interface SqlBatchRequest {
  readonly databases: readonly SqlDatabaseSpec[];
  readonly query: string;
  readonly maxRows: number;
}

/** Most databases in one batch (a question has the sample plus a few hidden datasets). */
export const MAX_BATCH_DATABASES = 10;

export interface SqlEngine {
  run(request: SqlRunRequest): Promise<SqlRunResult>;
  /**
   * Runs the query on each database in order, each in a fresh database, and
   * stops after the first result that is not rows (so the result can be
   * shorter than `databases`). Optional: engines without it are called once
   * per database (see `runEach`). Remote engines implement it to make one
   * round trip instead of one per database.
   */
  runEach?(request: SqlBatchRequest): Promise<SqlRunResult[]>;
  /** Stops background processes. */
  close(): Promise<void>;
}

export interface SqlLimits {
  /** Hard wall-clock limit per query, including database setup. */
  readonly timeoutMs: number;
  /** Process memory (RSS) above which the running query is killed. */
  readonly maxRssMb: number;
  /**
   * Memory the learner's query may ADD to the process (resident memory at the
   * end of setup is the baseline). This is what a "too much memory" verdict is
   * based on, so leftovers of our own setup never count against the learner.
   */
  readonly maxQueryMemoryMb: number;
  /** Longest accepted query text. */
  readonly maxQueryLength: number;
}

export const DEFAULT_SQL_LIMITS: SqlLimits = {
  timeoutMs: 3000,
  maxRssMb: 2000,
  maxQueryMemoryMb: 512,
  maxQueryLength: 5000,
};
