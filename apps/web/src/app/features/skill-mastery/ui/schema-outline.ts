/**
 * Reads the CREATE TABLE statements of a practice database into an outline
 * for the database explorer: tables, columns, types, primary and foreign keys.
 *
 * Display only. The statements are our own authored content (PostgreSQL or
 * Oracle), so this handles the forms they use rather than all of SQL. Anything
 * it does not recognise is shown as part of the column's type.
 */
export interface SchemaColumn {
  readonly name: string;
  readonly type: string;
  readonly primaryKey: boolean;
  readonly notNull: boolean;
  /** `table.column` this column references, if any. */
  readonly references?: string;
}

export interface SchemaTable {
  readonly name: string;
  readonly columns: readonly SchemaColumn[];
}

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?([\w.]+)"?\s*\(/gi;
const CONSTRAINT_START =
  /\s+(not\s+null|null|primary\s+key|references|default|unique|check|constraint|generated)\b/i;

export function outlineSchema(ddl: string): SchemaTable[] {
  const tables: SchemaTable[] = [];
  for (const match of ddl.matchAll(CREATE_TABLE)) {
    const name = match[1] ?? '';
    const body = balancedBody(ddl, (match.index ?? 0) + match[0].length);
    if (body === undefined) continue;

    const columns = new Map<
      string,
      { name: string; type: string; primaryKey: boolean; notNull: boolean; references?: string }
    >();
    const tableLevel: string[] = [];
    for (const item of splitTopLevel(body)) {
      if (/^(primary\s+key|foreign\s+key|constraint|unique|check)\b/i.test(item)) {
        tableLevel.push(item);
        continue;
      }
      const columnName = /^"?(\w+)"?/.exec(item)?.[1];
      if (!columnName) continue;
      const rest = item
        .slice(item.indexOf(columnName) + columnName.length)
        .replace(/^"/, '')
        .trim();
      const cut = CONSTRAINT_START.exec(` ${rest}`);
      const type = (cut ? ` ${rest}`.slice(0, cut.index) : rest).trim();
      const references = /references\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i.exec(rest);
      columns.set(columnName.toLowerCase(), {
        name: columnName,
        type,
        primaryKey: /primary\s+key/i.test(rest),
        notNull: /not\s+null/i.test(rest) || /primary\s+key/i.test(rest),
        ...(references ? { references: `${references[1]}.${references[2]}` } : {}),
      });
    }
    for (const constraint of tableLevel) {
      const pk = /primary\s+key\s*\(([^)]*)\)/i.exec(constraint);
      for (const col of pk?.[1]?.split(',') ?? []) {
        const c = columns.get(col.trim().replace(/"/g, '').toLowerCase());
        if (c) c.primaryKey = c.notNull = true;
      }
      const fk =
        /foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*references\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i.exec(
          constraint,
        );
      const c = fk ? columns.get((fk[1] ?? '').toLowerCase()) : undefined;
      if (c && fk) c.references = `${fk[2]}.${fk[3]}`;
    }
    tables.push({ name, columns: [...columns.values()] });
  }
  return tables;
}

/** The text between an opening parenthesis (already consumed) and its matching close. */
function balancedBody(text: string, start: number): string | undefined {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) return undefined;
      i = end;
    } else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return text.slice(start, i);
  }
  return undefined;
}

/** Splits on commas that are not inside parentheses or quotes. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let quoted = false;
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map((p) => p.replace(/\s+/g, ' ')).filter(Boolean);
}
