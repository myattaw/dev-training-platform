import { expect, type Page, test } from '@playwright/test';

/*
 * Job Role Preparation and the job description analyzer, against the real
 * local API and the generated content. Every test runs as the same local
 * developer, in parallel, so only one test changes the target role and each
 * saved plan has its own title.
 */

const roleRows = (page: Page) => page.locator('table[aria-labelledby="roles-heading"] tbody tr');

test.describe('Job Role Preparation', () => {
  test('the catalog lists roles with status badges and filters by technology', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav
      .getByRole('list', { name: 'Career Preparation' })
      .getByRole('link', { name: 'Job Role Preparation' })
      .click();
    await expect(page).toHaveURL('/roles');
    await expect(page).toHaveTitle('Job Role Preparation · PracStack');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Job Role Preparation' }),
    ).toBeVisible();

    const backend = roleRows(page).filter({ hasText: '.NET Backend Developer' });
    await expect(backend).toContainText('Available');
    await expect(backend).toContainText('12 of 12 competencies');
    const architect = roleRows(page).filter({ hasText: 'Power Platform Solution Architect' });
    await expect(architect).toContainText('Coming soon');
    await expect(architect).toContainText('No path yet');

    await page.getByRole('combobox', { name: 'Technology' }).selectOption({ label: 'Dataverse' });
    await expect(page).toHaveURL(/tech=dataverse/);
    await expect(roleRows(page)).toHaveCount(2);
    await page.getByRole('searchbox', { name: 'Search roles' }).fill('architect');
    await expect(roleRows(page)).toHaveCount(1);
    await page.reload();
    await expect(roleRows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(roleRows(page)).toHaveCount(14);
  });

  test('a role page shows the ordered path, progress and the target role', async ({ page }) => {
    await page.goto('/roles/dotnet-backend-developer');
    await expect(page).toHaveTitle('.NET Backend Developer · PracStack');
    const path = page.getByRole('list', { name: 'Preparation path' });
    await expect(path.locator('.competency-name').first()).toHaveText('1C# fundamentals');
    await expect(path.locator('.competency-name').last()).toHaveText(
      '12Enterprise development scenario',
    );
    await expect(path.getByRole('link', { name: 'Value and reference types' })).toHaveAttribute(
      'href',
      '/skills/csharp/cs-value-reference-types',
    );

    await expect(page.getByText('Content coverage')).toBeVisible();
    await expect(page.getByText('Skills mastered')).toBeVisible();
    await expect(page.getByText('Challenges solved')).toBeVisible();
    await expect(page.getByText(/not professional experience/)).toBeVisible();
    await expect(page.getByText(/readiness/i)).toHaveCount(0);
    await expect(page.locator('.next-title')).not.toBeEmpty();

    // Set as target: highlighted in the catalog; then cleared again.
    await page.getByRole('button', { name: 'Set as my target role' }).click();
    await expect(page.getByText('This is your target role')).toBeVisible();
    await page.getByRole('link', { name: 'Job Role Preparation' }).first().click();
    await expect(roleRows(page).filter({ hasText: '.NET Backend Developer' })).toContainText(
      'Your target',
    );
    await page.goto('/roles/dotnet-backend-developer');
    await page.getByRole('button', { name: 'Remove as target' }).click();
    await expect(page.getByRole('button', { name: 'Set as my target role' })).toBeVisible();
  });

  test('a C# challenge in a path opens the workspace in C#', async ({ page }) => {
    await page.goto('/roles/csharp-dotnet-developer');
    await page
      .getByRole('list', { name: 'Preparation path' })
      .getByRole('link', { name: 'Reverse String' })
      .click();
    await expect(page).toHaveURL('/challenges/reverse-string/workspace');
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('csharp');
  });

  test('a coming-soon role explains itself and links related practice', async ({ page }) => {
    await page.goto('/roles/power-platform-solution-architect');
    await expect(page.getByText('There is no preparation path for this role yet')).toBeVisible();
    await expect(page.getByText('Related practice available now')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Power Apps and Power Fx' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set as my target role' })).toHaveCount(0);
  });
});

test.describe('Interview Study Planner', () => {
  /** A unique phrase, so we can prove the posting never reaches the API. */
  const MARKER = 'Zebra-Quokka claims platform';
  const POSTING = `${MARKER}

What will you do?
- Write business applications using C#, MVC, SSIS and SSRS.
- Test and debug programs; maintain existing systems.
- Write technical documentation.

Requirements:
- 5+ years of experience with C# and the .NET Framework
- Experience with SQL Server, SSIS and SSRS
- Experience with microservices and APIs is a plus
- Familiarity with cloud platforms (e.g., Azure, AWS)
- Must be authorized to work in the United States`;

  test('plans in the browser within the time budget, saves no posting text, and tracks the plan', async ({
    page,
  }) => {
    // A long flow: analyze, plan, three tabs, save, reopen, mark, follow a link, delete.
    test.setTimeout(120_000);
    const bodies: string[] = [];
    const urls: string[] = [];
    page.on('request', (request) => {
      urls.push(request.url());
      const body = request.postData();
      if (body !== null) bodies.push(`${request.method()} ${request.url()} ${body}`);
    });

    await page.goto('/roles/analyze');
    await expect(
      page.getByText('Analyzed in your browser; the posting is not sent to PracStack'),
    ).toBeVisible();
    await page.getByLabel('Paste the job description').fill(POSTING);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();

    // The posting collapses; the study plan is the default view.
    await expect(page.getByText(/Job description analyzed/)).toBeVisible();
    await expect(page.getByLabel('Paste the job description')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Study plan' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.summary-grid')).toContainText('Requirements to prepare');

    // One week at two hours a day: never more than 2 h on any day.
    await page.getByRole('button', { name: 'In 1 week' }).click();
    await page.getByRole('button', { name: '2 hours' }).click();
    await page
      .getByLabel('Interview format')
      .selectOption({ label: 'Enterprise application development' });
    await expect(page.locator('.budget')).toContainText('available (7 days × 2 h)');
    await expect(page.locator('.day')).toHaveCount(7);
    for (const total of await page.locator('.day-total').allTextContents()) {
      expect(total.trim()).toMatch(/ of 2 h$/);
      const [, h, m] = /^(?:(\d+) h)? ?(?:(\d+) min)?/.exec(total.trim()) ?? [];
      expect(Number(h ?? 0) * 60 + Number(m ?? 0)).toBeLessThanOrEqual(120);
    }
    // Unsupported requirements stay in the plan as external study.
    await expect(page.locator('[data-key="external:dotnet-framework"]')).toBeVisible();

    // Requirements: level, priority and coverage; evidence collapsed until opened.
    await page.getByRole('tab', { name: /Detected requirements/ }).click();
    const row = (id: string) => page.locator(`tr[data-term="${id}"]`);
    await expect(row('csharp')).toContainText('Required');
    await expect(row('csharp')).toContainText('High priority');
    await expect(row('microservices')).toContainText('Preferred');
    await expect(row('aspnet-mvc')).toContainText('Ambiguous');
    await expect(row('csharp').getByText('5+ years of experience with C#')).toBeHidden();
    await row('csharp')
      .getByText(/Evidence/)
      .click();
    await expect(row('csharp').getByText('5+ years of experience with C#')).toBeVisible();
    await expect(page.locator('.alternatives')).toContainText('Azure, AWS');
    await expect(page.getByText('Must be authorized to work in the United States')).toBeVisible();

    // Coverage gaps: what is not covered and official documentation.
    await page.getByRole('tab', { name: /Coverage gaps/ }).click();
    const framework = page.locator('.gap[data-term="dotnet-framework"]');
    await expect(framework).toContainText('Related practice only');
    await expect(
      framework.locator('a[href^="https://learn.microsoft.com/"]').first(),
    ).toBeVisible();
    await expect(page.locator('.gap[data-term="ssis"]')).toContainText('Knowledge questions only');

    // Save: requirements, settings, schedule keys and marks; never the posting.
    await page.getByRole('tab', { name: 'Study plan' }).click();
    const title = `E2E plan ${Date.now()}`;
    await page.getByLabel('Plan title').fill(title);
    await page.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.getByText('Plan saved')).toBeVisible();
    const posted = bodies.filter((b) => b.includes('/api/'));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain('/api/me/preparation/plans');
    expect(
      Object.keys(JSON.parse(posted[0]?.split(' ').slice(2).join(' ') ?? '{}')).sort(),
    ).toEqual(['done', 'requirements', 'schedule', 'settings', 'skipped', 'termIds', 'title']);
    expect(urls.filter((u) => u.includes('Zebra'))).toEqual([]);
    for (const body of bodies) {
      expect(body).not.toContain('Zebra');
      expect(body).not.toContain('years of experience');
      expect(body).not.toContain('authorized to work');
    }
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain('Zebra');

    // The saved plan: same schedule, marks persist, and it can be deleted.
    await page.getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Resume your preparation')).toBeVisible();
    await expect(page.locator('.day')).toHaveCount(7);
    const external = page.locator('[data-key="external:dotnet-framework"]');
    await external.getByRole('button', { name: 'Mark done' }).click();
    await expect(external).toContainText('Marked done');
    await page.reload();
    await expect(page.locator('[data-key="external:dotnet-framework"]')).toContainText(
      'Marked done',
    );
    // A practice link opens real content.
    const planUrl = page.url();
    const href = await page.locator('.item[data-key^="skill:"] a').first().getAttribute('href');
    expect(href).toMatch(/^\/skills\/[a-z0-9-]+\/[a-z0-9-]+$/);
    await page.goto(href!);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/not found/i)).toHaveCount(0);
    await page.goto(planUrl);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('button', { name: 'Delete plan' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete plan' }).click();
    await expect(page).toHaveURL('/roles');
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  });

  test('editing the posting invalidates the results until it is analyzed again', async ({
    page,
  }) => {
    await page.goto('/roles/analyze');
    await page.getByRole('button', { name: 'Try an example' }).click();
    await expect(page.locator('app-study-plan-view')).toBeVisible();
    await page.getByRole('button', { name: 'Edit job description' }).click();
    await page.getByLabel('Paste the job description').fill('Requirements:\n- Java');
    await expect(page.getByText('The job description changed')).toBeVisible();
    await expect(page.locator('app-study-plan-view')).toHaveCount(0);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.locator('app-study-plan-view')).toBeVisible();
  });

  test('explains empty input', async ({ page }) => {
    await page.goto('/roles/analyze');
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.getByText('Nothing to analyze yet')).toBeVisible();
  });
});
