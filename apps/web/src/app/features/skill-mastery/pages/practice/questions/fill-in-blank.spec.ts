import { TestBed } from '@angular/core/testing';
import type { FillInBlankQuestion } from '@pracstack/content-model';
import { FillInBlank, templateParts } from './fill-in-blank';

describe('templateParts', () => {
  it('splits a template into text and numbered blanks', () => {
    expect(templateParts('let a: {{blank:x}} = {{blank:y}};')).toEqual([
      { kind: 'text', text: 'let a: ' },
      { kind: 'blank', id: 'x', number: 1 },
      { kind: 'text', text: ' = ' },
      { kind: 'blank', id: 'y', number: 2 },
      { kind: 'text', text: ';' },
    ]);
  });
});

describe('FillInBlank', () => {
  const question: FillInBlankQuestion = {
    id: 'q',
    version: 1,
    skillId: 's',
    familyId: 'q',
    difficulty: 1,
    format: 'fill-in-blank',
    prompt: [],
    template: { language: 'typescript', source: 'let a: {{blank:x}} = {{blank:y}};' },
  };

  it('builds the answer from the inputs and marks blanks as graded by the server', async () => {
    const fixture = TestBed.createComponent(FillInBlank);
    fixture.componentRef.setInput('question', question);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = [...el.querySelectorAll<HTMLInputElement>('input')];
    expect(inputs.map((i) => i.getAttribute('aria-label'))).toEqual([
      'Blank 1 of 2',
      'Blank 2 of 2',
    ]);

    inputs[0]!.value = 'number';
    inputs[0]!.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.answer()).toEqual({
      format: 'fill-in-blank',
      blanks: { x: 'number' },
    });

    fixture.componentRef.setInput('revealed', {
      format: 'fill-in-blank',
      blanks: { x: 'number', y: '1' },
      blankResults: { x: true, y: false },
    });
    await fixture.whenStable();
    expect(inputs[0]!.classList.contains('correct')).toBe(true);
    expect(inputs[1]!.classList.contains('wrong')).toBe(true);
    expect(inputs[0]!.readOnly).toBe(true);
  });
});
