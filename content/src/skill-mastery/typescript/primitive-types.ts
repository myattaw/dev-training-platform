import type { QuestionSource } from '@pracstack/content-model';
import { text, ts } from '../helpers';

export const primitiveTypesQuestions: readonly QuestionSource[] = [
  {
    id: 'ts-primitives-inferred-number',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: text('What type does TypeScript infer for `count`?'),
    code: ts('let count = 5;'),
    options: [
      { id: 'a', text: '`number`' },
      { id: 'b', text: '`Number`' },
      { id: 'c', text: '`int`' },
      { id: 'd', text: '`any`' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['TypeScript has a single primitive type for all numbers, written in lower case.'],
    explanation: text(
      'TypeScript infers `number` from the initial value. There is no separate integer type, and the capitalised `Number` is the wrapper object type, which you should almost never use.',
    ),
  },
  {
    id: 'ts-primitives-boolean-annotation',
    version: 1,
    difficulty: 2,
    format: 'fill-in-blank',
    prompt: text('Complete the type annotation.'),
    template: ts('let isDone: {{blank:type}} = false;'),
    answer: { blanks: { type: { accepted: ['boolean'] } } },
    hints: ['`true` and `false` belong to this primitive type.'],
    explanation: text('`false` is a `boolean`. Primitive type names are written in lower case.'),
  },
  {
    id: 'ts-primitives-typeof-values',
    version: 1,
    difficulty: 3,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: ts(`const kinds = [typeof 42, typeof 'hi', typeof true, typeof undefined];
console.log(kinds.join(' '));`),
    answer: { output: 'number string boolean undefined' },
    hints: ['At runtime, `typeof` returns a string naming the JavaScript type.'],
    explanation: text(
      'The runtime `typeof` operator returns `"number"`, `"string"`, `"boolean"` and `"undefined"` for these values.',
    ),
  },
  {
    id: 'ts-primitives-strict-assignments',
    version: 1,
    difficulty: 4,
    format: 'multiple-choice',
    prompt: text('With `strict` mode enabled, which declarations compile? Select all that apply.'),
    options: [
      { id: 'a', text: '`let n: number = null;`' },
      { id: 'b', text: '`let u: undefined = undefined;`' },
      { id: 'c', text: '`let s: string = String(1);`' },
      { id: 'd', text: "`let b: boolean = 'true';`" },
    ],
    selection: 'multiple',
    answer: { correct: ['b', 'c'] },
    // The compiler confirms exactly b and c compile.
    typeCheck: { kind: 'options-compile' },
    hints: [
      'Under `strictNullChecks`, `null` is its own type.',
      '`String(value)` always returns a string.',
    ],
    explanation: text(
      '`null` is not assignable to `number` under `strictNullChecks`, and the string `"true"` is not a `boolean`. `undefined` is a valid value of type `undefined`, and `String(1)` returns a `string`.',
    ),
  },
  {
    id: 'ts-primitives-floating-point',
    version: 1,
    difficulty: 5,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: ts(`const sum = 0.1 + 0.2;
console.log(sum === 0.3, sum.toFixed(2) === '0.30');`),
    answer: { output: 'false true' },
    hints: ['`number` is a 64-bit floating-point value.'],
    explanation: text(
      '`0.1 + 0.2` is `0.30000000000000004` in binary floating point, so it is not exactly `0.3`. Rounding with `toFixed(2)` gives the string `"0.30"`.',
    ),
  },
];
