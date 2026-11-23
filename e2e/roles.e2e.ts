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
    await expect(roleRows(page)).toHaveCount(10);
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

test.describe('Job Description Analyzer', () => {
  /** A unique phrase, so we can prove the posting never reaches the API. */
  const MARKER = 'Zebra-Quokka claims platform';
  const POSTING = `${MARKER}
Requirements:
- 5+ years of experience with C# and .NET
- SQL Server and T-SQL; generic SQL reporting
- REST APIs on ASP.NET Core, unit testing
- CI/CD with Azure DevOps (ADO pipelines) and Docker
- Power Automate (formerly Microsoft Flow)`;

  test('analyses in the browser, never sends the posting, and saves only term ids', async ({
    page,
  }) => {
    const bodies: string[] = [];
    const urls: string[] = [];
    page.on('request', (request) => {
      urls.push(request.url());
      const body = request.postData();
      if (body !== null) bodies.push(`${request.method()} ${request.url()} ${body}`);
    });

    await page.goto('/roles/analyze');
    await expect(
      page.getByText('Analysed in your browser; the text is not sent to PracStack'),
    ).toBeVisible();
    await page.getByLabel('Paste the job description').fill(POSTING);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();

    const term = (id: string) => page.locator(`[data-term="${id}"]`);
    await expect(term('csharp')).toContainText('High confidence');
    await expect(term('csharp')).toContainText('5+ years of experience with C# and .NET');
    await expect(term('sql-server')).toContainText('Practice available');
    await expect(term('sql')).toContainText('generic SQL reporting');
    await expect(term('azure-devops')).toBeVisible();
    await expect(term('power-automate')).toContainText('Formerly Microsoft Flow.');
    await expect(term('docker')).toContainText('Not covered yet');
    await expect(page.locator('.uncovered')).toContainText('Docker');
    await expect(page.locator('.experience')).toContainText('5+ years of experience');
    await expect(
      page.getByText(/PracStack cannot satisfy years-of-experience requirements/),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'Suggested preparation path' })).toContainText(
      'Value and reference types',
    );

    const title = `E2E plan ${Date.now()}`;
    await page.getByLabel('Plan title').fill(title);
    await page.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.getByText('Plan saved')).toBeVisible();

    // Only the plan was posted, with a title and term ids, and never the posting.
    const posted = bodies.filter((b) => b.includes('/api/'));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain('/api/me/preparation/plans');
    expect(
      Object.keys(JSON.parse(posted[0]?.split(' ').slice(2).join(' ') ?? '{}')).sort(),
    ).toEqual(['termIds', 'title']);
    // Nothing about the posting in URLs either.
    expect(urls.filter((u) => u.includes('Zebra'))).toEqual([]);
    for (const body of bodies) {
      expect(body).not.toContain('Zebra');
      expect(body).not.toContain('years of experience');
    }
    // Not kept in the browser either.
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain('Zebra');

    // The saved plan rebuilds its path from term ids, and can be deleted.
    await page.getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Docker (not covered yet)')).toBeVisible();
    await page.getByRole('button', { name: 'Delete plan' }).click();
    await expect(page).toHaveURL('/roles');
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  });

  test('explains empty input', async ({ page }) => {
    await page.goto('/roles/analyze');
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.getByText('Nothing to analyze yet')).toBeVisible();
  });
});
