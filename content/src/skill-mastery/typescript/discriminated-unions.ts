import type { QuestionSource } from '@pracstack/content-model';
import { text, ts } from '../helpers';

export const discriminatedUnionsQuestions: readonly QuestionSource[] = [
  {
    id: 'ts-discriminated-literal-tag',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: text('What is the type of the `kind` property in this object type?'),
    code: ts("type Circle = { kind: 'circle'; radius: number };"),
    options: [
      { id: 'a', text: "The literal type `'circle'`" },
      { id: 'b', text: '`string`' },
      { id: 'c', text: '`any`' },
      { id: 'd', text: '`Circle`' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['In a type annotation, a string in quotes is a literal type.'],
    explanation: text(
      '`kind: "circle"` declares a property whose only allowed value is the string `"circle"`.',
    ),
  },
  {
    id: 'ts-discriminated-definition',
    version: 1,
    difficulty: 2,
    format: 'multiple-choice',
    prompt: text('What makes `Result` a discriminated union?'),
    code: ts(`type Result =
  | { ok: true; value: number }
  | { ok: false; error: string };`),
    options: [
      { id: 'a', text: 'Every member has a shared property (`ok`) with a different literal type' },
      { id: 'b', text: 'Both members are object types' },
      { id: 'c', text: 'It uses the `|` operator' },
      { id: 'd', text: 'The members have different numbers of properties' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['Think about how TypeScript can tell the members apart.'],
    explanation: text(
      'The shared `ok` property has a distinct literal type in each member, so checking it tells TypeScript exactly which member you have.',
    ),
  },
  {
    id: 'ts-discriminated-switch-tag',
    version: 1,
    difficulty: 3,
    format: 'fill-in-blank',
    prompt: text('Complete the `switch` so each branch can use the right properties.'),
    template: ts(`type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number };

function area(shape: Shape): number {
  switch (shape.{{blank:tag}}) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.side ** 2;
  }
}`),
    answer: { blanks: { tag: { accepted: ['kind'] } } },
    hints: ['Switch on the property whose type differs between the members.'],
    explanation: text(
      'Switching on the discriminant `kind` narrows `shape` in each `case`, so `radius` and `side` are available where they exist.',
    ),
  },
  {
    id: 'ts-discriminated-describe-events',
    version: 1,
    difficulty: 4,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: ts(`type UiEvent =
  | { type: 'click'; x: number; y: number }
  | { type: 'key'; key: string };

function describe(e: UiEvent): string {
  switch (e.type) {
    case 'click':
      return \`click@\${e.x},\${e.y}\`;
    case 'key':
      return \`key:\${e.key}\`;
  }
}

const events: UiEvent[] = [
  { type: 'key', key: 'A' },
  { type: 'click', x: 1, y: 2 },
];
console.log(events.map(describe).join(' | '));`),
    answer: { output: 'key:A | click@1,2' },
    hints: ['Each event is described by its own `case`.'],
    explanation: text(
      'The key event prints `key:A` and the click event prints `click@1,2`, joined with `" | "`.',
    ),
  },
  {
    id: 'ts-discriminated-exhaustive-never',
    version: 1,
    difficulty: 5,
    format: 'multiple-choice',
    prompt: text('What does TypeScript report for this function?'),
    code: ts(`type Status = 'idle' | 'loading' | 'done';

function label(s: Status): string {
  switch (s) {
    case 'idle':
      return 'Idle';
    case 'loading':
      return 'Loading';
    default: {
      const unreachable: never = s;
      return unreachable;
    }
  }
}`),
    options: [
      { id: 'a', text: "An error: type `'done'` is not assignable to type `never`" },
      { id: 'b', text: 'No error' },
      { id: 'c', text: 'An error: `s` is possibly `undefined`' },
      { id: 'd', text: 'An error: the function lacks a return statement' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['Which value of `Status` can reach the `default` branch?'],
    explanation: text(
      'The `"done"` case is missing, so `s` has type `"done"` in the `default` branch, and `"done"` is not assignable to `never`. This is the exhaustiveness-check pattern: the error points you at the unhandled case.',
    ),
  },
];
