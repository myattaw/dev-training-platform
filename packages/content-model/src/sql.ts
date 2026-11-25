/**
 * Practice databases for SQL questions.
 *
 * Authors write the schema as SQL DDL and the data as structured tables. The
 * data is turned into INSERT statements here (with proper quoting), so it can
 * also be shown to learners as tables and checked structurally.
 */
export type SqlLiteral = string | number | boolean | null;

export interface SqlTable {
  readonly table: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SqlLiteral[])[];
}

export interface SqlDatabase {
  /** Stable id, for reference in error messages. */
  readonly id: string;
  /** CREATE TABLE statements. Public: learners see it. */
  readonly schema: string;
  /** Sample data. Public: shown to learners and used by "Run query". */
  readonly sample: readonly SqlTable[];
  /**
   * Hidden datasets. Private: a submission must also produce the reference
   * query's result on each, so hard-coding values from the sample fails.
   */
  readonly hidden: readonly (readonly SqlTable[])[];
}

/**
 * A query result as the SQL engine reports it (same shape as the engine's
 * result sets): column names and engine type names, rows of JSON-safe values.
 */
export interface SqlResultSet {
  readonly columns: readonly { readonly name: string; readonly type: string }[];
  readonly rows: readonly (readonly SqlLiteral[])[];
}

export const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** INSERT statements for a dataset. Identifiers must match {@link SQL_IDENTIFIER}. */
export function tablesToSql(tables: readonly SqlTable[]): string {
  return tables
    .filter((t) => t.rows.length > 0)
    .map((t) => {
      for (const name of [t.table, ...t.columns]) {
        if (!SQL_IDENTIFIER.test(name)) throw new Error(`Invalid SQL identifier "${name}"`);
      }
      const values = t.rows.map((row) => `(${row.map(sqlLiteral).join(', ')})`).join(',\n  ');
      return `INSERT INTO ${t.table} (${t.columns.join(', ')}) VALUES\n  ${values};`;
    })
    .join('\n');
}

export function sqlLiteral(value: SqlLiteral): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid SQL number ${value}`);
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}
