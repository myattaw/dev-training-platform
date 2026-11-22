import type { TrackSource } from '@pracstack/content-model';
import { discriminatedUnionsQuestions } from './discriminated-unions';
import {
  discriminatedFamilies,
  functionTypeFamilies,
  genericFamilies,
  narrowingFamilies,
  objectTypeFamilies,
  primitiveFamilies,
  unionFamilies,
  utilityTypeFamilies,
} from './families';
import { primitiveTypesQuestions } from './primitive-types';
import { typeofNarrowingQuestions } from './typeof-narrowing';
import { unionTypesQuestions } from './union-types';

export const typescriptTrack: TrackSource = {
  id: 'typescript',
  name: 'TypeScript',
  description:
    'Static types for JavaScript: annotations, unions, narrowing, object and function types, generics and utility types.',
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
          questions: [...primitiveTypesQuestions, ...primitiveFamilies],
        },
        {
          id: 'ts-union-types',
          prerequisites: ['ts-primitive-types'],
          name: 'Union and literal types',
          description: 'Combine types with `|` and restrict values with literal types.',
          questions: [...unionTypesQuestions, ...unionFamilies],
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
          prerequisites: ['ts-union-types'],
          name: 'Narrowing with typeof and truthiness',
          description:
            'Narrow unions with `typeof` checks and truthiness, and avoid their pitfalls.',
          questions: [...typeofNarrowingQuestions, ...narrowingFamilies],
        },
        {
          id: 'ts-discriminated-unions',
          prerequisites: ['ts-typeof-narrowing'],
          name: 'Discriminated unions',
          description: 'Model variants with a shared tag property and handle every case.',
          questions: [...discriminatedUnionsQuestions, ...discriminatedFamilies],
        },
      ],
    },
    {
      id: 'ts-objects-and-functions',
      name: 'Objects and functions',
      description: 'Describe the shape of objects and functions.',
      skills: [
        {
          id: 'ts-object-types',
          prerequisites: ['ts-primitive-types'],
          name: 'Interfaces and object types',
          description:
            'Required, optional and readonly properties, index signatures and intersections.',
          questions: objectTypeFamilies,
        },
        {
          id: 'ts-function-types',
          prerequisites: ['ts-primitive-types'],
          name: 'Function types',
          description:
            'Parameter and return types, optional and default parameters, rest parameters and compatibility.',
          questions: functionTypeFamilies,
        },
      ],
    },
    {
      id: 'ts-reusable-types',
      name: 'Reusable types',
      description: 'Write types once and reuse them.',
      skills: [
        {
          id: 'ts-generics',
          prerequisites: ['ts-function-types'],
          name: 'Generics',
          description: 'Type parameters, inference, constraints and `keyof`.',
          questions: genericFamilies,
        },
        {
          id: 'ts-utility-types',
          prerequisites: ['ts-object-types', 'ts-generics'],
          name: 'Utility types',
          description: '`Partial`, `Pick`, `Omit`, `Record`, `ReturnType` and friends.',
          questions: utilityTypeFamilies,
        },
      ],
    },
  ],
};
