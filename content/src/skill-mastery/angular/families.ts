import type { QuestionSource } from '@pracstack/content-model';
import {
  blankFamily,
  choiceFamilyFor,
  compilesFamily,
  typeFamily,
  whichCompileFamily,
} from '../typescript/families';

/**
 * Angular questions. Every code snippet imports the real Angular APIs and is
 * compiled against @angular/core's type definitions at build time
 * (content/src/checks/typescript-snippets.ts): inferred-type keys must match
 * exactly, and "does it compile?" keys must agree with the compiler. Concept
 * questions without code (choiceFamilyFor) are hand-written and reviewed.
 */

const SIGNALS = "import { computed, signal } from '@angular/core';";

/** Angular types the options may name; imported for the check only, unless the code already does. */
const ANGULAR_TYPES = [
  'ElementRef',
  'InputSignal',
  'InputSignalWithTransform',
  'ModelSignal',
  'OutputEmitterRef',
  'QueryList',
  'Signal',
  'WritableSignal',
  'EventEmitter',
];
const ngTypes = (code: string): string => {
  const imported = (name: string) => new RegExp(`\\b${name}\\b`).test(code);
  const missing = ANGULAR_TYPES.filter((t) => !imported(t));
  const lines = [`import type { ${missing.join(', ')} } from '@angular/core';`];
  if (!imported('Observable')) lines.push("import type { Observable } from 'rxjs';");
  return lines.join('\n');
};

// ---------------------------------------------------------------- Signals

export const signalFamilies: readonly QuestionSource[] = [
  ...choiceFamilyFor('ng-signal-basics', 1, 'A signal is a value you read by calling it.', [
    {
      key: 'read',
      question: 'Given `const count = signal(0);`, how do you read the current value?',
      correct: '`count()`',
      wrong: ['`count.value`', '`count.get()`', '`count`'],
      why: 'Signals are getter functions: calling `count()` returns the value and lets Angular track the read.',
    },
    {
      key: 'write',
      question: 'Given `const count = signal(0);`, how do you change the value to 5?',
      correct: '`count.set(5)`',
      wrong: ['`count = 5`', '`count(5)`', '`count.value = 5`'],
      why: '`set` replaces the value; `update` computes a new value from the old one.',
    },
  ]),
  ...typeFamily(
    'ng-signal-types',
    2,
    'Writable signals are `WritableSignal<T>`; computed signals are read-only `Signal<T>`.',
    [
      {
        key: 'number',
        code: `${SIGNALS}\nconst count = signal(0);`,
        expression: 'count',
        correct: 'WritableSignal<number>',
        wrong: ['Signal<number>', 'number', 'WritableSignal<0>'],
        why: '`signal(0)` creates a writable signal; the type is inferred from the initial value and widened to `number`.',
      },
      {
        key: 'nullable',
        code: `${SIGNALS}\nconst user = signal<string | null>(null);`,
        expression: 'user',
        correct: 'WritableSignal<string | null>',
        wrong: ['WritableSignal<null>', 'Signal<string>', 'WritableSignal<string>'],
        why: 'The explicit type argument allows both `string` and `null`.',
      },
      {
        key: 'computed',
        code: `${SIGNALS}\nconst count = signal(2);\nconst doubled = computed(() => count() * 2);`,
        expression: 'doubled',
        correct: 'Signal<number>',
        wrong: ['WritableSignal<number>', 'number', '() => number'],
        why: '`computed` returns a read-only `Signal`, typed by the function’s return value.',
      },
    ],
    ngTypes,
  ),
  ...blankFamily(
    'ng-signal-writes',
    2,
    'Writable signals have `set` (new value) and `update` (new value from the old one).',
    [
      {
        key: 'update',
        prompt: 'Complete the code to add 1 to the current value.',
        template: `${SIGNALS}\nconst count = signal(0);\ncount.{{blank:method}}((c) => c + 1);`,
        blanks: { method: ['update'] },
        why: '`update` receives the current value and stores what the function returns.',
      },
      {
        key: 'set',
        prompt: 'Complete the code to reset the value to 0.',
        template: `${SIGNALS}\nconst count = signal(10);\ncount.{{blank:method}}(0);`,
        blanks: { method: ['set'] },
        why: '`set` stores a new value directly.',
      },
      {
        key: 'readonly',
        prompt: 'Complete the code to expose a read-only view of the signal.',
        template: `${SIGNALS}\nconst count = signal(0);\nexport const value = count.{{blank:method}}();`,
        blanks: { method: ['asReadonly'] },
        why: '`asReadonly()` returns a `Signal` without `set` and `update`, so other code cannot change the value.',
      },
    ],
  ),
  ...compilesFamily(
    'ng-signal-writes-checked',
    3,
    'Computed signals are read-only, and writes must match the signal’s type.',
    [
      {
        key: 'set-computed',
        code: `${SIGNALS}\nconst count = signal(1);\nconst doubled = computed(() => count() * 2);\ndoubled.set(4);`,
        compiles: false,
        why: '`computed` returns a read-only `Signal`, which has no `set`. Change `count` instead.',
      },
      {
        key: 'wrong-type',
        code: `${SIGNALS}\nconst count = signal(1);\ncount.update((c) => c + '1');`,
        compiles: false,
        why: "`c + '1'` is a string, but the signal holds a `number`.",
      },
      {
        key: 'increment',
        code: `${SIGNALS}\nconst count = signal(1);\ncount.set(count() + 1);`,
        compiles: true,
        why: 'Reading with `count()` and writing with `set` is fine (though `update` expresses it more directly).',
      },
    ],
  ),
  ...choiceFamilyFor(
    'ng-computed-behaviour',
    3,
    'A computed signal recalculates only when needed.',
    [
      {
        key: 'lazy',
        question: 'When does the function passed to `computed(…)` run?',
        correct:
          'When the value is read and a signal it depends on has changed since the last calculation',
        wrong: [
          'Every time any signal in the app changes',
          'Once, when it is created',
          'On a timer',
        ],
        why: 'Computed signals are lazy and memoised: they recalculate on read, only if a dependency changed.',
      },
      {
        key: 'dependencies',
        question: 'How does a computed signal know which signals it depends on?',
        correct: 'It records the signals read while its function runs',
        wrong: [
          'You list them in an array',
          'From the variable names',
          'It depends on every signal in the component',
        ],
        why: 'Dependencies are tracked dynamically: every signal read during the last calculation is a dependency.',
      },
    ],
  ),
  ...typeFamily(
    'ng-linked-signal',
    4,
    '`linkedSignal` is writable, and resets from its source whenever the source changes.',
    [
      {
        key: 'shorthand',
        code: "import { linkedSignal, signal } from '@angular/core';\nconst options = signal(['small', 'large']);\nconst selected = linkedSignal(() => options()[0]);",
        expression: 'selected',
        correct: 'WritableSignal<string>',
        wrong: ['Signal<string>', 'WritableSignal<string[]>', 'string'],
        why: '`linkedSignal` returns a `WritableSignal`: the user can pick another option, and it resets when `options` changes.',
      },
      {
        key: 'computation',
        code: "import { linkedSignal, signal } from '@angular/core';\nconst page = signal(3);\nconst offset = linkedSignal({ source: page, computation: (p) => p * 20 });",
        expression: 'offset',
        correct: 'WritableSignal<number>',
        wrong: ['WritableSignal<{ source: number }>', 'Signal<number>', 'number'],
        why: 'With `source` and `computation`, the result type is what `computation` returns: a `number`.',
      },
    ],
    ngTypes,
  ),
  ...compilesFamily(
    'ng-signal-options',
    4,
    'Signal options are type-checked like any other function argument.',
    [
      {
        key: 'custom-equal',
        code: `${SIGNALS}\nconst point = signal({ x: 1, y: 2 }, { equal: (a, b) => a.x === b.x && a.y === b.y });\npoint.set({ x: 1, y: 2 });`,
        compiles: true,
        why: 'A custom `equal` function decides whether a new value counts as a change; with it, setting an equal point notifies nobody.',
      },
      {
        key: 'equal-wrong-type',
        code: `${SIGNALS}\nconst point = signal({ x: 1, y: 2 }, { equal: (a: number, b: number) => a === b });`,
        compiles: false,
        why: '`equal` receives two values of the signal’s type (`{ x: number; y: number }`), not numbers.',
      },
    ],
  ),
  ...typeFamily(
    'ng-to-signal',
    5,
    '`toSignal` must have a value before the observable emits, unless you say otherwise.',
    [
      {
        key: 'default',
        code: "import { toSignal } from '@angular/core/rxjs-interop';\nimport { of } from 'rxjs';\nconst value = toSignal(of(1));",
        expression: 'value',
        correct: 'Signal<number | undefined>',
        wrong: ['Signal<number>', 'WritableSignal<number>', 'Observable<number>'],
        why: 'Until the observable emits, the signal has no value, so its type includes `undefined`.',
      },
      {
        key: 'initial',
        code: "import { toSignal } from '@angular/core/rxjs-interop';\nimport { of } from 'rxjs';\nconst value = toSignal(of(1), { initialValue: 0 });",
        expression: 'value',
        correct: 'Signal<number>',
        wrong: ['Signal<number | undefined>', 'Signal<0>', 'WritableSignal<number>'],
        why: '`initialValue` provides a value up front, so `undefined` is no longer possible.',
      },
      {
        key: 'require-sync',
        code: "import { toSignal } from '@angular/core/rxjs-interop';\nimport { of } from 'rxjs';\nconst value = toSignal(of('ready'), { requireSync: true });",
        expression: 'value',
        correct: 'Signal<string>',
        wrong: ['Signal<string | undefined>', "Signal<'ready'>", 'Observable<string>'],
        why: '`requireSync` promises the observable emits immediately (it throws otherwise), so there is no `undefined`.',
      },
    ],
    ngTypes,
  ),
  ...compilesFamily(
    'ng-effect-and-untracked',
    5,
    'Effects return an `EffectRef`; `untracked` reads a signal without making it a dependency.',
    [
      {
        key: 'effect-ref',
        code: "import { effect, type EffectRef, signal } from '@angular/core';\nconst count = signal(0);\nconst ref: EffectRef = effect(() => console.log(count()));\nref.destroy();",
        compiles: true,
        why: '`effect` returns an `EffectRef` whose `destroy()` stops it. (It must run in an injection context at runtime, which the type system does not check.)',
      },
      {
        key: 'untracked',
        code: "import { computed, signal, untracked } from '@angular/core';\nconst a = signal(1);\nconst b = signal(2);\nconst sum = computed(() => a() + untracked(() => b()));\nconst n: number = sum();",
        compiles: true,
        why: '`untracked` returns the value of its function, here a `number`; `sum` only recalculates when `a` changes.',
      },
      {
        key: 'effect-value',
        code: "import { effect, signal } from '@angular/core';\nconst count = signal(0);\nconst doubled: number = effect(() => count() * 2);",
        compiles: false,
        why: 'An effect is for side effects and returns an `EffectRef`, not a value. Use `computed` to derive values.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Component inputs, outputs and queries

export const componentFamilies: readonly QuestionSource[] = [
  ...choiceFamilyFor(
    'ng-component-io-basics',
    1,
    'Inputs bring data into a component; outputs send events out.',
    [
      {
        key: 'input',
        question: 'What does `readonly name = input<string>();` declare in a component?',
        correct: 'A signal input: the parent can bind `[name]`, and the component reads `name()`',
        wrong: [
          'A text field in the template',
          'A writable signal the component sets',
          'A route parameter',
        ],
        why: 'Signal inputs are read-only signals whose value comes from the parent’s binding.',
      },
      {
        key: 'output',
        question: 'What does `readonly saved = output<string>();` let a component do?',
        correct: 'Emit events the parent can listen to with `(saved)="…"`',
        wrong: [
          'Write to a parent signal directly',
          'Return a value from the template',
          'Save data to storage',
        ],
        why: 'Outputs are event emitters; the parent handles them with an event binding.',
      },
    ],
  ),
  ...typeFamily(
    'ng-input-types',
    2,
    'An optional input without a default may be `undefined`.',
    [
      {
        key: 'optional',
        code: "import { input } from '@angular/core';\nconst name = input<string>();",
        expression: 'name',
        correct: 'InputSignal<string | undefined>',
        wrong: ['InputSignal<string>', 'Signal<string>', 'WritableSignal<string | undefined>'],
        why: 'Without a default value or `required`, the input is `undefined` until the parent binds it.',
      },
      {
        key: 'required',
        code: "import { input } from '@angular/core';\nconst id = input.required<number>();",
        expression: 'id',
        correct: 'InputSignal<number>',
        wrong: ['InputSignal<number | undefined>', 'Signal<number>', 'number'],
        why: '`input.required` makes the template compiler insist on a binding, so no `undefined`.',
      },
      {
        key: 'default',
        code: "import { input } from '@angular/core';\nconst size = input(10);",
        expression: 'size',
        correct: 'InputSignal<number>',
        wrong: ['InputSignal<number | undefined>', 'InputSignal<10>', 'WritableSignal<number>'],
        why: 'The default value gives the type and means there is always a value.',
      },
    ],
    ngTypes,
  ),
  ...typeFamily(
    'ng-output-and-model-types',
    3,
    'Outputs emit; models are two-way: readable, writable and emitting.',
    [
      {
        key: 'output',
        code: "import { output } from '@angular/core';\nconst saved = output<string>();",
        expression: 'saved',
        correct: 'OutputEmitterRef<string>',
        wrong: ['EventEmitter<string>', 'Signal<string>', 'Observable<string>'],
        why: '`output()` returns an `OutputEmitterRef`, with `emit(value)`.',
      },
      {
        key: 'model',
        code: "import { model } from '@angular/core';\nconst value = model(0);",
        expression: 'value',
        correct: 'ModelSignal<number>',
        wrong: ['WritableSignal<number>', 'InputSignal<number>', 'OutputEmitterRef<number>'],
        why: '`model()` creates a two-way binding (`[(value)]`): a signal the component can also `set`.',
      },
      {
        key: 'transform',
        code: "import { booleanAttribute, input } from '@angular/core';\nconst disabled = input(false, { transform: booleanAttribute });",
        expression: 'disabled',
        correct: 'InputSignalWithTransform<boolean, unknown>',
        wrong: ['InputSignal<boolean>', 'InputSignal<unknown>', 'Signal<boolean>'],
        why: 'With a transform, the input accepts what the transform accepts (`unknown` for `booleanAttribute`) and holds what it returns (`boolean`).',
      },
    ],
    ngTypes,
  ),
  ...compilesFamily(
    'ng-io-usage',
    3,
    'Inputs are read-only inside the component; outputs emit values of their declared type.',
    [
      {
        key: 'emit-wrong',
        code: "import { output } from '@angular/core';\nconst saved = output<string>();\nsaved.emit(42);",
        compiles: false,
        why: 'The output emits strings, so `emit(42)` is rejected.',
      },
      {
        key: 'emit-right',
        code: "import { output } from '@angular/core';\nconst saved = output<string>();\nsaved.emit('done');",
        compiles: true,
        why: 'The emitted value matches the declared type.',
      },
      {
        key: 'set-input',
        code: "import { input } from '@angular/core';\nconst name = input('Ada');\nname.set('Grace');",
        compiles: false,
        why: 'Inputs are owned by the parent: `InputSignal` has no `set`. Use `model()` for a value both sides can change, or `linkedSignal` for local edits.',
      },
    ],
  ),
  ...compilesFamily(
    'ng-component-class',
    4,
    'Inside a component class, inputs are signals: call them to read the value.',
    [
      {
        key: 'computed-from-input',
        code: "import { Component, computed, input } from '@angular/core';\n@Component({ selector: 'app-counter', template: '{{ doubled() }}' })\nexport class Counter {\n  readonly count = input(0);\n  readonly doubled = computed(() => this.count() * 2);\n}",
        compiles: true,
        why: '`this.count()` reads the input, so `doubled` updates whenever the parent changes it.',
      },
      {
        key: 'forgot-call',
        code: "import { Component, computed, input } from '@angular/core';\n@Component({ selector: 'app-counter', template: '{{ doubled() }}' })\nexport class Counter {\n  readonly count = input(0);\n  readonly doubled = computed(() => this.count * 2);\n}",
        compiles: false,
        why: '`this.count` is the signal (a function), not its value; multiplying it is a type error. Call it: `this.count()`.',
      },
      {
        key: 'model-set',
        code: "import { Component, model } from '@angular/core';\n@Component({ selector: 'app-toggle', template: '' })\nexport class Toggle {\n  readonly checked = model(false);\n  toggle(): void {\n    this.checked.update((c) => !c);\n  }\n}",
        compiles: true,
        why: 'A `ModelSignal` is writable: updating it also notifies the parent’s `[(checked)]` binding.',
      },
    ],
  ),
  ...whichCompileFamily(
    'ng-input-options',
    4,
    'Input options such as `alias` and `transform` are type-checked.',
    [
      {
        key: 'options',
        question: 'Which declarations compile?',
        prelude: "import { booleanAttribute, input, numberAttribute } from '@angular/core';",
        options: [
          "const a = input.required<string>({ alias: 'label' });",
          'const b = input(0, { transform: numberAttribute });',
          "const c = input<string>('x', { alias: 1 });",
          'const d = input(false, { transform: booleanAttribute });',
        ],
        correct: [
          "const a = input.required<string>({ alias: 'label' });",
          'const b = input(0, { transform: numberAttribute });',
          'const d = input(false, { transform: booleanAttribute });',
        ],
        why: 'An `alias` must be a string. `numberAttribute` and `booleanAttribute` are ready-made transforms for attribute strings.',
      },
      {
        key: 'outputs',
        question: 'Which statements compile?',
        prelude:
          "import { model, output } from '@angular/core';\nconst changed = output<number>();\nconst value = model('');",
        options: [
          'changed.emit(1);',
          "changed.emit('1');",
          "value.set('next');",
          'value.set(null);',
        ],
        correct: ['changed.emit(1);', "value.set('next');"],
        why: 'Both are typed by their declaration: the output emits numbers and the model holds strings (not `null`).',
      },
    ],
  ),
  ...typeFamily(
    'ng-signal-queries',
    5,
    'Signal queries return signals; optional queries may be `undefined`.',
    [
      {
        key: 'view-child',
        code: "import { type ElementRef, viewChild } from '@angular/core';\nconst box = viewChild<ElementRef<HTMLInputElement>>('box');",
        expression: 'box',
        correct: 'Signal<ElementRef<HTMLInputElement> | undefined>',
        wrong: [
          'ElementRef<HTMLInputElement>',
          'Signal<ElementRef<HTMLInputElement>>',
          'HTMLInputElement',
        ],
        why: 'The element may not be rendered (for example inside an `@if`), so the signal can hold `undefined`.',
      },
      {
        key: 'view-child-required',
        code: "import { type ElementRef, viewChild } from '@angular/core';\nconst box = viewChild.required<ElementRef<HTMLInputElement>>('box');",
        expression: 'box',
        correct: 'Signal<ElementRef<HTMLInputElement>>',
        wrong: [
          'Signal<ElementRef<HTMLInputElement> | undefined>',
          'ElementRef<HTMLInputElement>',
          'WritableSignal<ElementRef<HTMLInputElement>>',
        ],
        why: '`viewChild.required` promises the element exists (it throws if read when missing), so there is no `undefined`.',
      },
      {
        key: 'content-children',
        code: "import { Component, contentChildren } from '@angular/core';\n@Component({ selector: 'app-tab', template: '' })\nexport class Tab {}\nconst tabs = contentChildren(Tab);",
        expression: 'tabs',
        correct: 'Signal<readonly Tab[]>',
        wrong: ['Signal<Tab[]>', 'QueryList<Tab>', 'Signal<Tab | undefined>'],
        why: '`contentChildren` returns a signal of a read-only array of the matching children.',
      },
    ],
    ngTypes,
  ),
  ...compilesFamily('ng-host-and-inject', 5, '`inject()` is typed by the token you pass.', [
    {
      key: 'inject-type',
      code: "import { ElementRef, inject, Injectable } from '@angular/core';\n@Injectable({ providedIn: 'root' })\nexport class Clock {\n  now(): number {\n    return Date.now();\n  }\n}\nexport class Widget {\n  private readonly clock = inject(Clock);\n  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);\n  stamp(): string {\n    return `${this.host.nativeElement.tagName} ${this.clock.now()}`;\n  }\n}",
      compiles: true,
      why: '`inject(Clock)` returns a `Clock`, and the explicit type argument types the `ElementRef`.',
    },
    {
      key: 'inject-optional',
      code: "import { inject, InjectionToken } from '@angular/core';\nconst API_URL = new InjectionToken<string>('API_URL');\nexport function endpoint(): string {\n  const url = inject(API_URL, { optional: true });\n  return url.toUpperCase();\n}",
      compiles: false,
      why: 'With `optional: true`, `inject` returns `string | null`, so `url` may be `null`.',
    },
  ]),
];
