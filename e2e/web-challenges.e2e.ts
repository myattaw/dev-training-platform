import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/*
 * Web Development Challenges end to end, against real framework runners
 * (Docker and `npm run web-runners:build`). Covers the catalog, the detail
 * page, the multi-file workspace, building and running the application, the
 * HTTP client, visible tests, compiler errors, a graded submission, progress,
 * and drafts across reloads and framework switches.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const root = 'content/src/web-challenges/employee-rest-api';
const reference = (path: string): string => readFileSync(`${root}/${path}`, 'utf8');

/** Replaces the active Monaco model's content (pasting avoids auto-closing brackets). */
async function setEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator('app-project-editor .monaco-editor').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('ControlOrMeta+V');
}

async function openFile(page: Page, name: string): Promise<void> {
  await page.getByRole('treeitem', { name: new RegExp(`^${name.replace('.', '\\.')}`) }).click();
  await expect(page.locator('.tab.active')).toContainText(name);
}

test.describe('web development challenges', () => {
  test.skip(skip, 'needs Docker and the web runner images');
  test.setTimeout(300_000);

  test('catalog, details and framework filter', async ({ page }) => {
    await page.goto('/web-challenges');
    await expect(page.getByRole('heading', { name: 'Web Development Challenges' })).toBeVisible();
    await page.getByLabel('Framework').selectOption('spring-boot');
    await expect(page).toHaveURL(/framework=spring-boot/);
    const row = page.locator('tbody tr', { hasText: 'Build an Employee REST API' });
    await expect(row).toContainText('Spring Boot');
    await row.getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'HTTP contract' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'POST /api/employees' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Django REST Framework/ })).toBeVisible();
  });

  test('Django: edit files, compile error, send HTTP requests, pass tests, submit', async ({
    page,
  }) => {
    await page.goto('/web-challenges/employee-rest-api/django/workspace');
    await expect(page.getByRole('tree', { name: 'Project files' })).toBeVisible();
    await expect(page.locator('.tab.active')).toContainText('views.py');
    // The framework picker shows the project's framework (it once showed the first option).
    await expect(page.getByLabel('Framework')).toHaveValue('django');

    // A syntax error is reported with its file and line.
    await setEditor(page, 'def broken(:\n');
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('Visible tests: Compilation error', { exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByRole('button', { name: /employees\/views\.py:1/ })).toBeVisible();

    // The reference solution, in two files.
    await setEditor(page, reference('django/reference/employees/views.py'));
    await openFile(page, 'serializers.py');
    await setEditor(page, reference('django/reference/employees/serializers.py'));

    // The HTTP client: two requests, sent in order to one fresh application.
    await page.getByRole('button', { name: 'HTTP client' }).click();
    await page.getByLabel('Path of request 1').fill('/api/employees/2');
    await page.getByRole('button', { name: 'Add request' }).click();
    await page.getByLabel('Path of request 2').fill('/api/employees/999');
    await page.getByRole('button', { name: 'Send requests' }).click();
    const responses = page.getByRole('region', { name: 'HTTP responses' });
    await expect(responses.locator('.status-line').first()).toContainText('200', {
      timeout: 90_000,
    });
    await expect(responses.locator('pre.body').first()).toContainText('Grace Hopper');
    await expect(responses.locator('.status-line').nth(1)).toContainText('404');
    // The application's output is shown, and the request list survives a reload.
    await page.getByRole('tab', { name: 'Output' }).click();
    await expect(page.locator('pre.logs')).not.toBeEmpty();
    await page.reload();
    await page.getByRole('button', { name: 'HTTP client' }).click();
    await expect(page.getByLabel('Path of request 2')).toHaveValue('/api/employees/999');

    // Visible tests, then a graded submission.
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('Visible tests: Accepted', { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Submission: Accepted', { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText('Solved. Your progress is saved.')).toBeVisible();

    await page.goto('/web-challenges/employee-rest-api');
    await expect(
      page.getByRole('radio', { name: /Django REST Framework/ }).locator('..'),
    ).toContainText('Completed');
  });

  test('drafts survive a reload and stay separate per framework', async ({ page }) => {
    await page.goto('/web-challenges/employee-rest-api/aspnetcore/workspace');
    await expect(page.locator('.tab.active')).toContainText('EmployeesController.cs');
    await setEditor(page, '// my ASP.NET Core draft\n');
    await expect(page.getByText(/Saved in this browser|All changes saved/)).toBeVisible({
      timeout: 10_000,
    });
    await page.reload();
    await expect(page.locator('app-project-editor')).toContainText('my ASP.NET Core draft');

    await page.getByLabel('Framework').selectOption('spring-boot');
    await expect(page).toHaveURL(/spring-boot\/workspace/);
    await expect(page.locator('app-project-editor')).not.toContainText('my ASP.NET Core draft');
    await page.getByLabel('Framework').selectOption('aspnetcore');
    await expect(page.locator('app-project-editor')).toContainText('my ASP.NET Core draft');
    // Read-only template files are marked and cannot be edited.
    await expect(page.getByRole('treeitem', { name: /Program\.cs.*read-only/ })).toBeVisible();
  });

  test('timed mode: the server deadline survives a reload', async ({ page }) => {
    await page.goto('/web-challenges/employee-rest-api');
    await page.getByText('Timed interview mode').click();
    await page.getByLabel('Duration').selectOption('30');
    await page.getByRole('button', { name: 'Start timed session' }).click();
    await expect(page).toHaveURL(/workspace\?timed=/);
    const url = page.url();
    const timer = page.getByRole('timer', { name: 'Time remaining' });
    await expect(timer).toContainText(/^\s*[12]?\d:\d\d\s*$/);
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(timer).toContainText(/^\s*[12]?\d:\d\d\s*$/);
    // Starting again resumes the same session instead of resetting the clock.
    await page.goto('/web-challenges/employee-rest-api');
    await page.getByText('Timed interview mode').click();
    await page.getByRole('button', { name: 'Start timed session' }).click();
    await expect(page).toHaveURL(url);
    await page.getByRole('button', { name: 'Finish session' }).click();
    await expect(page.getByText('Timed session summary')).toBeVisible();
  });
});
