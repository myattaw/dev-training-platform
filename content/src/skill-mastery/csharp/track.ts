import type { TrackSource } from '@pracstack/content-model';
import { nullableFamilies, patternMatchingFamilies, valueReferenceFamilies } from './fundamentals';

/**
 * C#: modern C# 14 on .NET 10. Every code question is compiled (and run where it is a
 * program) by the real C# runner; see builders.ts and content/src/checks/csharp-snippets.ts.
 * The planned topics are listed in docs/skill-mastery-curriculum.md.
 */
export const csharpTrack: TrackSource = {
  id: 'csharp',
  name: 'C#',
  description:
    'Modern C# on .NET 10: value and reference semantics, nullable types, pattern matching, collections, OOP, LINQ, exceptions and async.',
  topics: [
    {
      id: 'cs-fundamentals',
      name: 'C# fundamentals',
      description:
        'How values, references and null behave, and how to branch on the shape of data.',
      skills: [
        {
          id: 'cs-value-reference-types',
          name: 'Value and reference types',
          description:
            'Structs and classes, copying, parameter passing, `ref`, equality, boxing and default values.',
          questions: valueReferenceFamilies,
        },
        {
          id: 'cs-nullable-types',
          prerequisites: ['cs-value-reference-types'],
          name: 'Nullable types and null operators',
          description:
            '`int?`, nullable reference types, `??`, `??=`, `?.`, `!`, lifted operators and `T?` in generics.',
          questions: nullableFamilies,
        },
        {
          id: 'cs-pattern-matching',
          prerequisites: ['cs-nullable-types'],
          name: 'Pattern matching and switch expressions',
          description:
            'Switch expressions, type, relational, property, logical and list patterns, and exhaustiveness.',
          questions: patternMatchingFamilies,
        },
      ],
    },
  ],
};
