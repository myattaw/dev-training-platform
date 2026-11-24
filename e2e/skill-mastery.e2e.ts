import { expect, test } from '@playwright/test';
import { replaceCode, waitForEditor } from './support/workspace';

/*
 * These tests share one local API (and its local developer user), so they run
 * in order and each uses a different skill.
 */
test.describe.configure({ mode: 'serial' });

/**
 * For assertions that wait on SQL run or graded by the local API (PGlite, WebAssembly, in a
 * child process): its first query is a cold start, and grading runs the query on the sample
 * and hidden datasets. With the rest of the suite in parallel, that exceeds the default 5 s.
 */
const SQL = { timeout: 20_000 };

test.describe('Skill Mastery', () => {
  test('browse technologies, topics and skills', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Skill Mastery' })
      .click();
    await expect(page).toHaveURL('/skills');
    await expect(page).toHaveTitle('Skill Mastery · PracStack');

    // Every technology with working content is listed, including Angular.
    for (const tech of ['TypeScript', 'Angular', 'PostgreSQL', 'Oracle SQL'])
      await expect(page.getByRole('link', { name: `View ${tech} skills` })).toBeVisible();
    await page.getByRole('link', { name: 'View TypeScript skills' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'TypeScript' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Types and annotations' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Type narrowing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Objects and functions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reusable types' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(8);
    await expect(page.locator('tbody app-skill-status').first()).toHaveText('Not started');
    await expect(page.getByText('0 of 8 skills mastered')).toBeVisible();
  });

  test('practice: answers are graded and scored by the server', async ({ page }) => {
    await page.goto('/skills/typescript/ts-primitive-types/practice');
    await expect(page).toHaveTitle('Practice: Primitive types · PracStack');

    // A new learner starts at the Beginner tier; difficulty is not the mastery score.
    const progress = page.getByRole('region', { name: 'Progress' });
    await expect(progress).toContainText('Beginner');
    await expect(progress).toContainText('tier 1 of 5');
    await expect(page.locator('.question-meta')).toHaveText('Beginner');
    // Selection is deterministic (learner, skill, answers so far), so the questions are known.
    const prompt = page.locator('app-instruction-blocks.prompt');
    await expect(prompt).toHaveText('What type does TypeScript infer for city?');
    await page.getByRole('radio', { name: 'string', exact: true }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();

    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
    await expect(page.getByText('Mastery 0 → 6')).toBeVisible();
    await expect(page.locator('app-panel.feedback')).toContainText('widened primitive type');

    // Next: a question from another family, still Beginner and not seen before.
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.locator('.question-meta')).toHaveText('Beginner');
    await expect(prompt).toHaveText('What type does TypeScript infer for count?');
    await page.getByRole('radio', { name: 'number', exact: true }).check();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
    await expect(page.getByText('Mastery 6 → 12')).toBeVisible();
    // Two first-time correct answers in a row: up a tier.
    await expect(page.locator('.score-change')).toContainText('Up to Elementary');
    await expect(progress).toContainText('tier 2 of 5');

    // Results page shows the history; XP is in the top bar.
    await page.getByRole('link', { name: 'End practice' }).last().click();
    await expect(page).toHaveURL('/skills/typescript/ts-primitive-types');
    await expect(page.getByRole('meter', { name: 'Primitive types mastery' })).toHaveAttribute(
      'aria-valuenow',
      '12',
    );
    await expect(page.locator('tbody tr')).toHaveCount(2);
    // Total XP of the shared local user: other tests running in parallel may add to it.
    await expect(page.getByRole('banner')).toContainText(/\d+ XP/);
    const xp = Number(/(\d+) XP/.exec((await page.getByRole('banner').textContent()) ?? '')?.[1]);
    expect(xp).toBeGreaterThanOrEqual(20);
    await expect(page.getByRole('banner')).toContainText('Local mode');

    // The technology page and dashboard reflect the new score.
    await page.goto('/skills/typescript');
    // The skill's own row (other rows link to it under "Builds on").
    const primitivesRow = page
      .locator('tbody tr')
      .filter({ has: page.locator('td.name > a', { hasText: /^Primitive types$/ }) });
    await expect(primitivesRow).toContainText('In progress');
    await page.goto('/');
    // The TypeScript track card offers to continue a practiced skill.
    const track = page.locator('[data-track="typescript"]');
    await expect(track).toContainText('skills mastered');
    await expect(track.getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      /^\/skills\/typescript\/[\w-]+$/,
    );
    await expect(
      page.getByRole('progressbar', { name: 'TypeScript skills mastered' }),
    ).toBeVisible();
  });

  test('hints are tracked, and wrong answers reveal the correct one', async ({ page }) => {
    await page.goto('/skills/typescript/ts-union-types/practice');
    await expect(
      page.getByText('Which declarations compile? Select all that apply.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Hint (1 left)' }).click();
    await expect(
      page.getByText('A value of a union type can be any one of its member types.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'No more hints' })).toBeDisabled();

    await page.getByRole('checkbox', { name: "const b: Size = 'Small';" }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Not quite' })).toBeVisible();
    await expect(page.locator('.option.correct, .option.missed').first()).toContainText(
      "const a: Size = 'small';",
    );
    await expect(page.locator('.option.wrong')).toContainText("'Small'");

    await page.goto('/skills/typescript/ts-union-types');
    await expect(page.locator('tbody tr').first()).toContainText('Incorrect');
    await expect(page.locator('tbody tr').first().locator('td').nth(3)).toHaveText('1');
  });

  test('reloading does not reroll the question, and revealed hints come back', async ({ page }) => {
    await page.goto('/skills/typescript/ts-typeof-narrowing/practice');
    const prompt = page.locator('app-instruction-blocks.prompt');
    await expect(prompt).toContainText('Inside the');
    await page.getByRole('button', { name: /^Hint/ }).click();
    await expect(page.locator('.hints')).toContainText('narrows the union');

    await page.reload();
    await expect(prompt).toContainText('Inside the');
    await expect(page.locator('.hints')).toContainText('narrows the union');
  });

  test('PostgreSQL: run queries on sample data, then submit for grading', async ({ page }) => {
    await page.goto('/skills');
    await expect(page.getByRole('link', { name: 'View PostgreSQL skills' })).toBeVisible();

    await page.goto('/skills/postgresql/pg-select-where/practice');
    // Database explorer: tables with columns and keys, sample rows one table at a time.
    const explorer = page.locator('app-database-explorer');
    // The first table starts expanded; others open on click.
    await expect(explorer.getByRole('button', { name: /departments/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const employees = explorer.getByRole('button', { name: /employees/ });
    await expect(employees).toHaveAttribute('aria-expanded', 'false');
    await employees.click();
    await expect(employees).toHaveAttribute('aria-expanded', 'true');
    await expect(explorer.locator('.columns').last()).toContainText('salary');
    await expect(explorer.locator('.columns').last()).toContainText('FK → departments.id');
    await explorer.getByRole('tab', { name: 'Sample data' }).click();
    await explorer.getByRole('button', { name: 'employees', exact: true }).click();
    await expect(explorer).toContainText('Ada Lovelace');
    await waitForEditor(page);
    // The editor is large, and visible without scrolling.
    const box = await page.locator('app-code-editor').boundingBox();
    expect(box?.height).toBeGreaterThan(200);
    expect((box?.y ?? 9999) + 100).toBeLessThan(page.viewportSize()!.height);

    // A typo: Run shows PostgreSQL's error, nothing is scored.
    await replaceCode(page, 'SELECT nme, salary FROM employees');
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.result')).toContainText('column "nme" does not exist', SQL);

    await replaceCode(page, 'SELECT name, salary FROM employees');
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.result')).toContainText('8 rows', SQL);
    await expect(page.locator('.result')).toContainText('Grace Hopper');

    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible(SQL);
    // Feedback opens in the output panel, with a correct query.
    await expect(page.getByRole('tab', { name: 'Feedback' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('pre.reference')).toContainText('SELECT name, salary FROM employees');
    await expect(page.getByText('Mastery 0 → 6')).toBeVisible();
  });

  test('PostgreSQL: answers hard-coded from the sample data are caught by hidden data', async ({
    page,
  }) => {
    await page.goto('/skills/postgresql/pg-order-limit/practice');
    await expect(page.getByText('lowest salary first')).toBeVisible();
    await waitForEditor(page);
    // Matches the sample data exactly, but is not a real query for the task.
    await replaceCode(
      page,
      "SELECT name, salary FROM employees WHERE name IN ('Ada Lovelace','Alan Turing','Barbara Liskov','Dennis Ritchie','Grace Hopper','Ken Thompson','Linus Torvalds','Margaret Hamilton') ORDER BY salary",
    );
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Not quite' })).toBeVisible(SQL);
    await expect(
      page.getByText('right result for the sample data, but not for other data'),
    ).toBeVisible();
  });

  test('when the API is down, practice shows an error and the catalog still works', async ({
    page,
  }) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.goto('/skills/typescript/ts-discriminated-unions/practice');
    await expect(page.getByRole('alert')).toContainText('could not be reached');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    await page.goto('/skills/typescript');
    await expect(page.locator('tbody tr')).toHaveCount(8);
    await expect(page.getByText('Your progress could not be loaded')).toBeVisible();
  });
});
