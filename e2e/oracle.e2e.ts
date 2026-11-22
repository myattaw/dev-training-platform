import { expect, test } from '@playwright/test';
import { replaceCode, waitForEditor } from './support/workspace';

/*
 * The Oracle SQL track against a real Oracle Database Free. The local API
 * uses the local Oracle container (npm run oracle:start; `npm run verify`
 * starts it). Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
test.skip(process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1', 'Docker tests skipped');

test.describe('Oracle SQL track', () => {
  test('the track is listed with its skills', async ({ page }) => {
    await page.goto('/skills');
    await expect(page.getByRole('link', { name: 'View Oracle SQL skills' })).toBeVisible();
    await page.goto('/skills/oracle-sql');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Oracle SQL');
    await expect(page.locator('tbody tr')).toHaveCount(5);
  });

  test('practise: DUAL, then write a row-limiting query and run it on Oracle', async ({ page }) => {
    await page.goto('/skills/oracle-sql/ora-row-limiting/practice');
    // Beginner: two questions that need no database (selection is deterministic).
    await page
      .getByRole('radio', {
        name: 'Oracle requires a FROM clause, and DUAL is a one-row table for exactly this',
      })
      .check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
    await page.getByRole('button', { name: 'Next question' }).click();
    await page.getByLabel('Output').fill('1');
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();

    // Two first-time correct answers: up to Elementary, where SQL is written, run and submitted.
    await expect(page.locator('.score-change')).toContainText('Up to Elementary');
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByText('first four employee')).toBeVisible();
    await expect(page.locator('.dialect')).toHaveText('Oracle');
    await waitForEditor(page);

    // An Oracle error message comes back from the real database.
    await replaceCode(page, 'SELECT nme FROM employees');
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.result')).toContainText('ORA-00904');

    await replaceCode(page, 'SELECT name FROM employees ORDER BY name FETCH FIRST 4 ROWS ONLY');
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.result')).toContainText('4 rows');
    await expect(page.locator('.result')).toContainText('Ada Lovelace');

    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
  });
});
