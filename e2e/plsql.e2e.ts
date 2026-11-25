import { expect, test } from '@playwright/test';

/*
 * The Oracle PL/SQL track: knowledge questions (every code sample was run on
 * Oracle by the content checks), so it needs no database while practicing and
 * works the same on AWS.
 */
test.describe('Oracle PL/SQL track', () => {
  test('is in the catalog with its topics and skills', async ({ page }) => {
    await page.goto('/skills/oracle-plsql');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Oracle PL/SQL');
    for (const skill of [
      'Blocks and variables',
      'Procedures and functions',
      'Packages',
      'Triggers',
    ])
      await expect(page.getByRole('link', { name: skill }).first()).toBeVisible();
  });

  test('practice: a Beginner PL/SQL question is shown with its code and graded', async ({
    page,
  }) => {
    await page.goto('/skills/oracle-plsql/plsql-blocks/practice');
    await expect(page.locator('.question-meta')).toHaveText('Beginner');
    // The two Beginner questions: predict the output, or fill in PUT_LINE.
    const output = page.getByLabel('Output', { exact: true });
    const blank = page.getByRole('textbox', { name: 'Blank 1 of 1' });
    await expect(output.or(blank)).toBeVisible();
    await expect(page.getByText('DBMS_OUTPUT').first()).toBeVisible();
    if (await output.isVisible()) await output.fill('Count: 6');
    else await blank.fill('put_line'); // keywords are not case-sensitive
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
  });
});
