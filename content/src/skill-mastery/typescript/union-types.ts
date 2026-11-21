import type { QuestionSource } from '@pracstack/content-model';
import { text, ts } from '../helpers';

export const unionTypesQuestions: readonly QuestionSource[] = [
  {
    id: 'ts-unions-assignable-values',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: text('Which value can not be assigned to `id`?'),
    code: ts('let id: string | number;'),
    options: [
      { id: 'a', text: '`42`' },
      { id: 'b', text: "`'abc'`" },
      { id: 'c', text: '`true`' },
      { id: 'd', text: '`-1`' },
    ],
    selection: 'single',
    answer: { correct: ['c'] },
    hints: ['A union accepts a value of any one of its member types.'],
    explanation: text(
      '`string | number` accepts strings and numbers. `true` is a `boolean`, which is not in the union.',
    ),
  },
  {
    id: 'ts-unions-operator',
    version: 1,
    difficulty: 2,
    format: 'fill-in-blank',
    prompt: text('Complete the parameter type so `format` accepts a string or a number.'),
    template: ts(`function format(value: string {{blank:op}} number): string {
  return String(value);
}`),
    answer: { blanks: { op: { accepted: ['|'] } } },
    hints: ['Union types combine member types with a single symbol.'],
    explanation: text('`string | number` is a union type: the value may be either type.'),
  },
  {
    id: 'ts-unions-literal-types',
    version: 1,
    difficulty: 3,
    format: 'multiple-choice',
    prompt: text('Which assignment compiles?'),
    code: ts("type Size = 'sm' | 'md' | 'lg';"),
    options: [
      { id: 'a', text: "`const s: Size = 'md';`" },
      { id: 'b', text: "`const s: Size = 'medium';`" },
      { id: 'c', text: "`const s: Size = 'MD';`" },
      { id: 'd', text: "`const s: Size = '';`" },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['A string literal type matches exactly one string, including its case.'],
    explanation: text(
      '`Size` is a union of three string literal types. Only those exact strings are allowed, so `"md"` compiles and `"medium"`, `"MD"` and `""` do not.',
    ),
  },
  {
    id: 'ts-unions-record-counts',
    version: 1,
    difficulty: 4,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: ts(`type Shape = 'circle' | 'square';

const shapes: Shape[] = ['circle', 'square', 'circle'];
const counts = shapes.reduce<Record<Shape, number>>(
  (acc, shape) => ({ ...acc, [shape]: acc[shape] + 1 }),
  { circle: 0, square: 0 },
);
console.log(JSON.stringify(counts));`),
    answer: { output: '{"circle":2,"square":1}' },
    hints: ['`reduce` starts from `{ circle: 0, square: 0 }` and adds one per element.'],
    explanation: text(
      'Each element increments its own key. "circle" appears twice and "square" once. `JSON.stringify` keeps the key order of the initial object.',
    ),
  },
  {
    id: 'ts-unions-widening',
    version: 1,
    difficulty: 5,
    format: 'multiple-choice',
    prompt: text('What is the type of `config.mode`?'),
    code: ts("const config = { mode: 'dark' };"),
    options: [
      { id: 'a', text: '`string`' },
      { id: 'b', text: "`'dark'`" },
      { id: 'c', text: "`'dark' | 'light'`" },
      { id: 'd', text: '`any`' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['Object properties are mutable, so TypeScript widens their literal types.'],
    explanation: text(
      'Because `config.mode` could be reassigned, TypeScript widens the literal `"dark"` to `string`. Writing `{ mode: "dark" } as const` would keep the literal type `"dark"`.',
    ),
  },
];
