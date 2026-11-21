import type { QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, type FamilyQuestion } from '../family';
import { text, ts } from '../helpers';

/**
 * TypeScript question families. Every variant is checked by the compiler at
 * build time (content/src/checks/typescript-snippets.ts):
 *
 * - predict-output: compiled (strict) and run; the output must match;
 * - fill-in-blank: compiled with every accepted answer;
 * - "what type is this?": the right option must be exactly the inferred type;
 * - "does this compile?" / "which compile?": the key must match the compiler.
 */

// ---------------------------------------------------------------- family builders

interface OutputVariant {
  readonly key: string;
  readonly code: string;
  readonly output: string;
  readonly why: string;
}

/** "What does this program print?" — compiled and executed at build time. */
const outputFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hints: readonly string[],
  variants: readonly OutputVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'predict-output',
    prompt: text('What does this program print?'),
    code: ts(v.code),
    answer: { output: v.output },
    hints: [...hints],
    explanation: text(v.why),
  }));

interface TypeVariant {
  readonly key: string;
  /** Declarations shown to the learner. */
  readonly code: string;
  /** The expression whose type is asked for, e.g. a variable name. */
  readonly expression: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

/** "What type does TypeScript infer?" — the key is checked for exact type identity. */
const typeFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly TypeVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text(`What type does TypeScript infer for \`${v.expression}\`?`),
    code: ts(v.code),
    ...choice(
      `${id}-${v.key}`,
      `\`${v.correct}\``,
      v.wrong.map((w) => `\`${w}\``),
    ),
    typeCheck: { kind: 'type-equals', prelude: v.code, expression: v.expression },
    hints: [hint],
    explanation: text(v.why),
  }));

interface CompilesVariant {
  readonly key: string;
  readonly code: string;
  readonly compiles: boolean;
  readonly why: string;
}

/** "Does this compile with strict mode?" — the key is checked by compiling the code. */
const compilesFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly CompilesVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text('Does this code compile with `strict` enabled?'),
    code: ts(v.code),
    options: [
      { id: 'a', text: 'Yes, it compiles' },
      { id: 'b', text: 'No, it is a type error' },
    ],
    selection: 'single',
    answer: { correct: [v.compiles ? 'a' : 'b'] },
    typeCheck: { kind: 'compiles' },
    hints: [hint],
    explanation: text(v.why),
  }));

interface WhichCompileVariant {
  readonly key: string;
  readonly question: string;
  /** Declarations every option can use. Shown to the learner when set. */
  readonly prelude?: string;
  readonly options: readonly string[];
  /** The options (by text) that compile. */
  readonly correct: readonly string[];
  readonly why: string;
}

/** "Which of these compile?" — the key is checked by compiling every option. */
const whichCompileFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly WhichCompileVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const options = v.options.map((o, i) => ({ id: ids[i] ?? `o${i}`, text: `\`${o}\`` }));
    return {
      difficulty,
      format: 'multiple-choice',
      prompt: text(`${v.question} Select all that apply.`),
      ...(v.prelude ? { code: ts(v.prelude) } : {}),
      options,
      selection: 'multiple',
      answer: {
        correct: options.filter((_, i) => v.correct.includes(v.options[i] ?? '')).map((o) => o.id),
      },
      typeCheck: { kind: 'options-compile', ...(v.prelude ? { prelude: v.prelude } : {}) },
      hints: [hint],
      explanation: text(v.why),
    };
  });

interface BlankVariant {
  readonly key: string;
  readonly prompt: string;
  /** Code with `{{blank:id}}` placeholders. */
  readonly template: string;
  readonly blanks: Record<string, readonly string[]>;
  readonly why: string;
}

/** Fill in the blank — compiled with every accepted answer. */
const blankFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly BlankVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'fill-in-blank',
    prompt: text(v.prompt),
    template: ts(v.template),
    answer: {
      blanks: Object.fromEntries(
        Object.entries(v.blanks).map(([k, accepted]) => [k, { accepted: [...accepted] }]),
      ),
    },
    hints: [hint],
    explanation: text(v.why),
  }));

// ---------------------------------------------------------------- Primitive types

export const primitiveFamilies: readonly QuestionSource[] = [
  ...typeFamily(
    'ts-inferred-primitive',
    1,
    'A variable declared with `let` can be reassigned, so TypeScript infers the general primitive type.',
    [
      {
        key: 'string',
        code: "let city = 'Oslo';",
        expression: 'city',
        correct: 'string',
        wrong: ["'Oslo'", 'String', 'any'],
        why: '`let` variables get the widened primitive type, `string`. The capitalised `String` is the wrapper object type.',
      },
      {
        key: 'float',
        code: 'let price = 9.99;',
        expression: 'price',
        correct: 'number',
        wrong: ['float', 'Number', '9.99'],
        why: 'All numbers, integer or not, have type `number`.',
      },
      {
        key: 'boolean',
        code: 'let done = false;',
        expression: 'done',
        correct: 'boolean',
        wrong: ['false', 'Boolean', 'any'],
        why: 'A `let` initialised with `false` can later hold `true`, so its type is `boolean`.',
      },
    ],
  ),
  ...typeFamily(
    'ts-const-literal-type',
    2,
    'A `const` can never be reassigned, so TypeScript keeps the exact value as the type.',
    [
      {
        key: 'string',
        code: "const city = 'Oslo';",
        expression: 'city',
        correct: "'Oslo'",
        wrong: ['string', 'String', 'const'],
        why: 'A `const` primitive gets a literal type: here the type is exactly `"Oslo"`.',
      },
      {
        key: 'number',
        code: 'const answer = 42;',
        expression: 'answer',
        correct: '42',
        wrong: ['number', 'Number', 'const number'],
        why: 'A `const` number gets the literal type `42`.',
      },
      {
        key: 'boolean',
        code: 'const ready = true;',
        expression: 'ready',
        correct: 'true',
        wrong: ['boolean', 'Boolean', 'any'],
        why: 'A `const` boolean gets the literal type `true`.',
      },
    ],
  ),
  ...blankFamily('ts-primitive-annotation', 2, 'Primitive type names are lower case.', [
    {
      key: 'number',
      prompt: 'Complete the type annotation.',
      template: 'let attempts: {{blank:type}} = 0;',
      blanks: { type: ['number'] },
      why: '`0` is a `number`.',
    },
    {
      key: 'string',
      prompt: 'Complete the type annotation.',
      template: "let greeting: {{blank:type}} = 'hello';",
      blanks: { type: ['string'] },
      why: "`'hello'` is a `string`.",
    },
    {
      key: 'array',
      prompt: 'Complete the type annotation for an array of numbers.',
      template: 'let scores: {{blank:type}} = [90, 85];',
      blanks: { type: ['number[]', 'Array<number>'] },
      why: 'An array of numbers is `number[]`, or equivalently `Array<number>`.',
    },
  ]),
  ...outputFamily(
    'ts-runtime-typeof',
    3,
    ['`typeof` at runtime returns one of a few strings, and has some historic quirks.'],
    [
      {
        key: 'null',
        code: "const values: unknown[] = [null, [1, 2]];\nconsole.log(values.map((v) => typeof v).join(' '));",
        output: 'object object',
        why: '`typeof null` is `"object"` (a historic bug kept for compatibility), and arrays are objects too.',
      },
      {
        key: 'function',
        code: "const values: unknown[] = [() => 1, 10n, Symbol()];\nconsole.log(values.map((v) => typeof v).join(' '));",
        output: 'function bigint symbol',
        why: 'Functions report `"function"`; `10n` is a `bigint` and `Symbol()` a `symbol`.',
      },
      {
        key: 'nan',
        code: "const values: unknown[] = [NaN, undefined, ''];\nconsole.log(values.map((v) => typeof v).join(' '));",
        output: 'number undefined string',
        why: '`NaN` ("not a number") is still of type `number`; the empty string is a `string`.',
      },
    ],
  ),
  ...whichCompileFamily(
    'ts-strict-null-checks',
    4,
    'With `strictNullChecks`, `null` and `undefined` are only assignable to types that include them.',
    [
      {
        key: 'optional',
        question: 'With `strict` enabled, which declarations compile?',
        options: [
          'let a: string | null = null;',
          'let b: string = undefined;',
          'let c: number | undefined;',
          'let d: boolean = null;',
        ],
        correct: ['let a: string | null = null;', 'let c: number | undefined;'],
        why: 'Only types that explicitly include `null` or `undefined` accept them. `let c: number | undefined;` starts as `undefined`, which its type allows.',
      },
      {
        key: 'non-null',
        question: 'With `strict` enabled, which statements compile?',
        prelude: 'declare const maybe: string | undefined;',
        options: [
          'const a: string = maybe;',
          "const b: string = maybe ?? 'none';",
          'const c: string = maybe!;',
          'const d: number = maybe?.length;',
        ],
        correct: ["const b: string = maybe ?? 'none';", 'const c: string = maybe!;'],
        why: '`??` supplies a fallback, and `!` asserts (unsafely) that the value is defined. `maybe?.length` is `number | undefined`, not `number`.',
      },
    ],
  ),
  ...outputFamily(
    'ts-number-quirks',
    4,
    [
      '`number` is a 64-bit floating-point value, and conversions from text have rules of their own.',
    ],
    [
      {
        key: 'parse',
        code: "console.log(Number('12px'), parseInt('12px', 10), Number(''));",
        output: 'NaN 12 0',
        why: '`Number` rejects the whole string if any part is not numeric, giving `NaN`; `parseInt` reads digits until the first non-digit; the empty string converts to `0`.',
      },
      {
        key: 'nan',
        code: 'const x = Number.NaN;\nconsole.log(x === x, Number.isNaN(x));',
        output: 'false true',
        why: '`NaN` is the only value not equal to itself. Use `Number.isNaN` to test for it.',
      },
      {
        key: 'precision',
        code: 'console.log(0.1 * 3 === 0.3, Math.abs(0.1 * 3 - 0.3) < Number.EPSILON);',
        output: 'false true',
        why: '`0.1 * 3` is `0.30000000000000004`. Compare floating-point numbers with a tolerance such as `Number.EPSILON`.',
      },
    ],
  ),
  ...typeFamily(
    'ts-widening-arrays',
    5,
    'Array literals are widened to an array of the union of their element types, unless you write `as const`.',
    [
      {
        key: 'mixed',
        code: "const mixed = [1, 'two', 3];",
        expression: 'mixed',
        correct: '(string | number)[]',
        wrong: ['[number, string, number]', 'any[]', "(1 | 'two' | 3)[]"],
        why: 'Even with `const`, the array itself can be changed, so TypeScript infers `(string | number)[]`, not a tuple.',
      },
      {
        key: 'as-const',
        code: "const pair = [1, 'two'] as const;",
        expression: 'pair',
        correct: "readonly [1, 'two']",
        wrong: ['(string | number)[]', "[1, 'two']", 'readonly (string | number)[]'],
        why: '`as const` makes the array a readonly tuple of literal types.',
      },
      {
        key: 'object',
        code: "const point = { x: 1, label: 'a' };",
        expression: 'point',
        correct: '{ x: number; label: string }',
        wrong: ["{ x: 1; label: 'a' }", '{ readonly x: 1; readonly label: "a" }', 'object'],
        why: 'Object properties can be reassigned, so their types are widened to `number` and `string`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Union types

export const unionFamilies: readonly QuestionSource[] = [
  ...whichCompileFamily(
    'ts-union-assignable',
    1,
    'A value of a union type can be any one of its member types.',
    [
      {
        key: 'string-number',
        question: 'Which declarations compile?',
        prelude: 'type Id = string | number;',
        options: [
          'const a: Id = 7;',
          "const b: Id = 'x7';",
          'const c: Id = true;',
          'const d: Id = [7];',
        ],
        correct: ['const a: Id = 7;', "const b: Id = 'x7';"],
        why: '`Id` accepts strings and numbers only.',
      },
      {
        key: 'literals',
        question: 'Which declarations compile?',
        prelude: "type Size = 'small' | 'medium' | 'large';",
        options: [
          "const a: Size = 'small';",
          "const b: Size = 'Small';",
          "const c: Size = 'large';",
          "const d: Size = 'xl';",
        ],
        correct: ["const a: Size = 'small';", "const c: Size = 'large';"],
        why: 'A union of string literals accepts exactly those strings, with the same case.',
      },
    ],
  ),
  ...blankFamily('ts-union-syntax', 2, 'Union members are separated by a vertical bar.', [
    {
      key: 'id',
      prompt: 'Complete the type so `id` can hold a string or a number.',
      template: 'let id: string {{blank:op}} number = 5;',
      blanks: { op: ['|'] },
      why: '`string | number` is the union of the two types.',
    },
    {
      key: 'status',
      prompt: 'Complete the type so `status` can only be `"on"` or `"off"`.',
      template: "let status: 'on' {{blank:op}} 'off' = 'on';",
      blanks: { op: ['|'] },
      why: 'A union of literal types restricts a value to those exact strings.',
    },
  ]),
  ...compilesFamily(
    'ts-union-member-access',
    3,
    'On a union, you can only use what every member has, until you narrow it.',
    [
      {
        key: 'to-upper',
        code: 'function shout(value: string | number) {\n  return value.toUpperCase();\n}',
        compiles: false,
        why: '`toUpperCase` exists on `string` but not on `number`, so it is not available on `string | number` without narrowing.',
      },
      {
        key: 'length',
        code: 'function size(value: string | string[]) {\n  return value.length;\n}',
        compiles: true,
        why: 'Both `string` and `string[]` have a `length` property, so it can be used on the union.',
      },
      {
        key: 'to-string',
        code: 'function show(value: number | boolean) {\n  return value.toString();\n}',
        compiles: true,
        why: 'Both `number` and `boolean` have `toString()`.',
      },
      {
        key: 'plus',
        code: 'function next(value: string | number) {\n  return value + 1;\n}',
        compiles: false,
        why: '`+` with a union operand is not allowed: TypeScript cannot know whether it means addition or concatenation.',
      },
    ],
  ),
  ...outputFamily(
    'ts-literal-union-values',
    4,
    ['Literal union types exist only at compile time; at runtime the values are ordinary strings.'],
    [
      {
        key: 'filter',
        code: "type Dir = 'up' | 'down';\nconst moves: Dir[] = ['up', 'down', 'up', 'up'];\nconsole.log(moves.filter((m) => m === 'up').length);",
        output: '3',
        why: 'Three of the four moves are `"up"`.',
      },
      {
        key: 'record',
        code: "type Light = 'red' | 'green';\nconst next: Record<Light, Light> = { red: 'green', green: 'red' };\nconsole.log(next[next['red']]);",
        output: 'red',
        why: '`next.red` is `"green"`, and `next.green` is `"red"`.',
      },
    ],
  ),
  ...typeFamily(
    'ts-union-inference',
    5,
    'TypeScript combines the possible types of an expression into a union.',
    [
      {
        key: 'ternary',
        code: "declare const flag: boolean;\nconst value = flag ? 1 : 'one';",
        expression: 'value',
        correct: "1 | 'one'",
        wrong: ['string | number', 'number', 'any'],
        why: 'Each branch of the conditional keeps its literal type (the variable is `const`), so the result is `1 | "one"`.',
      },
      {
        key: 'find',
        code: 'const found = [1, 2, 3].find((n) => n > 1);',
        expression: 'found',
        correct: 'number | undefined',
        wrong: ['number', 'number[]', 'undefined'],
        why: '`find` returns `undefined` when nothing matches, so its result type includes `undefined`.',
      },
      {
        key: 'filter-null',
        code: 'const present = [1, null, 2].filter((n) => n !== null);',
        expression: 'present',
        correct: 'number[]',
        wrong: ['(number | null)[]', 'number', 'null[]'],
        why: 'Since TypeScript 5.5, a callback like `(n) => n !== null` is inferred as a type predicate, so `filter` removes `null` from the element type.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- typeof narrowing

export const narrowingFamilies: readonly QuestionSource[] = [
  ...choiceFamilyFor(
    'ts-narrowing-basics',
    1,
    'Narrowing means TypeScript knows a more specific type inside a check.',
    [
      {
        key: 'what',
        question:
          "Inside `if (typeof x === 'string') { … }`, where `x: string | number`, what is the type of `x`?",
        correct: '`string`',
        wrong: ['`string | number`', '`number`', '`unknown`'],
        why: 'The `typeof` check narrows the union to `string` inside the `if`.',
      },
      {
        key: 'else',
        question:
          "In the `else` branch of `if (typeof x === 'string')`, where `x: string | number`, what is the type of `x`?",
        correct: '`number`',
        wrong: ['`string | number`', '`string`', '`never`'],
        why: 'Whatever is not a string must be the other member of the union: `number`.',
      },
    ],
  ),
  ...outputFamily(
    'ts-typeof-branches',
    2,
    ['Each branch runs with the value narrowed to one member of the union.'],
    [
      {
        key: 'length-or-double',
        code: "function measure(x: string | number) {\n  return typeof x === 'string' ? x.length : x * 2;\n}\nconsole.log(measure('abc'), measure(4));",
        output: '3 8',
        why: '`"abc"` has length 3; `4 * 2` is 8.',
      },
      {
        key: 'format',
        code: "function format(x: number | boolean) {\n  if (typeof x === 'boolean') return x ? 'yes' : 'no';\n  return x.toFixed(1);\n}\nconsole.log(format(true), format(2));",
        output: 'yes 2.0',
        why: '`true` takes the boolean branch; `2` is formatted with one decimal.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-narrowing-flow',
    3,
    'TypeScript follows `return` and `throw`: after them, the narrowed-away types are gone.',
    [
      {
        key: 'early-return',
        code: "function fixed(x: string | number) {\n  if (typeof x === 'string') return x;\n  return x.toFixed(2);\n}",
        compiles: true,
        why: 'After the early return, `x` can only be a `number`.',
      },
      {
        key: 'no-narrowing',
        code: "function fixed(x: string | number) {\n  if (typeof x === 'string') console.log(x);\n  return x.toFixed(2);\n}",
        compiles: false,
        why: 'The `if` does not return, so after it `x` can still be a `string`, which has no `toFixed`.',
      },
      {
        key: 'throw',
        code: "function count(x: string[] | undefined) {\n  if (x === undefined) throw new Error('missing');\n  return x.length;\n}",
        compiles: true,
        why: 'After the `throw`, `x` can no longer be `undefined`.',
      },
    ],
  ),
  ...outputFamily(
    'ts-other-narrowing',
    4,
    ['Besides `typeof`, `Array.isArray`, `in` and truthiness checks also narrow.'],
    [
      {
        key: 'is-array',
        code: 'function total(x: number | number[]) {\n  return Array.isArray(x) ? x.reduce((a, b) => a + b, 0) : x;\n}\nconsole.log(total([1, 2, 3]), total(5));',
        output: '6 5',
        why: '`Array.isArray` narrows to `number[]`, which is summed; a single number is returned as is.',
      },
      {
        key: 'in',
        code: "type Cat = { meow(): string };\ntype Dog = { bark(): string };\nfunction speak(pet: Cat | Dog) {\n  return 'meow' in pet ? pet.meow() : pet.bark();\n}\nconsole.log(speak({ bark: () => 'woof' }));",
        output: 'woof',
        why: 'The object has no `meow` property, so `in` narrows it to `Dog`.',
      },
      {
        key: 'truthy-zero',
        code: "function label(n: number | undefined) {\n  return n ? `n=${n}` : 'none';\n}\nconsole.log(label(0), label(3));",
        output: 'none n=3',
        why: '`0` is falsy, so a truthiness check treats it like `undefined`. Use `n !== undefined` to keep zero.',
      },
    ],
  ),
  ...compilesFamily('ts-narrowing-pitfalls', 5, 'Some checks narrow less than they seem to.', [
    {
      key: 'typeof-object-null',
      code: "function keys(x: object | null | string) {\n  if (typeof x === 'object') return Object.keys(x);\n  return [];\n}",
      compiles: false,
      why: '`typeof null` is `"object"`, so inside the `if`, `x` is `object | null`, and `Object.keys(null)` is not allowed.',
    },
    {
      key: 'truthy-object',
      code: "function keys(x: object | null | string) {\n  if (x && typeof x === 'object') return Object.keys(x);\n  return [];\n}",
      compiles: true,
      why: 'The truthiness check removes `null` first, so `x` is `object` inside the `if`.',
    },
    {
      key: 'callback',
      code: 'function later(x: string | undefined) {\n  if (x !== undefined) {\n    return [1, 2].map(() => x.length);\n  }\n  return [];\n}',
      compiles: true,
      why: '`x` is a parameter that is never reassigned, so TypeScript keeps the narrowing inside the callback.',
    },
  ]),
];

// ---------------------------------------------------------------- Discriminated unions

export const discriminatedFamilies: readonly QuestionSource[] = [
  ...choiceFamilyFor(
    'ts-discriminated-basics',
    1,
    'A discriminated union is a union of object types that share a literal "tag" property.',
    [
      {
        key: 'tag',
        question:
          "In `type Shape = { kind: 'circle'; r: number } | { kind: 'square'; size: number }`, which property is the discriminant?",
        correct: '`kind`',
        wrong: ['`r`', '`size`', 'There is none'],
        why: 'Every member has `kind`, with a different literal value, so checking it tells the members apart.',
      },
      {
        key: 'why',
        question:
          'Why give every member of a union a `kind` property with a different literal value?',
        correct: 'So that checking `kind` narrows the value to one member',
        wrong: [
          'It is required by JavaScript',
          'It makes objects smaller',
          'TypeScript cannot compile unions without it',
        ],
        why: 'The tag lets `if` and `switch` statements narrow the union safely.',
      },
    ],
  ),
  ...blankFamily(
    'ts-discriminant-switch',
    2,
    'Switch on the property every member of the union has, with a different literal value in each.',
    [
      {
        key: 'shape',
        prompt: 'Complete the `switch` so each case narrows the shape.',
        template:
          "type Shape = { kind: 'circle'; r: number } | { kind: 'square'; size: number };\nfunction area(s: Shape): number {\n  switch (s.{{blank:tag}}) {\n    case 'circle':\n      return Math.PI * s.r ** 2;\n    case 'square':\n      return s.size ** 2;\n  }\n}",
        blanks: { tag: ['kind'] },
        why: '`kind` is the discriminant: checking it narrows `s` to one member in each case.',
      },
      {
        key: 'result',
        prompt: 'Complete the check so the success branch can read `value`.',
        template:
          'type Result = { ok: true; value: number } | { ok: false; error: string };\nfunction show(r: Result): string {\n  if (r.{{blank:tag}}) return String(r.value);\n  return r.error;\n}',
        blanks: { tag: ['ok'] },
        why: '`ok` is `true` in one member and `false` in the other, so testing it narrows `r`.',
      },
    ],
  ),
  ...outputFamily(
    'ts-discriminated-results',
    3,
    ['Follow which member each value is, by its tag.'],
    [
      {
        key: 'areas',
        code: "type Shape = { kind: 'rect'; w: number; h: number } | { kind: 'square'; size: number };\nconst area = (s: Shape) => (s.kind === 'rect' ? s.w * s.h : s.size ** 2);\nconsole.log([{ kind: 'rect', w: 2, h: 3 }, { kind: 'square', size: 4 }].map((s) => area(s as Shape)).join(','));",
        output: '6,16',
        why: 'The rectangle is 2 × 3 = 6; the square is 4² = 16.',
      },
      {
        key: 'events',
        code: "type Event = { type: 'add'; n: number } | { type: 'reset' };\nlet total = 10;\nconst events: Event[] = [{ type: 'add', n: 5 }, { type: 'reset' }, { type: 'add', n: 2 }];\nfor (const e of events) total = e.type === 'add' ? total + e.n : 0;\nconsole.log(total);",
        output: '2',
        why: '10 + 5 = 15, then reset to 0, then + 2.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-exhaustive-never',
    4,
    'Assigning to `never` only compiles when every case has been handled.',
    [
      {
        key: 'missing-case',
        code: "type Shape = { kind: 'circle' } | { kind: 'square' } | { kind: 'triangle' };\nfunction name(s: Shape): string {\n  switch (s.kind) {\n    case 'circle':\n      return 'circle';\n    case 'square':\n      return 'square';\n    default: {\n      const unreachable: never = s;\n      return unreachable;\n    }\n  }\n}",
        compiles: false,
        why: "`'triangle'` is not handled, so in `default` the shape can still be a triangle, which is not assignable to `never`.",
      },
      {
        key: 'all-cases',
        code: "type Shape = { kind: 'circle' } | { kind: 'square' };\nfunction name(s: Shape): string {\n  switch (s.kind) {\n    case 'circle':\n      return 'circle';\n    case 'square':\n      return 'square';\n    default: {\n      const unreachable: never = s;\n      return unreachable;\n    }\n  }\n}",
        compiles: true,
        why: 'Both cases are handled, so in `default` nothing is left: `s` is `never`.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-discriminant-pitfalls',
    5,
    'Narrowing works through the discriminant property of the same object.',
    [
      {
        key: 'destructured',
        code: 'type Result = { ok: true; value: number } | { ok: false; error: string };\nfunction read(r: Result) {\n  const { ok } = r;\n  if (ok) return r.value;\n  return 0;\n}',
        compiles: true,
        why: 'TypeScript narrows through a destructured discriminant when it is a `const`, as here.',
      },
      {
        key: 'non-literal',
        code: "type A = { kind: string; a: number };\ntype B = { kind: 'b'; b: number };\nfunction read(x: A | B) {\n  if (x.kind === 'b') return x.b;\n  return 0;\n}",
        compiles: false,
        why: '`A`\'s `kind` is any `string`, which also includes `"b"`, so the check cannot rule out `A`. Discriminants need distinct literal types.',
      },
      {
        key: 'unnarrowed-access',
        code: "type Shape = { kind: 'circle'; r: number } | { kind: 'square'; size: number };\nfunction radius(s: Shape) {\n  return s.r;\n}",
        compiles: false,
        why: '`r` only exists on circles. Until `s.kind` is checked, `s` could be a square, so `s.r` is not allowed.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Object types (new skill)

export const objectTypeFamilies: readonly QuestionSource[] = [
  ...choiceFamilyFor(
    'ts-object-type-basics',
    1,
    'Interfaces and type aliases both describe the shape of an object.',
    [
      {
        key: 'interface',
        question: 'What does `interface User { name: string }` declare?',
        correct: 'A type: objects with a `name` property of type `string`',
        wrong: [
          'A class you can create with `new User()`',
          'A value named `User`',
          'A JavaScript object at runtime',
        ],
        why: 'Interfaces only exist at compile time. They describe object shapes and produce no JavaScript.',
      },
      {
        key: 'optional',
        question: 'In `type Options = { verbose?: boolean }`, what does the `?` mean?',
        correct: 'The property may be missing',
        wrong: [
          'The property may be `null`',
          'The property is read-only',
          'The value is checked at runtime',
        ],
        why: 'An optional property may be left out; its type becomes `boolean | undefined`.',
      },
    ],
  ),
  ...whichCompileFamily(
    'ts-object-assignability',
    2,
    'An object must have every required property, with the right types.',
    [
      {
        key: 'required',
        question: 'Which declarations compile?',
        prelude: 'interface Point { x: number; y: number; label?: string }',
        options: [
          'const a: Point = { x: 1, y: 2 };',
          'const b: Point = { x: 1 };',
          "const c: Point = { x: 1, y: 2, label: 'p' };",
          "const d: Point = { x: '1', y: 2 };",
        ],
        correct: [
          'const a: Point = { x: 1, y: 2 };',
          "const c: Point = { x: 1, y: 2, label: 'p' };",
        ],
        why: '`label` is optional; `x` and `y` are required numbers.',
      },
      {
        key: 'excess',
        question: 'Which declarations compile?',
        prelude: "type User = { name: string };\nconst extra = { name: 'Ada', admin: true };",
        options: [
          "const a: User = { name: 'Ada', admin: true };",
          'const b: User = extra;',
          "const c: User = { name: 'Ada' };",
          'const d: User = {};',
        ],
        correct: ['const b: User = extra;', "const c: User = { name: 'Ada' };"],
        why: 'Object literals are checked for unknown properties (excess property checking), but an existing variable with extra properties is still assignable.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-readonly-properties',
    3,
    '`readonly` prevents assignment through that type.',
    [
      {
        key: 'assign',
        code: 'interface Config { readonly port: number }\nconst config: Config = { port: 80 };\nconfig.port = 8080;',
        compiles: false,
        why: '`port` is `readonly`, so it cannot be assigned after creation.',
      },
      {
        key: 'array',
        code: 'const ids: readonly number[] = [1, 2];\nids.push(3);',
        compiles: false,
        why: '`readonly number[]` has no mutating methods such as `push`.',
      },
      {
        key: 'copy',
        code: 'interface Config { readonly port: number }\nconst config: Config = { port: 80 };\nconst next: Config = { ...config, port: 8080 };',
        compiles: true,
        why: 'Creating a new object with a different value is fine; only assignment to the existing property is blocked.',
      },
    ],
  ),
  ...outputFamily(
    'ts-index-signatures',
    4,
    ['An index signature describes objects used as dictionaries.'],
    [
      {
        key: 'counts',
        code: "const counts: { [word: string]: number } = {};\nfor (const w of ['a', 'b', 'a']) counts[w] = (counts[w] ?? 0) + 1;\nconsole.log(JSON.stringify(counts));",
        output: '{"a":2,"b":1}',
        why: 'Each word is a key; missing keys start from `0` via `??`.',
      },
      {
        key: 'record',
        code: "const ages: Record<string, number> = { ada: 36 };\nages.alan = 41;\nconsole.log(Object.keys(ages).length, ages['grace']);",
        output: '2 undefined',
        why: '`Record<string, number>` allows any key; reading a missing key gives `undefined` at runtime even though the type says `number`.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-structural-typing',
    4,
    'TypeScript compares object types by their structure, not by their names.',
    [
      {
        key: 'same-shape',
        code: 'interface Point { x: number; y: number }\ninterface Vector { x: number; y: number }\nconst v: Vector = { x: 1, y: 2 };\nconst p: Point = v;',
        compiles: true,
        why: '`Point` and `Vector` have the same structure, so they are compatible even though their names differ.',
      },
      {
        key: 'missing',
        code: 'interface Point3 { x: number; y: number; z: number }\nconst flat = { x: 1, y: 2 };\nconst p: Point3 = flat;',
        compiles: false,
        why: '`flat` has no `z`, which `Point3` requires.',
      },
      {
        key: 'optional-access',
        code: 'interface Options { depth?: number }\nfunction deeper(o: Options) {\n  return o.depth + 1;\n}',
        compiles: false,
        why: '`o.depth` may be `undefined` (it is optional), so `+ 1` is rejected under `strict`.',
      },
    ],
  ),
  ...typeFamily('ts-intersection-types', 5, 'An intersection `A & B` has the properties of both.', [
    {
      key: 'merge',
      code: "type Named = { name: string };\ntype Aged = { age: number };\nconst person: Named & Aged = { name: 'Ada', age: 36 };\nconst age = person.age;",
      expression: 'age',
      correct: 'number',
      wrong: ['string', 'string | number', 'never'],
      why: '`Named & Aged` has both `name` and `age`; `age` is a `number`.',
    },
    {
      key: 'override',
      code: 'type Base = { id: string; tags?: string[] };\ntype Tagged = Base & { tags: string[] };\ndeclare const t: Tagged;\nconst tags = t.tags;',
      expression: 'tags',
      correct: 'string[]',
      wrong: ['string[] | undefined', 'never', 'unknown'],
      why: 'In the intersection, `tags` must satisfy both: optional in `Base` but required in the other part, so it is a `string[]`.',
    },
    {
      key: 'conflict',
      code: 'type A = { id: string };\ntype B = { id: number };\ndeclare const both: A & B;\nconst id = both.id;',
      expression: 'id',
      correct: 'never',
      wrong: ['string | number', 'string', 'number'],
      why: 'A property that must be both `string` and `number` at once has type `never`: no value satisfies it.',
    },
  ]),
];

// ---------------------------------------------------------------- Functions (new skill)

export const functionTypeFamilies: readonly QuestionSource[] = [
  ...blankFamily(
    'ts-function-annotations',
    1,
    'Parameter types follow the name and a colon; the return type follows the parameter list.',
    [
      {
        key: 'parameter',
        prompt: 'Complete the parameter type.',
        template: 'function double(n: {{blank:type}}) {\n  return n * 2;\n}',
        blanks: { type: ['number'] },
        why: 'Multiplication needs a `number`.',
      },
      {
        key: 'return',
        prompt: 'Complete the return type.',
        template: 'function greet(name: string): {{blank:type}} {\n  return `Hello, ${name}`;\n}',
        blanks: { type: ['string'] },
        why: 'A template literal produces a `string`.',
      },
      {
        key: 'void',
        prompt: 'Complete the return type of a function that returns nothing.',
        template: 'function log(message: string): {{blank:type}} {\n  console.log(message);\n}',
        blanks: { type: ['void'] },
        why: 'Functions that return nothing have the return type `void`.',
      },
    ],
  ),
  ...outputFamily(
    'ts-optional-default-parameters',
    2,
    ['Optional parameters are `undefined` when left out; default values replace `undefined`.'],
    [
      {
        key: 'default',
        code: "function greet(name: string, greeting = 'Hello') {\n  return `${greeting}, ${name}`;\n}\nconsole.log(greet('Ada'), '|', greet('Alan', 'Hi'));",
        output: 'Hello, Ada | Hi, Alan',
        why: 'The default is used only when the argument is missing.',
      },
      {
        key: 'optional',
        code: "function label(n: number, unit?: string) {\n  return unit === undefined ? String(n) : `${n} ${unit}`;\n}\nconsole.log(label(3), label(3, 'kg'));",
        output: '3 3 kg',
        why: 'Without the second argument, `unit` is `undefined`.',
      },
      {
        key: 'explicit-undefined',
        code: "function greet(name: string, greeting = 'Hello') {\n  return `${greeting}, ${name}`;\n}\nconsole.log(greet('Ada', undefined));",
        output: 'Hello, Ada',
        why: 'Passing `undefined` explicitly also triggers the default value.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-function-type-compatibility',
    3,
    'A function with fewer parameters can be used where more are passed; extra required parameters cannot.',
    [
      {
        key: 'fewer',
        code: 'const handlers: ((value: string, index: number) => void)[] = [];\nhandlers.push((value) => console.log(value));',
        compiles: true,
        why: 'Ignoring a parameter is safe, so a one-parameter function fits a two-parameter function type.',
      },
      {
        key: 'more',
        code: 'type Handler = (value: string) => void;\nconst h: Handler = (value: string, extra: number) => console.log(value, extra);',
        compiles: false,
        why: '`extra` would never be passed by callers of `Handler`, so the assignment is rejected.',
      },
      {
        key: 'return-void',
        code: 'type Handler = (value: string) => void;\nconst lengths: number[] = [];\nconst h: Handler = (value) => lengths.push(value.length);',
        compiles: true,
        why: 'A function type returning `void` accepts functions that return something; the value is ignored.',
      },
    ],
  ),
  ...outputFamily(
    'ts-rest-and-overloads',
    4,
    ['Rest parameters collect the remaining arguments into an array.'],
    [
      {
        key: 'rest',
        code: 'function sum(...values: number[]) {\n  return values.reduce((a, b) => a + b, 0);\n}\nconsole.log(sum(), sum(1, 2, 3));',
        output: '0 6',
        why: 'With no arguments, `values` is an empty array, and the sum starts at 0.',
      },
      {
        key: 'overload',
        code: "function size(x: string): number;\nfunction size(x: unknown[]): number;\nfunction size(x: string | unknown[]) {\n  return x.length;\n}\nconsole.log(size('abc') + size([1, 2]));",
        output: '5',
        why: 'Both overloads return a length: 3 + 2.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-callback-types',
    4,
    'Check how the callback is called against how it is typed.',
    [
      {
        key: 'map-index',
        code: 'const labels = [10, 20].map((value, index) => `${index}:${value}`);',
        compiles: true,
        why: '`map` passes the value and the index; the callback may use both.',
      },
      {
        key: 'wrong-param',
        code: "const total = ['a', 'b'].reduce((sum: number, s: number) => sum + s, 0);",
        compiles: false,
        why: 'The array holds strings, so the second callback parameter is a `string`, not a `number`.',
      },
      {
        key: 'optional-callback',
        code: 'function run(done?: () => void) {\n  done();\n}',
        compiles: false,
        why: '`done` may be `undefined`. Call it with `done?.()`.',
      },
    ],
  ),
  ...typeFamily(
    'ts-return-type-inference',
    5,
    'TypeScript infers the return type from every `return` statement.',
    [
      {
        key: 'union',
        code: "function parse(s: string) {\n  const n = Number(s);\n  return Number.isNaN(n) ? null : n;\n}\nconst parsed = parse('7');",
        expression: 'parsed',
        correct: 'number | null',
        wrong: ['number', 'any', 'null'],
        why: 'One branch returns `null`, the other a `number`.',
      },
      {
        key: 'never',
        code: 'const fail = (message: string) => {\n  throw new Error(message);\n};',
        expression: 'fail',
        correct: '(message: string) => never',
        wrong: [
          '(message: string) => void',
          '(message: string) => undefined',
          '(message: string) => Error',
        ],
        why: 'An arrow function (or function expression) that can only throw is inferred to return `never`: it never returns normally. A function *declaration* with the same body is inferred as returning `void` instead, for compatibility.',
      },
      {
        key: 'async',
        code: 'async function load() {\n  return 42;\n}\nconst pending = load();',
        expression: 'pending',
        correct: 'Promise<number>',
        wrong: ['number', 'Promise<42>', 'Promise<any>'],
        why: 'An `async` function always returns a `Promise` of its return value.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Generics (new skill)

export const genericFamilies: readonly QuestionSource[] = [
  ...choiceFamilyFor(
    'ts-generics-basics',
    1,
    'A type parameter is a placeholder for a type chosen by the caller.',
    [
      {
        key: 'purpose',
        question:
          'Why write `function first<T>(items: T[]): T` instead of `function first(items: any[]): any`?',
        correct: 'The return type follows the argument: `first([1, 2])` returns a `number`',
        wrong: [
          'Generics make the function faster',
          '`any[]` does not accept arrays of numbers',
          'Generics check the values at runtime',
        ],
        why: 'The type parameter links the input and output types, so callers keep full type information.',
      },
      {
        key: 'inference',
        question: 'In `identity<T>(value: T): T`, what is `T` for the call `identity(true)`?',
        correct: '`boolean`',
        wrong: ['`T`', '`unknown`', '`any`'],
        why: 'TypeScript infers `T` from the argument. (The result of `identity(true)` is `true` only for a `const` literal argument.)',
      },
    ],
  ),
  ...typeFamily(
    'ts-generic-inference',
    2,
    'TypeScript infers the type parameter from the arguments.',
    [
      {
        key: 'first',
        code: 'function first<T>(items: T[]): T | undefined {\n  return items[0];\n}\nconst value = first([1, 2, 3]);',
        expression: 'value',
        correct: 'number | undefined',
        wrong: ['number', 'T | undefined', 'unknown'],
        why: '`T` is inferred as `number`, so the result is `number | undefined`.',
      },
      {
        key: 'pair',
        code: "function pair<A, B>(a: A, b: B): [A, B] {\n  return [a, b];\n}\nconst p = pair(1, 'x');",
        expression: 'p',
        correct: '[number, string]',
        wrong: ['(string | number)[]', "[1, 'x']", '[A, B]'],
        why: '`A` is `number` and `B` is `string`, so the result is the tuple `[number, string]`.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-generic-constraints',
    3,
    '`T extends …` restricts which types can be used, and lets the function use what the constraint guarantees.',
    [
      {
        key: 'no-constraint',
        code: 'function len<T>(value: T) {\n  return value.length;\n}',
        compiles: false,
        why: 'Without a constraint, `T` could be any type, such as `number`, which has no `length`.',
      },
      {
        key: 'constraint',
        code: "function len<T extends { length: number }>(value: T) {\n  return value.length;\n}\nlen([1, 2]);\nlen('abc');",
        compiles: true,
        why: 'Arrays and strings both have a numeric `length`, which the constraint guarantees.',
      },
      {
        key: 'violates',
        code: 'function len<T extends { length: number }>(value: T) {\n  return value.length;\n}\nlen(42);',
        compiles: false,
        why: '`42` is a `number`, which has no `length`, so it does not satisfy the constraint.',
      },
    ],
  ),
  ...outputFamily(
    'ts-generic-functions-run',
    4,
    ['Generic code runs like ordinary JavaScript; the type parameters disappear at runtime.'],
    [
      {
        key: 'group',
        code: "function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {\n  const out: Record<string, T[]> = {};\n  for (const item of items) (out[key(item)] ??= []).push(item);\n  return out;\n}\nconst g = groupBy(['apple', 'avocado', 'banana'], (s) => s[0] ?? '');\nconsole.log(Object.keys(g).join(','), g['a']?.length);",
        output: 'a,b 2',
        why: 'Two words start with `a` and one with `b`.',
      },
      {
        key: 'map-values',
        code: 'function mapValues<T, U>(obj: Record<string, T>, fn: (v: T) => U): Record<string, U> {\n  const out: Record<string, U> = {};\n  for (const [k, v] of Object.entries(obj)) out[k] = fn(v);\n  return out;\n}\nconsole.log(JSON.stringify(mapValues({ a: 1, b: 2 }, (n) => n * 10)));',
        output: '{"a":10,"b":20}',
        why: 'Each value is multiplied by 10; the keys stay the same.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-generic-defaults-and-arrays',
    4,
    'Type arguments can be inferred, given explicitly, or defaulted.',
    [
      {
        key: 'explicit',
        code: "function wrap<T>(value: T): { value: T } {\n  return { value };\n}\nconst w = wrap<number>('7');",
        compiles: false,
        why: 'With `T` given explicitly as `number`, the argument must be a number.',
      },
      {
        key: 'default',
        code: "interface Box<T = string> {\n  value: T;\n}\nconst b: Box = { value: 'text' };",
        compiles: true,
        why: '`Box` without a type argument uses the default, `string`.',
      },
      {
        key: 'array-generic',
        code: 'function last<T>(items: readonly T[]): T | undefined {\n  return items[items.length - 1];\n}\nconst n: number | undefined = last([1, 2, 3] as const);',
        compiles: true,
        why: '`T` is inferred as `1 | 2 | 3`, which is assignable to `number`.',
      },
    ],
  ),
  ...typeFamily(
    'ts-keyof-generics',
    5,
    '`K extends keyof T` limits `K` to the property names of `T`, and `T[K]` is the type of that property.',
    [
      {
        key: 'get',
        code: "function get<T, K extends keyof T>(obj: T, key: K): T[K] {\n  return obj[key];\n}\nconst user = { name: 'Ada', age: 36 };\nconst age = get(user, 'age');",
        expression: 'age',
        correct: 'number',
        wrong: ['string | number', 'unknown', "'age'"],
        why: '`K` is `"age"`, so the result type is `T["age"]`, which is `number`.',
      },
      {
        key: 'pluck',
        code: "function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {\n  return items.map((item) => item[key]);\n}\nconst names = pluck([{ name: 'Ada', age: 36 }], 'name');",
        expression: 'names',
        correct: 'string[]',
        wrong: ['unknown[]', '(string | number)[]', "'name'[]"],
        why: '`K` is `"name"`, so each element has type `T["name"]`: a `string`.',
      },
      {
        key: 'keys',
        code: "const user = { name: 'Ada', age: 36 };\ntype UserKey = keyof typeof user;\ndeclare const key: UserKey;",
        expression: 'key',
        correct: "'name' | 'age'",
        wrong: ['string', "'name'", 'keyof object'],
        why: '`keyof` gives the union of the property names: `"name" | "age"`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Utility types (new skill)

export const utilityTypeFamilies: readonly QuestionSource[] = [
  ...choiceFamilyFor(
    'ts-utility-basics',
    1,
    'Utility types build a new type from an existing one.',
    [
      {
        key: 'partial',
        question: 'What does `Partial<User>` do?',
        correct: 'Makes every property of `User` optional',
        wrong: [
          'Removes every property',
          'Makes every property read-only',
          'Keeps only the first property',
        ],
        why: '`Partial<T>` adds `?` to every property, which is handy for updates.',
      },
      {
        key: 'readonly',
        question: 'What does `Readonly<User>` do?',
        correct: 'Makes every property of `User` read-only',
        wrong: [
          'Freezes the object at runtime',
          'Makes every property optional',
          'Removes methods',
        ],
        why: '`Readonly<T>` adds `readonly` to every property, at compile time only.',
      },
      {
        key: 'record',
        question: "What does `Record<'admin' | 'user', number>` describe?",
        correct: 'An object with an `admin` and a `user` property, both numbers',
        wrong: [
          'An array of numbers',
          'A number that is either `admin` or `user`',
          'A database record',
        ],
        why: '`Record<K, V>` is an object type with a property of type `V` for every key in `K`.',
      },
    ],
  ),
  ...whichCompileFamily(
    'ts-pick-omit',
    2,
    '`Pick` keeps the named properties; `Omit` removes them.',
    [
      {
        key: 'pick',
        question: 'Which declarations compile?',
        prelude:
          "interface User { id: number; name: string; email: string }\ntype Preview = Pick<User, 'id' | 'name'>;",
        options: [
          "const a: Preview = { id: 1, name: 'Ada' };",
          "const b: Preview = { id: 1, name: 'Ada', email: 'a@x.io' };",
          'const c: Preview = { id: 1 };',
          "const d: Preview = { name: 'Ada', id: 2 };",
        ],
        correct: [
          "const a: Preview = { id: 1, name: 'Ada' };",
          "const d: Preview = { name: 'Ada', id: 2 };",
        ],
        why: '`Preview` has exactly `id` and `name`, both required; `email` is an excess property in a literal.',
      },
      {
        key: 'omit',
        question: 'Which declarations compile?',
        prelude:
          "interface User { id: number; name: string; email: string }\ntype NewUser = Omit<User, 'id'>;",
        options: [
          "const a: NewUser = { name: 'Ada', email: 'a@x.io' };",
          "const b: NewUser = { id: 1, name: 'Ada', email: 'a@x.io' };",
          "const c: NewUser = { name: 'Ada' };",
          "const d: NewUser = { email: 'a@x.io', name: 'Ada' };",
        ],
        correct: [
          "const a: NewUser = { name: 'Ada', email: 'a@x.io' };",
          "const d: NewUser = { email: 'a@x.io', name: 'Ada' };",
        ],
        why: '`NewUser` is `User` without `id`; `name` and `email` stay required.',
      },
    ],
  ),
  ...typeFamily(
    'ts-record-and-returntype',
    3,
    '`Record<K, V>` maps keys to values; `ReturnType<F>` extracts what a function type returns.',
    [
      {
        key: 'record',
        code: "type Role = 'admin' | 'user';\nconst limits: Record<Role, number> = { admin: 100, user: 10 };\nconst limit = limits.admin;",
        expression: 'limit',
        correct: 'number',
        wrong: ['100', 'Role', 'number | undefined'],
        why: '`Record<Role, number>` has a `number` for every role.',
      },
      {
        key: 'return-type',
        code: "function createUser() {\n  return { id: 1, name: 'Ada' };\n}\ntype User = ReturnType<typeof createUser>;\nconst user: User = createUser();\nconst id = user.id;",
        expression: 'id',
        correct: 'number',
        wrong: ['1', 'unknown', 'User'],
        why: '`ReturnType<typeof createUser>` is `{ id: number; name: string }`.',
      },
      {
        key: 'record-keys',
        code: "type Flags = Record<'dark' | 'compact', boolean>;\ndeclare const flags: Flags;\nconst names = Object.keys(flags);",
        expression: 'names',
        correct: 'string[]',
        wrong: ["('dark' | 'compact')[]", 'keyof Flags', 'boolean[]'],
        why: '`Object.keys` always returns `string[]`, even for a `Record` with known keys, because at runtime an object may have more properties than its type lists.',
      },
    ],
  ),
  ...compilesFamily(
    'ts-utility-compile',
    4,
    'Check what the utility type leaves required or writable.',
    [
      {
        key: 'required',
        code: 'interface Options { verbose?: boolean; depth?: number }\nconst o: Required<Options> = { verbose: true };',
        compiles: false,
        why: '`Required<T>` removes `?`, so `depth` must be given.',
      },
      {
        key: 'partial-update',
        code: "interface User { name: string; email: string }\nfunction update(user: User, changes: Partial<User>): User {\n  return { ...user, ...changes };\n}\nupdate({ name: 'Ada', email: 'a@x.io' }, { email: 'ada@x.io' });",
        compiles: true,
        why: '`Partial<User>` lets the caller pass only the properties that change.',
      },
      {
        key: 'readonly-assign',
        code: "interface User { name: string }\nconst u: Readonly<User> = { name: 'Ada' };\nu.name = 'Grace';",
        compiles: false,
        why: '`Readonly<User>` makes `name` read-only.',
      },
    ],
  ),
  ...typeFamily('ts-advanced-utilities', 5, 'Some utility types filter unions or unwrap types.', [
    {
      key: 'exclude',
      code: "type Status = 'active' | 'paused' | 'deleted';\ntype Visible = Exclude<Status, 'deleted'>;\ndeclare const v: Visible;",
      expression: 'v',
      correct: "'active' | 'paused'",
      wrong: ["'deleted'", 'Status', 'string'],
      why: '`Exclude` removes union members assignable to the second type.',
    },
    {
      key: 'non-nullable',
      code: 'type MaybeName = string | null | undefined;\ndeclare const n: NonNullable<MaybeName>;',
      expression: 'n',
      correct: 'string',
      wrong: ['string | null', 'string | undefined', 'never'],
      why: '`NonNullable` removes `null` and `undefined`.',
    },
    {
      key: 'awaited',
      code: 'type Loaded = Awaited<Promise<Promise<number>>>;\ndeclare const value: Loaded;',
      expression: 'value',
      correct: 'number',
      wrong: ['Promise<number>', 'Promise<Promise<number>>', 'unknown'],
      why: '`Awaited` unwraps promises recursively, as `await` does.',
    },
    {
      key: 'parameters',
      code: 'function move(x: number, y: number, label?: string) {\n  return { x, y, label };\n}\ndeclare const args: Parameters<typeof move>;',
      expression: 'args',
      correct: '[x: number, y: number, label?: string | undefined]',
      wrong: ['number[]', '[number, number]', '(string | number)[]'],
      why: '`Parameters` gives a tuple of the parameter types, with names and optionality.',
    },
  ]),
];

// ---------------------------------------------------------------- helpers

interface PlainChoice {
  readonly key: string;
  readonly question: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

/** Concept questions (not code) with seeded option order. */
function choiceFamilyFor(
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly PlainChoice[],
): QuestionSource[] {
  return family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text(v.question),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [hint],
    explanation: text(v.why),
  }));
}
