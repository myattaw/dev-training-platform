import { expect, type Page, test } from '@playwright/test';

/** Rows of the main challenges table (not the Coming soon table). */
const challengeRows = (page: Page) =>
  page.locator('table[aria-labelledby="challenges-heading"] tbody tr');

test.describe('navigation and catalog', () => {
  test('dashboard links to the challenge catalog', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Dashboard · PracStack');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Your tracks' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Coding Challenges' })
      .click();
    await expect(page).toHaveURL('/challenges');
    await expect(page.getByRole('heading', { level: 1, name: 'Coding Challenges' })).toBeVisible();
    await expect(challengeRows(page)).toHaveCount(8);
  });

  test('catalog filters are reflected in, and restored from, the URL', async ({ page }) => {
    await page.goto('/challenges');
    await page.getByRole('combobox', { name: 'Difficulty' }).selectOption('medium');
    await expect(page).toHaveURL(/difficulty=medium/);
    await expect(challengeRows(page)).toHaveCount(5);

    await page.getByRole('searchbox', { name: 'Search challenges' }).fill('interval');
    await expect(challengeRows(page)).toHaveCount(1);

    await page.reload();
    await expect(challengeRows(page)).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Merge Intervals' })).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(challengeRows(page)).toHaveCount(8);
  });

  test('challenge detail shows the problem and opens the workspace', async ({ page }) => {
    await page.goto('/challenges');
    await page.getByRole('link', { name: 'Balanced Brackets' }).click();
    await expect(page).toHaveTitle('Balanced Brackets · PracStack');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
      'Coding Challenges',
    );
    await expect(page.getByText('Visible tests (10)')).toBeVisible();

    await page.getByRole('link', { name: 'Open workspace' }).click();
    await expect(page).toHaveURL('/challenges/balanced-brackets/workspace');
  });

  test('old /exercises links redirect to the new routes', async ({ page }) => {
    await page.goto('/exercises/pangram');
    await expect(page).toHaveURL('/challenges/pangram/workspace');
    await page.goto('/exercises');
    await expect(page).toHaveURL('/challenges');
  });

  test('unknown pages and challenges show a not-found state', async ({ page }) => {
    await page.goto('/no/such/page');
    await expect(page.getByText('Page not found')).toBeVisible();
    await page.goto('/challenges/no-such-challenge');
    await expect(page.getByText('Challenge not found')).toBeVisible();
    await page.getByRole('link', { name: 'Browse challenges' }).click();
    await expect(page).toHaveURL('/challenges');
  });

  test('shows an error with a retry when content cannot be loaded', async ({ page }) => {
    let fail = true;
    await page.route('**/content/manifest.json', (route) =>
      fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue(),
    );
    await page.goto('/challenges');
    await expect(page.getByRole('alert')).toContainText('Content request failed (503).');

    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(challengeRows(page)).toHaveCount(8);
  });

  test('skip link moves focus to the main content', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('button', { name: 'Skip to main content' });
    // The app renders after loading /config.json; a Tab pressed before that goes elsewhere.
    await expect(skip).toBeAttached();
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('side navigation can be collapsed and the choice is remembered', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();
    await page.getByRole('button', { name: 'Close navigation' }).click();
    await expect(nav).toBeHidden();
    await page.reload();
    await expect(nav).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(nav).toBeVisible();
  });

  test('the sidebar is wide enough for its labels, and groups practice areas', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const box = await page.locator('app-side-nav').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(250);
    expect(box?.width).toBeLessThanOrEqual(260);
    await expect(nav.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await expect(nav.getByRole('list', { name: 'Practice' })).toContainText('Coding Challenges');
    // No label is cut off.
    for (const label of await nav.locator('.label').all()) {
      expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  });
});
