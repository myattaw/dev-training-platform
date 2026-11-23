import { expect, test } from '@playwright/test';
import { replaceCode, waitForEditor } from './support/workspace';

/*
 * Company Interview Prep against the real local API and the demonstration
 * dataset. Every test runs as the same local developer, in parallel, so each
 * one works with its own company.
 */

const TEXT_BUFFER_SOLUTION = `export class TextBuffer {
  private before: string[] = [];
  private after: string[] = [];
  insert(text: string): void { for (const ch of text) this.before.push(ch); }
  backspace(count: number): number {
    const k = Math.min(count, this.before.length);
    this.before.length -= k;
    return k;
  }
  move(offset: number): number {
    for (let i = 0; i < Math.abs(offset); i++) {
      const [from, to] = offset < 0 ? [this.before, this.after] : [this.after, this.before];
      const ch = from.pop();
      if (ch === undefined) break;
      to.push(ch);
    }
    return this.before.length;
  }
  textAround(radius: number): string {
    const left = this.before.slice(Math.max(0, this.before.length - radius)).join('');
    const right = this.after.slice(Math.max(0, this.after.length - radius)).reverse().join('');
    return left + '|' + right;
  }
  getText(): string { return this.before.join('') + [...this.after].reverse().join(''); }
  getCursor(): number { return this.before.length; }
}
`;

test.describe('Company Interview Prep', () => {
  test('search finds Liberty Mutual, whose page separates reported questions from practice', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Company Interview Prep' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Company Interview Prep' }),
    ).toBeVisible();

    await page.getByRole('searchbox', { name: 'Search companies' }).fill('LIBERTY');
    await expect(page).toHaveURL(/q=LIBERTY/);
    await expect(page.getByText('1 company', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Liberty Mutual' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Liberty Mutual' })).toBeVisible();
    const questions = page.locator('table[aria-labelledby="questions-heading"]');
    const row = questions.locator('tbody tr', { hasText: 'Design a Text Editor' });
    await expect(row).toContainText('Hard');
    await expect(row).toContainText('LeetCode #2296');
    await expect(row.getByRole('link', { name: /Solve on LeetCode/ })).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/design-a-text-editor',
    );
    await expect(page.getByText(/Source snapshot: July 2026/)).toBeVisible();
    await expect(page.getByText(/not the chance of being asked/)).toBeVisible();
    await expect(page.getByText(/not affiliated with, endorsed by or sponsored by/)).toBeVisible();

    // Recommended practice: PracStack's own challenges, and Pro previews with nothing to start.
    const recs = page.getByRole('list', { name: 'Recommended practice' });
    await expect(recs.getByRole('link', { name: 'Text Buffer with a Cursor' })).toBeVisible();
    const pro = recs.getByRole('listitem').filter({ hasText: 'Piece Table Text Buffer' });
    await expect(pro).toContainText('Pro');
    await expect(pro).toContainText('Coming soon');
    await expect(pro.getByRole('link')).toHaveCount(0);
    await expect(page.getByText(/nothing can be bought today/)).toBeVisible();
    await expect(page.getByRole('button', { name: /buy|upgrade|subscribe/i })).toHaveCount(0);

    // The reported question's own page links out and never copies the statement.
    await row.getByRole('link', { name: 'Design a Text Editor' }).click();
    await expect(page.getByText(/PracStack does not copy it/)).toBeVisible();
  });

  test('browses alphabetically and explains empty results', async ({ page }) => {
    await page.goto('/companies');
    await page.getByRole('button', { name: 'Names starting with G' }).click();
    await expect(page).toHaveURL(/letter=G/);
    await expect(page.locator('table[aria-labelledby="companies-heading"] tbody tr')).toHaveCount(
      1,
    );
    await expect(page.getByRole('button', { name: 'Names starting with Z' })).toBeDisabled();

    await page.goto('/companies?q=nonexistent');
    await expect(page.getByText('No companies found')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).last().click();
    await expect(page.getByText('5 companies')).toBeVisible();
  });

  test('marks a reported question and saves the company', async ({ page }) => {
    await page.goto('/companies/geico');
    await expect(page.getByRole('heading', { level: 1, name: 'GEICO' })).toBeVisible();
    await expect(page.getByText(/PracStack shows 4 of the 18 questions/)).toBeVisible();

    await page
      .getByRole('combobox', { name: 'Your mark for Valid Sudoku' })
      .selectOption('reviewed-externally');
    const progress = page.locator('.progress');
    await expect(progress).toContainText('1 of 4');
    await expect(progress).toContainText('In progress');

    await page.getByRole('button', { name: 'Save company' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
    await page.getByRole('link', { name: 'Company Interview Prep' }).first().click();
    const saved = page.locator('table[aria-labelledby="saved-heading"]');
    await expect(saved.locator('tbody tr', { hasText: 'GEICO' })).toContainText('1 of 4');
  });

  test('timed practice: server deadline, resume after reload, graded submit, summary', async ({
    page,
  }) => {
    // The graded submit runs in the Docker code runner (see submissions.e2e.ts).
    test.skip(process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1', 'Docker tests skipped');
    test.setTimeout(120_000);
    await page.goto('/companies/liberty-mutual/practice');
    await page.getByRole('radio', { name: /Text Buffer with a Cursor/ }).check();
    await page.getByRole('radio', { name: '30 minutes' }).check();
    await page.getByRole('button', { name: 'Start 30-minute session' }).click();
    await expect(page).toHaveURL(/\/companies\/liberty-mutual\/practice\/[0-9a-f-]{36}$/);

    const timer = page.getByRole('timer');
    await expect(timer).toHaveText(/^(29|30):\d\d$/);
    await waitForEditor(page);

    // Reloading keeps the same server deadline (the clock does not restart).
    await page.reload();
    await expect(page.getByRole('timer')).toHaveText(/^(29|30):\d\d$/);
    await waitForEditor(page);

    await replaceCode(page, TEXT_BUFFER_SOLUTION);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Accepted').first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('button', { name: 'Finish session' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Session summary' })).toBeVisible();
    const summary = page.locator('.results');
    await expect(summary).toContainText('of 30 min');
    await expect(summary).toContainText('11 of 11');
    await expect(summary).toContainText('Accepted');
    await expect(page.getByText(/no company graded this session/)).toBeVisible();
  });

  test('Coming soon challenges are listed but cannot be opened in an editor', async ({ page }) => {
    await page.goto('/challenges');
    const planned = page.locator('table[aria-labelledby="planned-heading"] tbody tr');
    await expect(planned).toHaveCount(2);
    await planned.getByRole('link', { name: 'Piece Table Text Buffer' }).click();
    await expect(page.getByText(/No release date has been set/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open workspace' })).toHaveCount(0);
    await page.goto('/challenges/piece-table-editor/workspace');
    await expect(page.getByText('Challenge not found')).toBeVisible();
  });
});

test.describe('account', () => {
  test('shows the Free plan with Pro as Coming soon, and imports browser drafts', async ({
    page,
  }) => {
    await page.goto('/challenges');
    await page.evaluate(() =>
      localStorage.setItem(
        'pracstack:challenge:reverse-string:typescript:draft',
        JSON.stringify({ code: '// my draft', updatedAt: '2026-11-20T10:00:00.000Z' }),
      ),
    );
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Account' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    await expect(page.getByText('Free', { exact: true })).toBeVisible();
    await expect(page.getByText(/Paid plans are not available yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: /buy|upgrade|subscribe|purchase/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByText('Continue with GitHub is not available yet', { exact: false }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Import into my account' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toContainText(
      /Imported 1|already in your account 1/,
    );
    await expect(page.locator('.drafts')).toContainText('reverse-string');
  });

  test('My Progress gives an overview', async ({ page }) => {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'My Progress' })).toBeVisible();
    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Company preparation' })).toBeVisible();
  });
});
