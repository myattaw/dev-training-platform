import {
  MAX_BATCH_DATABASES,
  type SqlBatchRequest,
  type SqlColumn,
  type SqlDatabaseSpec,
  type SqlEngine,
  type SqlRunRequest,
  type SqlRunResult,
  type SqlValue,
} from './types';

/** Result of invoking a remote function (same shape as @pracstack/code-runner's). */
export type SqlInvokeOutcome =
  | { readonly kind: 'returned'; readonly payload: unknown }
  | { readonly kind: 'function-error'; readonly error: string }
  | { readonly kind: 'refused'; readonly message: string };

export type SqlInvoke = (functionName: string, payload: unknown) => Promise<SqlInvokeOutcome>;

const MAX_ROWS_RETURNED = 10_000;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 10_000): v is string => typeof v === 'string' && v.length <= max;
const isValue = (v: unknown): v is SqlValue =>
  v === null ||
  typeof v === 'boolean' ||
  (typeof v === 'number' && Number.isFinite(v)) ||
  isText(v, 100_000);
const isColumn = (v: unknown): v is SqlColumn =>
  isObj(v) && isText(v['name'], 200) && isText(v['type'], 100);

/**
 * Checks a result returned by the SQL runner. The runner executed learner SQL,
 * so its answer is untrusted; grading compares it with results computed for
 * the reference query, which never runs on behalf of the learner's request.
 */
export function parseSqlRunResult(value: unknown, maxRows: number): SqlRunResult | undefined {
  if (!isObj(value)) return undefined;
  switch (value['kind']) {
    case 'rows': {
      const { columns, rows, truncated, durationMs } = value;
      if (!Array.isArray(columns) || columns.length > 1000 || !columns.every(isColumn))
        return undefined;
      if (!Array.isArray(rows) || rows.length > Math.min(maxRows, MAX_ROWS_RETURNED))
        return undefined;
      const valid = rows.every(
        (r) => Array.isArray(r) && r.length === columns.length && r.every(isValue),
      );
      if (!valid || typeof truncated !== 'boolean' || !Number.isFinite(durationMs))
        return undefined;
      return {
        kind: 'rows',
        columns,
        rows: rows as SqlValue[][],
        truncated,
        durationMs: Number(durationMs),
      };
    }
    case 'error':
    case 'rejected':
    case 'resource-limit':
      return isText(value['message'], 2000)
        ? { kind: value['kind'], message: value['message'] }
        : undefined;
    case 'timeout':
      return Number.isSafeInteger(value['timeoutMs'])
        ? { kind: 'timeout', timeoutMs: Number(value['timeoutMs']) }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Runs SQL by invoking the isolated SQL runner function (on AWS: a
 * container-image Lambda in a VPC without network access).
 */
export class InvokedSqlEngine implements SqlEngine {
  constructor(
    private readonly invoke: SqlInvoke,
    private readonly functionName: string,
  ) {}

  async run(request: SqlRunRequest): Promise<SqlRunResult> {
    const outcome = await this.invoke(this.functionName, request);
    if (outcome.kind !== 'returned') return failure(outcome);
    return parseSqlRunResult(outcome.payload, request.maxRows + 1) ?? UNREADABLE;
  }

  /** All datasets in one invocation: one round trip, and one warm runner does them all. */
  async runEach(request: SqlBatchRequest): Promise<SqlRunResult[]> {
    const outcome = await this.invoke(this.functionName, { batch: request });
    if (outcome.kind !== 'returned') return [failure(outcome)];
    const payload = outcome.payload;
    const results = isObj(payload) ? payload['results'] : undefined;
    if (
      !Array.isArray(results) ||
      results.length === 0 ||
      results.length > request.databases.length
    )
      return [UNREADABLE];
    const parsed: SqlRunResult[] = [];
    for (const [i, value] of results.entries()) {
      const result = parseSqlRunResult(value, request.maxRows + 1) ?? UNREADABLE;
      parsed.push(result);
      // Same contract as locally: nothing after the first result that is not rows.
      if (result.kind !== 'rows' || i === request.databases.length - 1) break;
    }
    return parsed;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

const UNREADABLE: SqlRunResult = {
  kind: 'error',
  message: 'The SQL engine produced an unreadable result.',
};

function failure(outcome: Exclude<SqlInvokeOutcome, { kind: 'returned' }>): SqlRunResult {
  if (outcome.kind === 'refused')
    return { kind: 'rejected', message: 'The SQL service is busy. Try again in a moment.' };
  return /timed out/i.test(outcome.error)
    ? { kind: 'timeout', timeoutMs: 0 }
    : { kind: 'error', message: 'The SQL engine stopped unexpectedly. Try again.' };
}

function parseDatabase(value: unknown): SqlDatabaseSpec | undefined {
  if (!isObj(value)) return undefined;
  const { schemaSql, dataSql } = value;
  return isText(schemaSql, 200_000) && isText(dataSql, 2_000_000)
    ? { schemaSql, dataSql }
    : undefined;
}

const isMaxRows = (v: unknown): boolean =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= MAX_ROWS_RETURNED;

/** Validates a request arriving at the SQL runner function. */
export function parseSqlRunRequest(value: unknown): SqlRunRequest | undefined {
  if (!isObj(value)) return undefined;
  const database = parseDatabase(value['database']);
  const { query, maxRows } = value;
  if (!database || !isText(query, 20_000) || !isMaxRows(maxRows)) return undefined;
  return { database, query, maxRows: Number(maxRows) };
}

/** Validates a batch request (`{ batch: … }`) arriving at the SQL runner function. */
export function parseSqlBatchRequest(value: unknown): SqlBatchRequest | undefined {
  if (!isObj(value) || !isObj(value['batch'])) return undefined;
  const { databases, query, maxRows } = value['batch'];
  if (
    !Array.isArray(databases) ||
    databases.length === 0 ||
    databases.length > MAX_BATCH_DATABASES ||
    !isText(query, 20_000) ||
    !isMaxRows(maxRows)
  )
    return undefined;
  const parsed = databases.map(parseDatabase);
  if (!parsed.every((d): d is SqlDatabaseSpec => d !== undefined)) return undefined;
  return { databases: parsed, query, maxRows: Number(maxRows) };
}
