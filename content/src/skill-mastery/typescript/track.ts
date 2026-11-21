import type { TrackSource } from '@pracstack/content-model';
import { discriminatedUnionsQuestions } from './discriminated-unions';
import { primitiveTypesQuestions } from './primitive-types';
import { typeofNarrowingQuestions } from './typeof-narrowing';
import { unionTypesQuestions } from './union-types';

export const typescriptTrack: TrackSource = {
  id: 'typescript',
  name: 'TypeScript',
  description: 'Static types for JavaScript: annotations, unions, narrowing and more.',
  topics: [
    {
      id: 'ts-types-and-annotations',
      name: 'Types and annotations',
      description: 'The building blocks of the type system.',
      skills: [
        {
          id: 'ts-primitive-types',
          name: 'Primitive types',
          description: 'Annotate and infer `string`, `number`, `boolean`, `null` and `undefined`.',
          questions: primitiveTypesQuestions,
        },
        {
          id: 'ts-union-types',
          name: 'Union and literal types',
          description: 'Combine types with `|` and restrict values with literal types.',
          questions: unionTypesQuestions,
        },
      ],
    },
    {
      id: 'ts-type-narrowing',
      name: 'Type narrowing',
      description: 'Let TypeScript work out a more specific type from your checks.',
      skills: [
        {
          id: 'ts-typeof-narrowing',
          name: 'Narrowing with typeof and truthiness',
          description:
            'Narrow unions with `typeof` checks and truthiness, and avoid their pitfalls.',
          questions: typeofNarrowingQuestions,
        },
        {
          id: 'ts-discriminated-unions',
          name: 'Discriminated unions',
          description: 'Model variants with a shared tag property and handle every case.',
          questions: discriminatedUnionsQuestions,
        },
      ],
    },
  ],
};
