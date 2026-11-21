import type { QuestionSource } from '@pracstack/content-model';
import { text, ts } from '../helpers';

export const typeofNarrowingQuestions: readonly QuestionSource[] = [
  {
    id: 'ts-narrowing-typeof-branch',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: text('Inside the `if` block, what is the type of `value`?'),
    code: ts(`function show(value: string | number) {
  if (typeof value === 'string') {
    // here
  }
}`),
    options: [
      { id: 'a', text: '`string`' },
      { id: 'b', text: '`number`' },
      { id: 'c', text: '`string | number`' },
      { id: 'd', text: '`unknown`' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['A `typeof` check narrows the union inside the branch.'],
    explanation: text(
      'The check `typeof value === "string"` narrows `string | number` to `string` inside the block.',
    ),
  },
  {
    id: 'ts-narrowing-typeof-number',
    version: 1,
    difficulty: 2,
    format: 'fill-in-blank',
    prompt: text('Complete the check so the function compiles.'),
    template: ts(`function double(x: number | string): number {
  if (typeof x === {{blank:kind}}) {
    return x * 2;
  }
  return Number(x) * 2;
}`),
    answer: { blanks: { kind: { accepted: ["'number'", '"number"'] } } },
    hints: ['`typeof` compares against a string such as `"string"` or `"boolean"`.'],
    explanation: text(
      'Comparing `typeof x` with the string `"number"` narrows `x` to `number`, so `x * 2` type-checks.',
    ),
  },
  {
    id: 'ts-narrowing-truthiness',
    version: 1,
    difficulty: 3,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: ts(`function describe(value: string | number | null): string {
  if (!value) return 'empty';
  return typeof value === 'number' ? 'number' : 'text';
}
console.log([describe(0), describe('a'), describe(null), describe(7)].join(','));`),
    answer: { output: 'empty,text,empty,number' },
    hints: ['Which values are falsy in JavaScript?'],
    explanation: text(
      '`0`, `""` and `null` are all falsy, so `describe(0)` returns `"empty"` even though `0` is a number. Truthiness checks can narrow away more than you intend.',
    ),
  },
  {
    id: 'ts-narrowing-typeof-null',
    version: 1,
    difficulty: 4,
    format: 'multiple-choice',
    prompt: text('Why does TypeScript report an error on `x.length`?'),
    code: ts(`function len(x: string[] | null): number {
  if (typeof x === 'object') {
    return x.length;
  }
  return 0;
}`),
    options: [
      { id: 'a', text: '`typeof null` is `"object"`, so `x` is still `string[] | null`' },
      { id: 'b', text: 'Arrays have `typeof` equal to `"array"`' },
      { id: 'c', text: '`length` does not exist on arrays' },
      { id: 'd', text: '`typeof` cannot be used with arrays' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['Try `typeof null` in a console.'],
    explanation: text(
      'Both arrays and `null` have `typeof` equal to `"object"`, so the check does not remove `null`. Use `x !== null` or `Array.isArray(x)` instead.',
    ),
  },
  {
    id: 'ts-narrowing-pad',
    version: 1,
    difficulty: 5,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: ts(`function pad(value: string | number): string {
  if (typeof value === 'number') {
    return value.toFixed(1);
  }
  return value.padStart(4, '*');
}
console.log(pad(3), pad('ab'), pad(2.25));`),
    answer: { output: '3.0 **ab 2.3' },
    hints: [
      'Numbers take the first branch; strings the second.',
      '`toFixed(1)` rounds to one decimal place.',
    ],
    explanation: text(
      'Numbers are formatted with one decimal place: `3` becomes `"3.0"` and `2.25` rounds to `"2.3"`. The string `"ab"` is padded on the left to length 4.',
    ),
  },
];
