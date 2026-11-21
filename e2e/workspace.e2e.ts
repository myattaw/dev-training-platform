import { expect, test } from '@playwright/test';
import { PANGRAM_SOLUTION, replaceCode, waitForEditor } from './support/workspace';

test.describe('coding workspace', () => {
  test('solving a challenge passes all visible tests and updates local status', async ({
    page,
  }) => {
    await page.goto('/challenges/pangram/workspace');
    await expect(page).toHaveTitle('Pangram · Workspace · PracStack');
    await waitForEditor(page);

    // The starter code throws, so every test fails.
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('0 of 10 visible tests passed')).toBeVisible();

    await replaceCode(page, PANGRAM_SOLUTION);
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 10 visible tests passed')).toBeVisible();

    await page.goto('/challenges');
    const row = page.locator('tbody tr', { hasText: 'Pangram' });
    await expect(row).toContainText('Visible tests passed');
  });

  test('Ctrl+Enter runs the tests and TypeScript errors are reported', async ({ page }) => {
    await page.goto('/challenges/reverse-string/workspace');
    await waitForEditor(page);
    await replaceCode(page, 'export function reverse(input: string): string {\n  return 42;\n}\n');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(
      page.getByText('TypeScript errors. Fix them before running the tests.'),
    ).toBeVisible();
    await expect(page.getByText(/Line 2, column \d+/)).toBeVisible();
  });

  test('console output appears in the Console tab', async ({ page }) => {
    await page.goto('/challenges/reverse-string/workspace');
    await waitForEditor(page);
    await replaceCode(
      page,
      "export function reverse(input: string): string {\n  console.log('called with', input);\n  return [...input].reverse().join('');\n}\n",
    );
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 6 visible tests passed')).toBeVisible();
    await page.getByRole('tab', { name: /Console/ }).click();
    await expect(page.locator('pre.console')).toContainText('called with robot');
  });

  test('drafts survive a reload and Reset asks before discarding them', async ({ page }) => {
    await page.goto('/challenges/pangram/workspace');
    await waitForEditor(page);
    await replaceCode(page, '// my draft\n');
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

  test('the divider between the panes can be resized with the keyboard', async ({ page }) => {
    await page.goto('/challenges/pangram/workspace');
    const divider = page.getByRole('separator', { name: 'Resize problem and editor panes' });
    await expect(divider).toHaveAttribute('aria-valuenow', '38');
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '40');
  });
});
