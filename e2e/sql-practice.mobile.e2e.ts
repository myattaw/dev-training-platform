import { expect, test } from '@playwright/test';
import { replaceCode, waitForEditor } from './support/workspace';

test.describe('SQL practice on a phone', () => {
  test('uses Question / Database / Editor / Output tabs, and shows results after a run', async ({
    page,
  }) => {
    await page.goto('/skills/postgresql/pg-group-by/practice');
    const sections = page.getByRole('tablist', { name: 'Workspace' });
    await expect(sections).toBeVisible();
    await expect(sections.getByRole('tab', { name: 'Question' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.question-meta')).toBeVisible();

    await sections.getByRole('tab', { name: 'Database' }).click();
    await expect(page.locator('app-database-explorer')).toContainText('departments');

    await sections.getByRole('tab', { name: 'Editor' }).click();
    await waitForEditor(page);
    await replaceCode(page, 'SELECT count(*) AS n FROM employees');
    await page.getByRole('button', { name: 'Run query' }).click();
    // The first query is a cold start of the SQL engine; with the rest of the suite in
    // parallel it can take longer than the default 5 s (as in skill-mastery.e2e.ts).
    await expect(sections.getByRole('tab', { name: 'Output' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 20_000 },
    );
    await expect(page.locator('.result')).toContainText('1 rows');
    // Nothing overflows the phone's width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
