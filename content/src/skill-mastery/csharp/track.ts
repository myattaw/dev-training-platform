import type { TrackSource } from '@pracstack/content-model';
import { asyncFamilies, delegatesFamilies, genericsMethodsFamilies } from './async-generics';
import { collectionsFamilies, oopFamilies, recordsImmutabilityFamilies } from './collections-oop';
import { nullableFamilies, patternMatchingFamilies, valueReferenceFamilies } from './fundamentals';
import { exceptionsFamilies, linqBasicsFamilies, linqExecutionFamilies } from './linq-exceptions';

/**
 * C#: modern C# 14 on .NET 10. Every code question is compiled (and run where it is a
 * program) by the real C# runner; see builders.ts and content/src/checks/csharp-snippets.ts.
 * Topics not yet written (testing and maintainability) are listed in
 * docs/skill-mastery-curriculum.md; they are not shown until they exist.
 */
export const csharpTrack: TrackSource = {
  id: 'csharp',
  name: 'C#',
  category: 'languages',
  description:
    'Modern C# on .NET 10: value and reference semantics, nullable types, pattern matching, collections, OOP, LINQ, exceptions, generics, delegates and async.',
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
    {
      id: 'cs-collections-topic',
      name: 'Collections',
      description: 'Choose the right collection and use it without surprises.',
      skills: [
        {
          id: 'cs-collections',
          prerequisites: ['cs-value-reference-types'],
          name: 'Collections',
          description:
            'Arrays, `List<T>`, `Dictionary<TKey, TValue>`, `HashSet<T>`, `Queue<T>`, `Stack<T>`, collection interfaces, sorting and complexity.',
          questions: collectionsFamilies,
        },
      ],
    },
    {
      id: 'cs-object-oriented',
      name: 'Object-oriented programming',
      description: 'Model data and behaviour with classes, interfaces and records.',
      skills: [
        {
          id: 'cs-oop',
          prerequisites: ['cs-value-reference-types'],
          name: 'Classes, interfaces and inheritance',
          description:
            'Constructors, properties, access modifiers, interfaces, abstract classes, `virtual`/`override` versus `new`, and composition.',
          questions: oopFamilies,
        },
        {
          id: 'cs-records-immutability',
          prerequisites: ['cs-oop'],
          name: 'Records, structs and immutability',
          description:
            'Record classes and structs, `with` expressions, value equality, init-only properties and shallow immutability.',
          questions: recordsImmutabilityFamilies,
        },
      ],
    },
    {
      id: 'cs-methods-generics',
      name: 'Methods, generics and delegates',
      description: 'Write reusable methods and pass behaviour around.',
      skills: [
        {
          id: 'cs-generics-methods',
          prerequisites: ['cs-oop'],
          name: 'Methods and generics',
          description:
            'Optional and named arguments, overloading, `ref`/`out`/`in`, generic methods and classes, constraints and extension methods.',
          questions: genericsMethodsFamilies,
        },
        {
          id: 'cs-delegates-events',
          prerequisites: ['cs-generics-methods'],
          name: 'Delegates, lambdas and events',
          description:
            '`Func`, `Action`, `Predicate`, closures, multicast delegates, events and `EventHandler<T>`.',
          questions: delegatesFamilies,
        },
      ],
    },
    {
      id: 'cs-linq-topic',
      name: 'LINQ',
      description: 'Query collections declaratively, and know when the query runs.',
      skills: [
        {
          id: 'cs-linq',
          prerequisites: ['cs-collections', 'cs-delegates-events'],
          name: 'LINQ queries',
          description:
            '`Where`, `Select`, `SelectMany`, ordering, grouping, joins, element operators and aggregates.',
          questions: linqBasicsFamilies,
        },
        {
          id: 'cs-linq-execution',
          prerequisites: ['cs-linq'],
          name: 'Deferred execution and LINQ performance',
          description:
            'When queries run, multiple enumeration, materialisation, captured variables and common performance mistakes.',
          questions: linqExecutionFamilies,
        },
      ],
    },
    {
      id: 'cs-errors-async',
      name: 'Exceptions and asynchronous code',
      description: 'Handle failure, release resources, and write correct async code.',
      skills: [
        {
          id: 'cs-exceptions',
          prerequisites: ['cs-oop'],
          name: 'Exceptions and resource cleanup',
          description:
            '`try`/`catch`/`finally`, exception filters, rethrowing, custom exceptions, `using` and `IDisposable`.',
          questions: exceptionsFamilies,
        },
        {
          id: 'cs-async',
          prerequisites: ['cs-exceptions'],
          name: 'async and await',
          description:
            '`Task`, `async`/`await`, `Task.WhenAll`/`WhenAny`, cancellation, exception propagation and blocking pitfalls.',
          questions: asyncFamilies,
        },
      ],
    },
  ],
};
