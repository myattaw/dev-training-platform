import { expect, type Page, test } from '@playwright/test';

/*
 * Enterprise Scenarios against the real local API and the generated content,
 * as the local developer. Answers are graded by the API; these tests check the
 * flow and that progress is recorded, without depending on answer keys.
 */

const scenarioRows = (page: Page) =>
  page.locator('table[aria-labelledby="scenarios-heading"] tbody tr');

test.describe('Enterprise Scenarios', () => {
  test('the catalog lists scenarios with how each is graded', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Enterprise Scenarios' })
      .click();
    await expect(page).toHaveURL('/scenarios');
    await expect(page).toHaveTitle('Enterprise Scenarios · PracStack');
    await expect(scenarioRows(page)).toHaveCount(7);
    const api = scenarioRows(page).filter({ hasText: 'Employee Management API' });
    await expect(api).toContainText('Code + assessment');
    const sql = scenarioRows(page).filter({ hasText: 'SQL Server Performance Investigation' });
    await expect(sql).toContainText('Structured assessment');
  });

  test('a structured scenario shows its brief and artifacts, and grades an answer', async ({
    page,
  }) => {
    await page.goto('/scenarios');
    await page.getByRole('link', { name: 'SQL Server Performance Investigation' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'SQL Server Performance Investigation' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Business context' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acceptance criteria' })).toBeVisible();
    await expect(page.getByText('How this scenario is graded')).toBeVisible();
    await expect(page.getByText(/Nothing is executed/)).toBeVisible();

    // Answer the first single-choice task (whatever its key) and get graded feedback.
    const task = page
      .locator('li.task')
      .filter({ has: page.getByRole('radio') })
      .first();
    await task.getByRole('radio').first().check();
    await task.getByRole('button', { name: 'Check answer' }).click();
    await expect(task.locator('.verdict')).toHaveText(/Correct|Not quite|Partly right/);
    await expect(task.locator('app-badge').first()).toHaveText(/Done|Attempted/);
    await expect(page.getByRole('status').filter({ hasText: 'tasks done' })).toBeVisible();

    // Progress is stored on the server: it is still there after a reload.
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: 'tasks done' })).toBeVisible();
  });

  test('a code task opens the challenge workspace in its language', async ({ page }) => {
    await page.goto('/scenarios/employee-management-api');
    await expect(page.getByText(/compiled and run against hidden tests/)).toBeVisible();
    await page.getByRole('link', { name: 'Open the C# workspace' }).click();
    await expect(page).toHaveURL('/challenges/employee-api/workspace');
    await expect(page.getByRole('combobox', { name: /language/i })).toHaveValue(/csharp/);
  });
});
