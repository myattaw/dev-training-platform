/**
 * Friendly pre-checks on query text, so learners get a clear message instead
 * of a confusing PostgreSQL error.
 *
 * This is NOT a security control. Safety comes from the database: the query
 * runs inside `DECLARE CURSOR` (one SELECT/WITH/VALUES/TABLE statement only),
 * in a READ ONLY transaction, as a role that can only read the exercise
 * tables. Anything this check misses is still refused by PostgreSQL.
 */
const QUERY_KEYWORDS = new Set(['select', 'with', 'values', 'table']);

/** Removes `--` line comments and `/* *\/` block comments (not inside strings). */
export function stripComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"') {
      const end = sql.indexOf(ch, i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop;
    } else if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
    } else if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Returns a message explaining why the query cannot run, or `undefined` if it may. */
export function precheckQuery(sql: string, maxLength: number): string | undefined {
  if (sql.length > maxLength) return `Queries can be at most ${maxLength} characters long.`;
  const body = stripComments(sql).trim().replace(/;\s*$/, '').trim();
  if (body === '') return 'Write a query first.';
  const first = /^\(*\s*([a-z]+)/i.exec(body)?.[1]?.toLowerCase();
  if (!first || !QUERY_KEYWORDS.has(first)) {
    return 'Only queries that read data (SELECT, WITH, VALUES) can run here.';
  }
  return undefined;
}

/** The query text to embed in `DECLARE … CURSOR FOR`, without a trailing semicolon. */
export function cursorBody(sql: string): string {
  return sql.trim().replace(/;\s*$/, '');
}

/**
 * Splits a script into statements at semicolons that are outside quotes and
 * comments. For our own authored setup scripts (schema and data), not for
 * learner SQL, which is always a single query.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i] ?? '';
    const next = sql[i + 1];
    if (ch === "'" || ch === '"') {
      // Quoted text; a doubled quote is an escaped quote.
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
    } else if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i++;
    } else {
      current += ch;
      i++;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}
