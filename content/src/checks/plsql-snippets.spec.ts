import { type OracleContainer, oracleForTests, runOracleScript } from '@pracstack/sql-engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLSQL_SETUP } from '../skill-mastery/plsql/builders';
import { plsqlTrack } from '../skill-mastery/plsql/track';
import { checkPlsqlSnippets, collectPlsqlSnippets } from './plsql-snippets';

/*
 * Runs every PL/SQL code sample in a real Oracle Database Free (Docker): the
 * printed output must match the answer key, blanks must compile with every
 * accepted answer, and "what happens" samples must fail exactly as the key says.
 * Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

describe.skipIf(skip)('Oracle PL/SQL track', () => {
  let oracle: OracleContainer;
  beforeAll(async () => {
    oracle = await oracleForTests();
  }, 300_000);

  it('the checker notices wrong answer keys', async () => {
    const run = (script: string) => runOracleScript(oracle, script, { setup: PLSQL_SETUP });
    const issues = await checkPlsqlSnippets(
      [
        {
          path: 'wrong-output',
          source: "BEGIN DBMS_OUTPUT.PUT_LINE('a'); END;\n/",
          expectedOutput: 'b',
        },
        { path: 'should-fail', source: 'BEGIN NULL; END;\n/', expectedError: 'ORA-01403' },
        { path: 'should-run', source: 'BEGIN x := 1; END;\n/' },
      ],
      run,
    );
    expect(issues.map((i) => i.path)).toEqual(['wrong-output', 'should-fail', 'should-run']);
  }, 120_000);

  it('every code sample runs on Oracle and matches its answer key', async () => {
    const snippets = collectPlsqlSnippets(plsqlTrack);
    expect(snippets.length).toBeGreaterThan(40);
    const run = (script: string) => runOracleScript(oracle, script, { setup: PLSQL_SETUP });
    expect(await checkPlsqlSnippets(snippets, run)).toEqual([]);
  }, 600_000);
});
