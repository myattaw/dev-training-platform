import { expect, type Page, test } from '@playwright/test';
import { PANGRAM_SOLUTION, replaceCode, waitForEditor } from './support/workspace';

/*
 * The e2e server sends the production security headers
 * (@pracstack/web-security). These tests fail on any CSP violation while the
 * app does everything the policy could break: styles, Monaco, the TypeScript
 * language worker, and evaluating learner code in the sandbox worker.
 */

function collectViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/content security policy/i.test(msg.text())) violations.push(msg.text());
  });
  return violations;
}

test.describe('security headers', () => {
  test('pages are served with a strict CSP and the hardening headers', async ({ page }) => {
    const response = await page.goto('/challenges');
    const headers = response?.headers() ?? {};
    expect(headers['content-security-policy']).toContain("script-src 'self';");
    expect(headers['content-security-policy']).not.toContain('unsafe-eval');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test('the whole app works under the CSP, including running code in the worker', async ({
    page,
  }) => {
    const violations = collectViolations(page);
    await page.goto('/');
    // Styles from the external stylesheet are applied (no inline onload loader).
    await expect(page.locator('app-top-nav')).toHaveCSS('position', 'sticky');

    await page.goto('/challenges/pangram/workspace');
    await waitForEditor(page);
    await replaceCode(page, PANGRAM_SOLUTION);
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 10 visible tests passed')).toBeVisible({ timeout: 30_000 });

    await page.goto('/skills/typescript');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('learner code in the browser test runner cannot make network requests', async ({ page }) => {
    await page.goto('/challenges/reverse-string/workspace');
    await waitForEditor(page);
    let leaked = false;
    page.on('request', (req) => {
      if (req.url().includes('exfiltrate')) leaked = true;
    });
    await replaceCode(
      page,
      [
        'export function reverse(input: string): string {',
        '  try {',
        "    const f = (globalThis as unknown as Record<string, (u: string) => Promise<unknown>>)['fetch'];",
        "    void f?.('/exfiltrate?d=' + input).catch(() => undefined);",
        '  } catch {}',
        "  return [...input].reverse().join('');",
        '}',
      ].join('\n'),
    );
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('All 6 visible tests passed')).toBeVisible({ timeout: 30_000 });
    expect(leaked).toBe(false);
  });
});
