import { TestBed } from '@angular/core/testing';
import type { SqlQueryQuestion } from '@pracstack/content-model';
import { SqlQuery } from './sql-query';

const question: SqlQueryQuestion = {
  id: 'q',
  version: 1,
  skillId: 's',
  familyId: 'q',
  difficulty: 1,
  format: 'sql-query',
  dialect: 'postgresql',
  prompt: [],
  schema: 'CREATE TABLE items (id int, name text);',
  sampleTables: [
    {
      table: 'items',
      columns: ['id', 'name'],
      rows: [
        [1, 'Tea'],
        [2, null],
      ],
    },
  ],
  ordered: false,
};

async function setup() {
  const fixture = TestBed.createComponent(SqlQuery);
  fixture.componentRef.setInput('question', question);
  const runs: string[] = [];
  fixture.componentInstance.run.subscribe((q) => runs.push(q));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const runButton = () =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Run query'),
    );
  return { fixture, el, runs, runButton };
}

describe('SqlQuery', () => {
  it('shows the schema in the database explorer: tables, columns and types', async () => {
    const { el } = await setup();
    const explorer = el.querySelector('app-database-explorer')!;
    expect(explorer.querySelector('.table-toggle')?.textContent).toContain('items');
    expect(explorer.querySelector('.table-toggle')?.textContent).toContain('2 columns');
    const columns = [...explorer.querySelectorAll('.columns tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(0, 2).map((td) => td.textContent?.trim()),
    );
    expect(columns).toEqual([
      ['id', 'int'],
      ['name', 'text'],
    ]);
    expect(explorer.querySelector('.ddl pre')?.textContent).toContain('CREATE TABLE items');
  });

  it('shows the sample rows, with NULL marked, on the Sample data tab', async () => {
    const { fixture, el } = await setup();
    const tab = [
      ...el.querySelectorAll<HTMLButtonElement>('app-database-explorer [role="tab"]'),
    ].find((b) => b.textContent?.includes('Sample data'))!;
    tab.click();
    await fixture.whenStable();
    const cells = [...el.querySelectorAll('app-database-explorer td')].map((td) =>
      td.textContent?.trim(),
    );
    expect(cells).toEqual(['1', 'Tea', '2', 'NULL']);
    expect(el.querySelector('app-database-explorer td.null')).not.toBeNull();
  });

  it('places the editor and the Results / Feedback panel in the workspace', async () => {
    const { fixture, el } = await setup();
    expect(el.querySelector('app-code-editor')).not.toBeNull();
    const outputTabs = () =>
      [...el.querySelectorAll('.output-area [role="tab"]')].map((t) => ({
        label: t.textContent?.trim(),
        selected: t.getAttribute('aria-selected'),
      }));
    expect(outputTabs()).toEqual([
      { label: 'Results', selected: 'true' },
      { label: 'Feedback', selected: 'false' },
    ]);
    fixture.componentRef.setInput('hasFeedback', true);
    await fixture.whenStable();
    expect(outputTabs()[1]).toEqual({ label: 'Feedback', selected: 'true' });
  });

  it('runs the current query (from the answer) and disables Run when empty', async () => {
    const { fixture, runs, runButton } = await setup();
    expect(runButton()?.disabled).toBe(true);

    fixture.componentRef.setInput('answer', {
      format: 'sql-query',
      query: 'SELECT name FROM items',
    });
    await fixture.whenStable();
    runButton()!.click();
    expect(runs).toEqual(['SELECT name FROM items']);
  });

  it('shows run results and errors', async () => {
    const { fixture, el } = await setup();
    fixture.componentRef.setInput('runState', {
      status: 'done',
      response: {
        kind: 'rows',
        durationMs: 3,
        table: { columns: [{ name: 'name', type: 'text' }], rows: [['Tea']], truncated: false },
      },
    });
    await fixture.whenStable();
    expect(el.querySelector('.result')?.textContent).toContain('Tea');
    expect(el.querySelector('.result th')?.textContent).toContain('text');

    fixture.componentRef.setInput('runState', {
      status: 'done',
      response: { kind: 'error', message: 'column "nam" does not exist' },
    });
    await fixture.whenStable();
    expect(el.querySelector('.result [role="alert"]')?.textContent).toContain(
      'column "nam" does not exist',
    );
  });

  it('reveals a correct query only after grading, and hides Run', async () => {
    const { fixture, el, runButton } = await setup();
    expect(el.querySelector('.reference')).toBeNull();
    fixture.componentRef.setInput('revealed', {
      format: 'sql-query',
      referenceQuery: 'SELECT name FROM items',
    });
    await fixture.whenStable();
    expect(el.querySelector('.reference')?.textContent).toContain('SELECT name FROM items');
    expect(runButton()).toBeUndefined();
  });
});
