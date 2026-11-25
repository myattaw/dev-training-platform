/**
 * Runs an authored PL/SQL script on the local Oracle Database Free, for
 * content checks: the PL/SQL track's code samples must compile, and print
 * exactly what their answer keys say. Never used for learner code.
 *
 * Each run gets a brand-new Oracle user (schema), dropped afterwards, so
 * samples never see each other's tables, procedures or package state.
 *
 * Scripts are written SQL*Plus style: plain SQL statements end with `;`, and a
 * PL/SQL unit (an anonymous block, or CREATE PROCEDURE/FUNCTION/PACKAGE/
 * TRIGGER/TYPE) ends with a line containing only `/`.
 */
import { randomBytes } from 'node:crypto';
import oracledb from 'oracledb';
import { connectWithRetry, type OracleConnectionInfo } from './oracle-engine';
import { splitStatements } from './statement';

export interface OracleScriptResult {
  /** Everything printed with DBMS_OUTPUT, one line per PUT_LINE, joined with "\n". */
  readonly output: string;
  /**
   * The first failure, which stops the script: an Oracle error (`ORA-01403`),
   * or `compile` when a CREATE of a PL/SQL unit compiled with errors.
   */
  readonly error?: { readonly code: string; readonly message: string };
}

const PLSQL_UNIT =
  /^\s*(DECLARE|BEGIN|CREATE\s+(OR\s+REPLACE\s+)?(EDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE)\b)/i;

/** The statements of a script, in order: plain SQL without its `;`, PL/SQL units whole. */
export function splitScript(script: string): string[] {
  const units: string[] = [];
  for (const chunk of script.split(/^[ \t]*\/[ \t]*$/m)) {
    const lines = chunk.split('\n');
    const start = lines.findIndex((line) => PLSQL_UNIT.test(line));
    const plain = start === -1 ? chunk : lines.slice(0, start).join('\n');
    units.push(...splitStatements(plain));
    if (start !== -1) units.push(lines.slice(start).join('\n').trim());
  }
  return units.filter((u) => u.trim() !== '');
}

export async function runOracleScript(
  connection: OracleConnectionInfo,
  script: string,
  options: { readonly setup?: string } = {},
): Promise<OracleScriptResult> {
  const user = `PLSQL_CHECK_${randomBytes(6).toString('hex').toUpperCase()}`;
  const password = `P${randomBytes(12).toString('hex')}`;
  const admin = await connectWithRetry({
    user: 'system',
    password: connection.adminPassword,
    connectString: connection.connectString,
  });
  try {
    await admin.execute(`CREATE USER ${user} IDENTIFIED BY "${password}" QUOTA 20M ON USERS`);
    await admin.execute(
      `GRANT CREATE SESSION, CREATE TABLE, CREATE VIEW, CREATE SEQUENCE, CREATE PROCEDURE,
             CREATE TRIGGER, CREATE TYPE TO ${user}`,
    );
    const session = await connectWithRetry({
      user,
      password,
      connectString: connection.connectString,
    });
    try {
      await session.execute('BEGIN DBMS_OUTPUT.ENABLE(NULL); END;');
      const output: string[] = [];
      for (const [phase, text] of [
        ['setup', options.setup ?? ''],
        ['script', script],
      ] as const) {
        for (const unit of splitScript(text)) {
          const error = await execute(session, unit);
          output.push(...(await drainOutput(session)));
          if (error) {
            if (phase === 'setup') throw new Error(`setup failed: ${error.message}\n${unit}`);
            return { output: output.join('\n'), error };
          }
        }
      }
      return { output: output.join('\n') };
    } finally {
      await session.close().catch(() => undefined);
    }
  } finally {
    await admin.execute(`DROP USER ${user} CASCADE`).catch(() => undefined);
    await admin.close().catch(() => undefined);
  }
}

async function execute(
  session: oracledb.Connection,
  unit: string,
): Promise<OracleScriptResult['error']> {
  try {
    const result = await session.execute(unit, [], { autoCommit: false });
    // A PL/SQL unit created with compilation errors "succeeds" with a warning.
    if (result.warning) {
      const errors = await session.execute<[number, number, string]>(
        `SELECT line, position, text FROM user_errors ORDER BY sequence`,
      );
      const detail = (errors.rows ?? []).map(([l, p, t]) => `${l}:${p} ${t.trim()}`).join('; ');
      return { code: 'compile', message: detail || result.warning.message };
    }
    return undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: /ORA-\d{5}/.exec(message)?.[0] ?? 'error', message };
  }
}

async function drainOutput(session: oracledb.Connection): Promise<string[]> {
  const lines: string[] = [];
  for (;;) {
    const result = await session.execute<{ lines: (string | null)[]; count: number }>(
      'BEGIN DBMS_OUTPUT.GET_LINES(:lines, :count); END;',
      {
        lines: {
          type: oracledb.STRING,
          dir: oracledb.BIND_OUT,
          maxArraySize: 1000,
          maxSize: 32767,
        },
        count: { type: oracledb.NUMBER, dir: oracledb.BIND_INOUT, val: 1000 },
      },
    );
    // `count` is how many lines were returned; the array may hold more (empty) entries.
    const count = Number(result.outBinds?.count ?? 0);
    const got = (result.outBinds?.lines ?? []).slice(0, count);
    lines.push(...got.map((l) => l ?? ''));
    if (count < 1000) return lines;
  }
}
