import { expect, test } from '@playwright/test';
import { LRU_SOLUTION, PANGRAM_SOLUTION, replaceCode, waitForEditor } from './support/workspace';

test.describe('coding workspace', () => {
  test('solving a challenge passes all visible tests and updates local status', async ({
    page,
  }) => {
    await page.goto('/challenges/pangram/workspace');
    await expect(page).toHaveTitle('Pangram · Workspace · PracStack');
    await waitForEditor(page);

    // The starter code throws, so every test fails.
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('0 of 10 visible tests passed')).toBeVisible({ timeout: 20_000 });
    // A long result list scrolls inside its pane; the page itself never grows (it used
    // to, through the hidden screen-reader labels, leaving an empty page to scroll into).
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight),
    ).toBeLessThanOrEqual(0);

    await replaceCode(page, PANGRAM_SOLUTION);
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 10 visible tests passed')).toBeVisible({ timeout: 20_000 });

    await page.goto('/challenges');
    const row = page.locator('tbody tr', { hasText: 'Pangram' });
    await expect(row).toContainText('Visible tests passed');
  });

  test('Ctrl+Enter runs the tests and TypeScript errors are reported', async ({ page }) => {
    await page.goto('/challenges/reverse-string/workspace');
    await waitForEditor(page);
    await replaceCode(page, 'export function reverse(input: string): string {\n  return 42;\n}\n');
    // Monaco's TypeScript checker finds it as you type; the status above the editor counts it.
    await expect(page.locator('.error-status')).toHaveText('1 error, line 2', { timeout: 15_000 });
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(
      page.getByText('TypeScript errors. Fix them before running the tests.'),
    ).toBeVisible();
    await expect(page.getByText(/Line 2, column \d+/)).toBeVisible();
  });

  test('C# and Java syntax errors are shown while typing, before anything runs', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
    await page.goto('/challenges/pangram/workspace');
    await waitForEditor(page);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('csharp');
    await expect(page.locator('.file-name')).toHaveText('Solution.cs');

    const status = page.locator('.error-status');
    const squiggles = page.locator('.monaco-editor .squiggly-error');
    await replaceCode(
      page,
      'public static class Solution\n{\n    public static bool IsPangram(string sentence)\n    {\n        return e.;\n    }\n}\n',
    );
    // Two: the syntax error, and `e` is declared nowhere.
    await expect(status).toHaveText('2 errors, line 5', { timeout: 15_000 });
    await expect(squiggles.first()).toBeVisible();

    await replaceCode(
      page,
      'public static class Solution\n{\n    public static bool IsPangram(string sentence)\n    {\n        return sentence.Length > 0;\n    }\n}\n',
    );
    await expect(status).toBeEmpty();
    await expect(squiggles).toHaveCount(0);

    // A name declared nowhere in the file is flagged before running, too.
    await replaceCode(
      page,
      'public static class Solution\n{\n    public static bool IsPangram(string sentence)\n    {\n        var seen = 0;\n        return ew;\n    }\n}\n',
    );
    await expect(status).toHaveText('1 error, line 6', { timeout: 15_000 });

    // Suggestions: typing "HashSe" offers HashSet.
    await page.locator('.monaco-editor .view-line', { hasText: 'var seen = 0;' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('var set = new HashSe');
    await expect(
      page.locator('.monaco-editor .suggest-widget .monaco-list-row', { hasText: 'HashSet' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('combobox', { name: 'Language' }).selectOption('java');
    await expect(page.locator('.file-name')).toHaveText('Solution.java');
    await replaceCode(
      page,
      'class Solution {\n    static boolean isPangram(String s) {\n        return s.;\n    }\n}\n',
    );
    await expect(status).toHaveText('1 error, line 3', { timeout: 15_000 });

    // Checked in the browser: no code went to the API.
    expect(requests.filter((r) => r.startsWith('POST /api/'))).toEqual([]);
  });

  test('console output appears in the Console tab', async ({ page }) => {
    await page.goto('/challenges/reverse-string/workspace');
    await waitForEditor(page);
    await replaceCode(
      page,
      "export function reverse(input: string): string {\n  console.log('called with', input);\n  return [...input].reverse().join('');\n}\n",
    );
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 6 visible tests passed')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /Console/ }).click();
    await expect(page.locator('pre.console')).toContainText('called with robot');
  });

  test('drafts survive a reload and Reset asks before discarding them', async ({ page }) => {
    await page.goto('/challenges/pangram/workspace');
    await waitForEditor(page);
    await replaceCode(page, '// my draft\n');
    // The draft is written to localStorage as part of the edit itself, with no delay.
    const draftKey = 'pracstack:challenge:pangram:typescript:draft';
    expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toContain(
      '// my draft',
    );
    await page.reload();
    await waitForEditor(page);
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('// my draft');

    await page.getByRole('button', { name: 'Reset' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset your code?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('// my draft');

    await page.getByRole('button', { name: 'Reset' }).click();
    await dialog.getByRole('button', { name: 'Reset code' }).click();
    await expect(page.locator('.monaco-editor .view-lines')).toContainText(
      'export function isPangram',
    );
  });

  test('the problem pane lists the visible tests', async ({ page }) => {
    await page.goto('/challenges/merge-intervals/workspace');
    await page.getByRole('tab', { name: /Visible tests/ }).click();
    await expect(page.locator('#problem-panel-tests')).toContainText('touching intervals merge');
  });

  test('class-style challenges run step-by-step operation tests', async ({ page }) => {
    await page.goto('/challenges/lru-cache/workspace');
    await page.getByRole('tab', { name: /Visible tests/ }).click();
    await expect(page.locator('#problem-panel-tests')).toContainText('new LRUCache(2)');
    await expect(page.locator('#problem-panel-tests')).toContainText('get(1) → 10');

    await waitForEditor(page);
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('0 of 5 visible tests passed')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Error: Not implemented').first()).toBeVisible();

    await replaceCode(page, LRU_SOLUTION);
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 5 visible tests passed')).toBeVisible({ timeout: 20_000 });
  });

  test('the divider between the panes can be resized with the keyboard', async ({ page }) => {
    await page.goto('/challenges/pangram/workspace');
    const divider = page.getByRole('separator', { name: 'Resize problem and editor panes' });
    await expect(divider).toHaveAttribute('aria-valuenow', '38');
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '40');
  });
});
