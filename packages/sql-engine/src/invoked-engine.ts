import type { SqlColumn, SqlEngine, SqlRunRequest, SqlRunResult, SqlValue } from './types';

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
    switch (outcome.kind) {
      case 'refused':
        return { kind: 'rejected', message: 'The SQL service is busy. Try again in a moment.' };
      case 'function-error':
        return /timed out/i.test(outcome.error)
          ? { kind: 'timeout', timeoutMs: 0 }
          : { kind: 'error', message: 'The SQL engine stopped unexpectedly. Try again.' };
      case 'returned':
        return (
          parseSqlRunResult(outcome.payload, request.maxRows + 1) ?? {
            kind: 'error',
            message: 'The SQL engine produced an unreadable result.',
          }
        );
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

/** Validates a request arriving at the SQL runner function. */
export function parseSqlRunRequest(value: unknown): SqlRunRequest | undefined {
  if (!isObj(value) || !isObj(value['database'])) return undefined;
  const { schemaSql, dataSql } = value['database'];
  const { query, maxRows } = value;
  if (!isText(schemaSql, 200_000) || !isText(dataSql, 2_000_000) || !isText(query, 20_000))
    return undefined;
  if (!Number.isSafeInteger(maxRows) || Number(maxRows) < 0 || Number(maxRows) > MAX_ROWS_RETURNED)
    return undefined;
  return { database: { schemaSql, dataSql }, query, maxRows: Number(maxRows) };
}
