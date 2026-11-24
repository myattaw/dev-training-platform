import { expect, test } from '@playwright/test';
import { replaceCode, waitForEditor } from './support/workspace';

/*
 * Runnable T-SQL against a real SQL Server (the local Developer edition
 * container; npm run sqlserver:start, which `npm run verify` runs). Question
 * selection is deterministic for a fresh learner, so the path below is fixed.
 * Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
test.skip(process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1', 'Docker tests skipped');

test('SQL Server practice: answer the warm-up, then write T-SQL that runs on SQL Server', async ({
  page,
}) => {
  await page.goto('/skills/sql-server/mssql-querying/practice');

  // Warm-up questions that need no database.
  await page
    .getByRole('radio', { name: 'Some five orders, with no guarantee which five or in what order' })
    .check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
  await page.getByRole('button', { name: 'Next question' }).click();

  await page.getByLabel('Blank 1 of 2').fill('0');
  await page.getByLabel('Blank 2 of 2').fill('50');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
  await page.getByRole('button', { name: 'Next question' }).click();

  await page.getByRole('radio', { name: '2 rows (orders 2 and 4)' }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
  await page.getByRole('button', { name: 'Next question' }).click();

  // A runnable T-SQL question.
  await expect(page.getByText('three most expensive orders')).toBeVisible();
  await expect(page.locator('.dialect')).toHaveText('SQL Server');
  await waitForEditor(page);

  // A SQL Server error message comes back from the real server.
  await replaceCode(page, 'SELECT ordr_id FROM orders');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result')).toContainText("Invalid column name 'ordr_id'", {
    timeout: 20_000,
  });

  await replaceCode(
    page,
    "SELECT TOP (3) order_id, total FROM dbo.orders WHERE status <> 'Cancelled' ORDER BY total DESC",
  );
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result')).toContainText('3 rows', { timeout: 20_000 });
  await expect(page.locator('.result')).toContainText('260');

  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible({ timeout: 20_000 });
});
