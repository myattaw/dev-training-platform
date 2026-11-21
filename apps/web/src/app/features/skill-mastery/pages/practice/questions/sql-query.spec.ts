import { TestBed } from '@angular/core/testing';
import type { SqlQueryQuestion } from '@pracstack/content-model';
import { SqlQuery } from './sql-query';

const question: SqlQueryQuestion = {
  id: 'q',
  version: 1,
  skillId: 's',
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
  it('shows the schema and the sample rows, with NULL marked', async () => {
    const { el } = await setup();
    expect(el.querySelector('.schema pre')?.textContent).toContain('CREATE TABLE items');
    const cells = [...el.querySelectorAll('.samples td')].map((td) => td.textContent?.trim());
    expect(cells).toEqual(['1', 'Tea', '2', 'NULL']);
    expect(el.querySelector('.samples td.null')).not.toBeNull();
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
