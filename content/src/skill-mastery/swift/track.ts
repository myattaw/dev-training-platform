import type { TrackSource } from '@pracstack/content-model';
import {
  collectionsAdvancedFamilies,
  controlFlowAdvancedFamilies,
  functionsAdvancedFamilies,
  genericsAdvancedFamilies,
  stringsAdvancedFamilies,
} from './advanced';
import { concurrencyFamilies, testingFamilies } from './concurrency-testing';
import { errorsFamilies, memoryFamilies } from './errors-memory';
import { closuresFamilies, controlFlowFamilies, functionsFamilies } from './flow-functions';
import { basicsFamilies, stringsFamilies } from './fundamentals';
import { collectionsFamilies, optionalsFamilies } from './optionals-collections';
import {
  enumsFamilies,
  genericsFamilies,
  protocolsFamilies,
  structsClassesFamilies,
} from './types';

/**
 * Swift: the Swift 6 language on Linux (swift-corelibs-foundation). Every code
 * question is compiled and run by the real Swift runner; see
 * content/src/checks/program-snippets.ts. Apple UI frameworks (SwiftUI, UIKit)
 * are out of scope.
 */
export const swiftTrack: TrackSource = {
  id: 'swift',
  name: 'Swift',
  category: 'languages',
  description:
    'The Swift 6 language itself, compiled and run on Linux: types, optionals, collections, closures, protocols, generics, errors, memory management and concurrency, not SwiftUI or iOS app development.',
  topics: [
    {
      id: 'swift-fundamentals',
      name: 'Swift fundamentals',
      description: 'Constants, variables, numeric types, operators, strings and characters.',
      skills: [
        {
          id: 'swift-basics',
          name: 'Constants, variables and types',
          description:
            '`let` and `var`, type inference and annotations, numeric types and conversions, integer division and overflow.',
          objectives: [
            'Choose between `let` and `var` and predict which mutations compile.',
            'Convert explicitly between numeric types and predict truncation.',
            'Predict integer division, remainders and floating-point results.',
            'Diagnose overflow traps and choose the wrapping operators when wrapping is intended.',
          ],
          questions: basicsFamilies,
        },
        {
          id: 'swift-strings',
          prerequisites: ['swift-basics'],
          name: 'Strings and characters',
          description:
            'String interpolation, `Character` versus `String`, `String.Index`, Unicode-correct counting and `Substring`.',
          objectives: [
            'Build strings with interpolation and multi-line literals.',
            'Access characters with `String.Index` instead of integer subscripts.',
            'Predict `count` for accented characters and emoji.',
            'Convert between `Substring`, `Character` and `String` where the compiler requires it.',
          ],
          questions: [...stringsFamilies, ...stringsAdvancedFamilies],
        },
      ],
    },
    {
      id: 'swift-optionals-topic',
      name: 'Optionals',
      description: 'Represent missing values safely and unwrap them without crashing.',
      skills: [
        {
          id: 'swift-optionals',
          prerequisites: ['swift-basics'],
          name: 'Optionals',
          description:
            '`if let`, `guard let`, nil coalescing, optional chaining, `map`/`flatMap` on Optionals, force unwrapping and implicitly unwrapped optionals.',
          objectives: [
            'Unwrap Optionals with `if let`, `guard let` and `??` instead of `!`.',
            'Predict the type and value of optional chains.',
            'Diagnose force-unwrap crashes and choose a safe fix.',
            'Recognize double Optionals and implicitly unwrapped optionals.',
          ],
          questions: optionalsFamilies,
        },
      ],
    },
    {
      id: 'swift-collections-topic',
      name: 'Collections',
      description: 'Arrays, dictionaries and sets, and how their value semantics work.',
      skills: [
        {
          id: 'swift-collections',
          prerequisites: ['swift-optionals'],
          name: 'Arrays, dictionaries and sets',
          description:
            'Creating and changing collections, Optional lookups and `default:`, set algebra, value semantics, ordering and index safety.',
          objectives: [
            'Predict the result of array, dictionary and set operations.',
            'Explain why `let` collections cannot change and how copies behave.',
            'Fix out-of-range and empty-collection crashes.',
            'Produce stable output from unordered dictionaries and sets.',
          ],
          questions: [...collectionsFamilies, ...collectionsAdvancedFamilies],
        },
      ],
    },
    {
      id: 'swift-control-flow-topic',
      name: 'Control flow',
      description: 'Branch, loop and match patterns the Swift way.',
      skills: [
        {
          id: 'swift-control-flow',
          prerequisites: ['swift-basics'],
          name: 'Control flow and pattern matching',
          description:
            'Exhaustive `switch` with ranges, tuples and `where`, `fallthrough`, loops and labels, ranges and `stride`, and `if case`/`for case` patterns.',
          objectives: [
            'Predict which `switch` case runs, including tuples, ranges and `where` clauses.',
            'Write exhaustive `switch` statements the compiler accepts.',
            'Choose the right range or `stride` for a loop.',
            'Fix case-ordering bugs and use labeled `break`/`continue`.',
          ],
          questions: [...controlFlowFamilies, ...controlFlowAdvancedFamilies],
        },
      ],
    },
    {
      id: 'swift-functions-closures',
      name: 'Functions and closures',
      description: 'Declare and call functions, and pass behavior around as closures.',
      skills: [
        {
          id: 'swift-functions',
          prerequisites: ['swift-control-flow'],
          name: 'Functions',
          description:
            'Argument labels, default and variadic parameters, `inout`, exclusive access, function types and nested functions.',
          objectives: [
            'Call functions with the right argument labels.',
            'Use default, variadic and `inout` parameters correctly.',
            'Explain why value-type parameters are copies and fix code that relies on mutation.',
            'Store, pass and return functions as values.',
          ],
          questions: [...functionsFamilies, ...functionsAdvancedFamilies],
        },
        {
          id: 'swift-closures',
          prerequisites: ['swift-functions', 'swift-collections'],
          name: 'Closures and higher-order functions',
          description:
            'Closure syntax, trailing closures, `map`/`filter`/`reduce`/`compactMap`/`flatMap`, capturing, capture lists, `@escaping` and lazy sequences.',
          objectives: [
            'Read and write closures in full and shorthand syntax.',
            'Transform collections with `map`, `filter`, `reduce`, `compactMap` and `flatMap`.',
            'Predict what a closure captures and when a capture list changes it.',
            'Decide when a closure parameter must be `@escaping`.',
          ],
          questions: closuresFamilies,
        },
      ],
    },
    {
      id: 'swift-types-topic',
      name: 'Structs, classes and enumerations',
      description: 'Model data with value types, reference types and enums.',
      skills: [
        {
          id: 'swift-structs-classes',
          prerequisites: ['swift-functions'],
          name: 'Structs and classes',
          description:
            'Value versus reference semantics, initializers, `mutating` methods, stored, computed and lazy properties, observers, identity and inheritance.',
          objectives: [
            'Predict how struct and class values behave when copied and passed.',
            'Write initializers the compiler accepts, including convenience and subclass initializers.',
            'Fix code that changes a copy instead of the stored value.',
            'Use computed, lazy and observed properties and know when observers run.',
          ],
          questions: structsClassesFamilies,
        },
        {
          id: 'swift-enums',
          prerequisites: ['swift-control-flow'],
          name: 'Enumerations',
          description:
            'Raw values, associated values, exhaustive switches, `CaseIterable`, methods on enums, recursive enums and modeling application states.',
          objectives: [
            'Choose raw values or associated values for a model.',
            'Extract associated values with `switch`, `if case` and `for case`.',
            'Model states such as loading, loaded and failed so invalid combinations cannot exist.',
            'Handle failable `init(rawValue:)` safely.',
          ],
          questions: enumsFamilies,
        },
      ],
    },
    {
      id: 'swift-abstraction',
      name: 'Protocols and generics',
      description: 'Write code that works across many types without giving up type safety.',
      skills: [
        {
          id: 'swift-protocols',
          prerequisites: ['swift-structs-classes'],
          name: 'Protocols',
          description:
            'Requirements and conformance, protocol extensions and default implementations, synthesized `Equatable`/`Hashable`/`Comparable`, `some` versus `any`, and protocol-oriented design.',
          objectives: [
            'Make types conform to protocols and fix conformance errors.',
            'Provide default behavior with protocol extensions and predict which implementation runs.',
            'Rely on synthesized conformances and implement `Comparable` and `Hashable` correctly.',
            'Choose between `some` and `any`.',
          ],
          questions: protocolsFamilies,
        },
        {
          id: 'swift-generics',
          prerequisites: ['swift-protocols'],
          name: 'Generics',
          description:
            'Generic functions and types, constraints and `where` clauses, constrained extensions, associated types and overload resolution.',
          objectives: [
            'Write generic functions and types with the constraints their bodies need.',
            'Fix "requires that T conform to" compile errors.',
            'Use associated types and constrained extensions.',
            'Predict which overload a generic call site selects.',
          ],
          questions: [...genericsFamilies, ...genericsAdvancedFamilies],
        },
      ],
    },
    {
      id: 'swift-errors-topic',
      name: 'Error handling',
      description: 'Throw, propagate and handle errors explicitly.',
      skills: [
        {
          id: 'swift-error-handling',
          prerequisites: ['swift-enums'],
          name: 'Error handling',
          description:
            'Throwing functions, `do`/`catch`, `try`, `try?` and `try!`, custom error types, typed throws, `Result` and `defer`.',
          objectives: [
            'Throw and catch custom errors, matching specific cases.',
            'Choose between `try`, `try?` and `try!` and predict their results.',
            'Use typed throws and `Result` to make error types explicit.',
            'Predict when `defer` blocks run.',
          ],
          questions: errorsFamilies,
        },
      ],
    },
    {
      id: 'swift-memory-topic',
      name: 'Memory management',
      description: 'How ARC keeps objects alive, and how to avoid leaks.',
      skills: [
        {
          id: 'swift-memory',
          prerequisites: ['swift-structs-classes', 'swift-closures'],
          name: 'ARC and reference cycles',
          description:
            'Automatic reference counting, `deinit`, strong, `weak` and `unowned` references, retain cycles and closure capture lists.',
          objectives: [
            'Predict when ARC frees an object and runs `deinit`.',
            'Find retain cycles between objects and between objects and closures.',
            'Break cycles with `weak`, `unowned` and `[weak self]`.',
            'Diagnose crashes from `unowned` references that outlive their object.',
          ],
          questions: memoryFamilies,
        },
      ],
    },
    {
      id: 'swift-concurrency-topic',
      name: 'Swift concurrency',
      description: 'Structured concurrency, actors and data-race safety.',
      skills: [
        {
          id: 'swift-concurrency',
          prerequisites: ['swift-error-handling', 'swift-closures'],
          name: 'async/await, tasks and actors',
          description:
            '`async`/`await`, `Task`, `async let`, task groups, cancellation, actors and isolation, reentrancy, and `Sendable` in the Swift 6 language mode.',
          objectives: [
            'Call async functions correctly and predict the order of awaited work.',
            'Run child tasks concurrently with `async let` and task groups and keep results deterministic.',
            'Protect shared state with actors and explain actor reentrancy.',
            'Explain the data-race errors the Swift 6 language mode reports and choose a fix.',
          ],
          questions: concurrencyFamilies,
        },
      ],
    },
    {
      id: 'swift-testing-topic',
      name: 'Testing and debugging',
      description: 'Design testable code, read diagnostics and use runtime checks well.',
      skills: [
        {
          id: 'swift-testing-debugging',
          prerequisites: ['swift-protocols', 'swift-error-handling'],
          name: 'Testing and debugging',
          description:
            'Testable business logic, dependency injection through protocols, `assert`/`precondition`/`fatalError`, compiler diagnostics, choosing test cases, and the Swift Testing and XCTest frameworks.',
          objectives: [
            'Refactor logic into pure, injectable code that is easy to test.',
            'Choose between `assert`, `precondition`, `fatalError` and thrown errors.',
            'Fix common compiler diagnostics such as unwrapping and definite-initialization errors.',
            'Pick boundary test cases and recognize Swift Testing and XCTest tests.',
          ],
          questions: testingFamilies,
        },
      ],
    },
  ],
};
