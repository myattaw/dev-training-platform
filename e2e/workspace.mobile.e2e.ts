import { expect, test } from '@playwright/test';
import { PANGRAM_SOLUTION, replaceCode, waitForEditor } from './support/workspace';

test.describe('coding workspace on a phone', () => {
  test('uses Problem / Code / Results tabs and switches to Results after a run', async ({
    page,
  }) => {
    await page.goto('/challenges/pangram/workspace');
    const sections = page.getByRole('tablist', { name: 'Workspace sections' });
    await expect(sections).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pangram' })).toBeVisible();

    await sections.getByRole('tab', { name: 'Code' }).click();
    await waitForEditor(page);
    await replaceCode(page, PANGRAM_SOLUTION);

    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(sections.getByRole('tab', { name: 'Results' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('All 10 visible tests passed')).toBeVisible({ timeout: 20_000 });
  });

  test('navigation is a drawer that closes after navigating', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Coding Challenges' }).click();
    await expect(page).toHaveURL('/challenges');
    await expect(nav).toBeHidden();
  });
});
