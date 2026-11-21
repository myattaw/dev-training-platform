import { OracleSqlEngine, oracleForTests, type OracleContainer } from '@pracstack/sql-engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { oracleTrack } from '../skill-mastery/oracle/track';
import { checkSqlQuestions } from './sql-questions';

/*
 * Runs every Oracle reference query on the sample and every hidden dataset
 * in a real Oracle Database Free (Docker), with the same checks as the
 * PostgreSQL track. The content build only does this when a local Oracle is
 * running, so this test is what guarantees it.
 * Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

describe.skipIf(skip)('Oracle SQL track', () => {
  let oracle: OracleContainer;
  beforeAll(async () => {
    oracle = await oracleForTests();
  }, 300_000);

  it('every reference query works on all datasets, and hidden data tells answers apart', async () => {
    const engine = new OracleSqlEngine({ connection: oracle });
    const issues = await checkSqlQuestions([oracleTrack], { oracle: engine });
    expect(issues).toEqual([]);
  }, 240_000);
});
