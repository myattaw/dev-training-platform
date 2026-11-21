import { expect, test } from '@playwright/test';

/*
 * These tests share one local API (and its local developer user), so they run
 * in order and each uses a different skill.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Skill Mastery', () => {
  test('browse technologies, topics and skills', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Skill Mastery' })
      .click();
    await expect(page).toHaveURL('/skills');
    await expect(page).toHaveTitle('Skill Mastery · PracStack');

    await page.getByRole('link', { name: 'View TypeScript skills' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'TypeScript' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Types and annotations' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Type narrowing' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await expect(page.locator('tbody app-skill-status').first()).toHaveText('Not started');
    await expect(page.getByText('0 of 4 skills mastered')).toBeVisible();
  });

  test('practice: answers are graded and scored by the server', async ({ page }) => {
    await page.goto('/skills/typescript/ts-primitive-types/practice');
    await expect(page).toHaveTitle('Practice: Primitive types · PracStack');

    // Score 0 → the server offers the difficulty-1 question.
    await expect(page.getByText('Level 1 of 5')).toBeVisible();
    await expect(page.getByText('What type does TypeScript infer for')).toBeVisible();
    await page.getByRole('radio', { name: 'number', exact: true }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();

    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
    await expect(page.getByText('Score 0 → 9')).toBeVisible();
    await expect(page.locator('app-panel.feedback')).toContainText('TypeScript infers');

    // Next: the difficulty-1 question was just answered, so the nearest level (2) is served.
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByText('Level 2 of 5')).toBeVisible();
    await page.getByRole('textbox', { name: 'Blank 1 of 1' }).fill('boolean');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible();
    await expect(page.getByText('Score 9 → 20')).toBeVisible();

    // Results page shows the history; XP is in the top bar.
    await page.getByRole('link', { name: 'End practice' }).last().click();
    await expect(page).toHaveURL('/skills/typescript/ts-primitive-types');
    await expect(page.getByRole('meter', { name: 'Primitive types mastery' })).toHaveAttribute(
      'aria-valuenow',
      '20',
    );
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByRole('banner')).toContainText('30 XP');
    await expect(page.getByRole('banner')).toContainText('Local mode');

    // The technology page and dashboard reflect the new score.
    await page.goto('/skills/typescript');
    await expect(page.locator('tbody tr', { hasText: 'Primitive types' })).toContainText(
      'In progress',
    );
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Skill Mastery' })).toContainText(
      'Primitive types',
    );
  });

  test('hints are tracked, and wrong answers reveal the correct one', async ({ page }) => {
    await page.goto('/skills/typescript/ts-union-types/practice');
    await expect(page.getByText('Which value can not be assigned to')).toBeVisible();

    await page.getByRole('button', { name: 'Get a hint (1 left)' }).click();
    await expect(
      page.getByText('A union accepts a value of any one of its member types.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'No more hints' })).toBeDisabled();

    await page.getByRole('radio', { name: '42' }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Not quite' })).toBeVisible();
    await expect(page.locator('.option.correct, .option.missed')).toContainText('true');
    await expect(page.locator('.option.wrong')).toContainText('42');

    await page.goto('/skills/typescript/ts-union-types');
    await expect(page.locator('tbody tr').first()).toContainText('Incorrect');
    await expect(page.locator('tbody tr').first().locator('td').nth(3)).toHaveText('1');
  });

  test('reloading does not reroll the question, and revealed hints come back', async ({ page }) => {
    await page.goto('/skills/typescript/ts-typeof-narrowing/practice');
    const prompt = page.locator('app-instruction-blocks.prompt');
    await expect(prompt).toContainText('Inside the');
    await page.getByRole('button', { name: /Get a hint/ }).click();
    await expect(page.locator('.hints')).toContainText('narrows the union');

    await page.reload();
    await expect(prompt).toContainText('Inside the');
    await expect(page.locator('.hints')).toContainText('narrows the union');
  });

  test('when the API is down, practice shows an error and the catalog still works', async ({
    page,
  }) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.goto('/skills/typescript/ts-discriminated-unions/practice');
    await expect(page.getByRole('alert')).toContainText('could not be reached');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    await page.goto('/skills/typescript');
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await expect(page.getByText('Your progress could not be loaded')).toBeVisible();
  });
});
