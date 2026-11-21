import { describe, expect, it } from 'vitest';
import { ApiError } from '../http';
import { fixtureContent } from '../testing/fixtures';
import { gradeAnswer } from './grading';

const content = fixtureContent();
const q = (id: string) => content.findQuestion(id)!;
const grade = (id: string, answer: Parameters<typeof gradeAnswer>[2]) =>
  gradeAnswer(q(id).question, q(id).grading.answer, answer);

describe('multiple choice', () => {
  it('grades single selection', () => {
    expect(grade('q-mcq', { format: 'multiple-choice', selected: ['a'] })).toEqual({
      result: 'correct',
      revealed: { format: 'multiple-choice', correct: ['a'] },
    });
    expect(grade('q-mcq', { format: 'multiple-choice', selected: ['b'] }).result).toBe('incorrect');
  });

  it('gives partial credit for some correct options and no wrong ones', () => {
    expect(grade('q-multi', { format: 'multiple-choice', selected: ['e', 'a'] }).result).toBe(
      'correct',
    );
    expect(grade('q-multi', { format: 'multiple-choice', selected: ['a'] })).toMatchObject({
      result: 'partial',
      note: 'You chose 1 of the 2 correct options and no wrong ones.',
    });
    expect(grade('q-multi', { format: 'multiple-choice', selected: ['a', 'b'] }).result).toBe(
      'incorrect',
    );
  });

  it('rejects unknown options, empty answers and several picks for single selection', () => {
    expect(() => grade('q-mcq', { format: 'multiple-choice', selected: ['z'] })).toThrow(ApiError);
    expect(() => grade('q-mcq', { format: 'multiple-choice', selected: [] })).toThrow(
      'Select at least one option.',
    );
    expect(() => grade('q-mcq', { format: 'multiple-choice', selected: ['a', 'b'] })).toThrow(
      'Select exactly one option.',
    );
  });
});

describe('predict output', () => {
  it('ignores trailing whitespace and trailing newlines', () => {
    expect(grade('q-output', { format: 'predict-output', output: 'a b  \n\n' }).result).toBe(
      'correct',
    );
  });

  it('gives partial credit when only spacing or line breaks differ', () => {
    expect(grade('q-output', { format: 'predict-output', output: 'a\nb' })).toMatchObject({
      result: 'partial',
      note: 'Right output, but the spacing or line breaks differ.',
    });
  });

  it('marks other output and empty answers incorrect', () => {
    expect(grade('q-output', { format: 'predict-output', output: 'ab' }).result).toBe('incorrect');
    expect(grade('q-output', { format: 'predict-output', output: '   ' }).result).toBe('incorrect');
  });
});

describe('fill in the blank', () => {
  it('normalizes whitespace and grades each blank', () => {
    const all = grade('q-blank', {
      format: 'fill-in-blank',
      blanks: { first: ' number ', second: 'string' },
    });
    expect(all).toEqual({
      result: 'correct',
      revealed: {
        format: 'fill-in-blank',
        blanks: { first: 'number', second: 'string' },
        blankResults: { first: true, second: true },
      },
    });
    expect(
      grade('q-blank', { format: 'fill-in-blank', blanks: { first: 'number' } }),
    ).toMatchObject({
      result: 'partial',
      note: '1 of 2 blanks are correct.',
    });
    expect(
      grade('q-blank', { format: 'fill-in-blank', blanks: { first: 'Number', second: 'x' } })
        .result,
    ).toBe('incorrect');
  });

  it('rejects unknown blank ids', () => {
    expect(() => grade('q-blank', { format: 'fill-in-blank', blanks: { third: 'x' } })).toThrow(
      'Unknown blank',
    );
  });
});

it('rejects an answer in the wrong format', () => {
  expect(() => grade('q-mcq', { format: 'predict-output', output: 'a' })).toThrow(
    'This question expects a multiple-choice answer.',
  );
});
