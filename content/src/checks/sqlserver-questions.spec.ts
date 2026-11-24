import {
  SqlServerSqlEngine,
  sqlServerForTests,
  type SqlServerContainer,
} from '@pracstack/sql-engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { sqlServerTrack } from '../skill-mastery/sqlserver/track';
import { checkSqlQuestions } from './sql-questions';

/*
 * Runs every T-SQL reference query on the sample and every hidden dataset in
 * a real SQL Server (the local Developer edition container), with the same
 * checks as the PostgreSQL track. The content build only does this when the
 * local SQL Server is running, so this test is what guarantees it.
 * Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

describe.skipIf(skip)('SQL Server (T-SQL) track', () => {
  let server: SqlServerContainer;
  beforeAll(async () => {
    server = await sqlServerForTests();
  }, 300_000);

  it('every reference query works on all datasets, and hidden data tells answers apart', async () => {
    const engine = new SqlServerSqlEngine({ connection: server });
    const issues = await checkSqlQuestions([sqlServerTrack], { sqlserver: engine });
    expect(issues).toEqual([]);
  }, 240_000);
});
