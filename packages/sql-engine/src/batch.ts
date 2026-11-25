import type { SqlBatchRequest, SqlEngine, SqlRunResult } from './types';

/**
 * Runs a query on each database in order and stops after the first result
 * that is not rows. Uses the engine's own batch support when it has it (one
 * round trip), otherwise one `run` per database.
 */
export function runEach(engine: SqlEngine, request: SqlBatchRequest): Promise<SqlRunResult[]> {
  return engine.runEach ? engine.runEach(request) : runEachSequentially(engine, request);
}

/** `runEach` built from `run`: for engines whose round trips are cheap. */
export async function runEachSequentially(
  engine: SqlEngine,
  request: SqlBatchRequest,
): Promise<SqlRunResult[]> {
  const results: SqlRunResult[] = [];
  for (const database of request.databases) {
    const result = await engine.run({ database, query: request.query, maxRows: request.maxRows });
    results.push(result);
    if (result.kind !== 'rows') break;
  }
  return results;
}
