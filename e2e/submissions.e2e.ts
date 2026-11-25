import { expect, type Page, test } from '@playwright/test';
import { PANGRAM_SOLUTION, replaceCode, waitForEditor } from './support/workspace';

/*
 * Server-side grading through the real stack: browser → local API → Docker
 * runner containers. Needs Docker and the runner images (npm run runners:build).
 * These share one local API user, so they run in order on different challenges.
 */
test.describe.configure({ mode: 'serial' });
test.skip(process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1', 'Docker tests skipped');

const submit = async (page: Page) => {
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  // Grading takes a few seconds: container start, compile, visible + hidden tests.
  await expect(page.locator('app-submission-panel .verdict-title')).toBeVisible({
    timeout: 30_000,
  });
};

test.describe('server-graded submissions', () => {
  test('a correct TypeScript solution is accepted and the challenge becomes solved', async ({
    page,
  }) => {
    await page.goto('/challenges/pangram/workspace');
    await waitForEditor(page);
    await replaceCode(page, PANGRAM_SOLUTION);
    await submit(page);

    const panel = page.locator('app-submission-panel');
    await expect(panel.locator('.verdict-title')).toContainText('Accepted');
    await expect(panel).toContainText('Challenge solved');
    await expect(panel.locator('.counts')).toContainText('10 / 10');
    await expect(panel.locator('.counts')).toContainText('4 / 4');
    await expect(panel.locator('table.history tbody tr')).toHaveCount(1);

    await page.goto('/challenges');
    await expect(page.locator('tbody tr', { hasText: 'Pangram' })).toContainText('Solved');
  });

  test('Java: run visible tests on the server, then submit', async ({ page }) => {
    await page.goto('/challenges/reverse-string/workspace');
    await waitForEditor(page);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('java');
    await expect(page.locator('.file-name')).toHaveText('Solution.java');
    await expect(page.getByText('Runs on the server')).toBeVisible();
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('class Solution');

    // The starter code throws: Run tests reports it, from the Java runner.
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('0 of 6 visible tests passed')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('UnsupportedOperationException').first()).toBeVisible();

    await replaceCode(
      page,
      'class Solution {\n    static String reverse(String input) {\n        return new StringBuilder(input).reverse().toString();\n    }\n}\n',
    );
    await submit(page);
    await expect(page.locator('app-submission-panel .verdict-title')).toContainText('Accepted');
    await expect(page.locator('app-submission-panel .counts')).toContainText('Java');

    // The language choice and the Java draft are remembered.
    await page.reload();
    await waitForEditor(page);
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('java');
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('StringBuilder');
  });

  test('hidden tests catch a solution that only passes the visible tests, without revealing them', async ({
    page,
  }) => {
    await page.goto('/challenges/reverse-string/workspace');
    await waitForEditor(page);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('typescript');
    await waitForEditor(page);
    // Trimming passes every visible test but not the hidden "leading and trailing spaces" one.
    await replaceCode(
      page,
      "export function reverse(input: string): string {\n  return [...input.trim()].reverse().join('');\n}\n",
    );
    await submit(page);

    const panel = page.locator('app-submission-panel');
    await expect(panel.locator('.verdict-title')).toContainText('Not accepted');
    await expect(panel.locator('.counts')).toContainText('6 / 6');
    await expect(panel.locator('.counts')).toContainText('2 / 3');
    await expect(panel).toContainText('some hidden tests fail');
    await expect(panel).not.toContainText('leading and trailing spaces');
  });

  test('C# compile errors are underlined in the editor, until that line is edited', async ({
    page,
  }) => {
    await page.goto('/challenges/pangram/workspace');
    await waitForEditor(page);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('csharp');
    await expect(page.locator('.file-name')).toHaveText('Solution.cs');
    await replaceCode(
      page,
      'public static class Solution\n{\n    public static bool IsPangram(string sentence)\n    {\n        return 42;\n    }\n}\n',
    );
    const squiggle = page.locator('.monaco-editor .squiggly-error');
    // A type error: only the real compiler (on the server) finds it, so nothing is underlined yet.
    await page.waitForTimeout(1_000);
    await expect(squiggle).toHaveCount(0);

    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText(/Line 5, column \d+/)).toBeVisible({ timeout: 60_000 });
    await expect(squiggle).toHaveCount(1);

    // Editing the reported line removes its marker (the error may be fixed there).
    await page.locator('.monaco-editor .view-line', { hasText: 'return 42;' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ');
    await expect(squiggle).toHaveCount(0);
  });
});
