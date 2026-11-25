import type { TrackSource } from '@pracstack/content-model';
import {
  classesAdvanced,
  conditionalsAdvanced,
  modulesAdvanced,
  mutabilityAdvanced,
  stringsAdvanced,
  testingAdvanced,
} from './advanced';
import { collectionsFamilies, mutabilityFamilies } from './collections';
import { exceptionsFamilies, iteratorsFamilies } from './errors-iteration';
import { comprehensionsFamilies, controlFlowFamilies, functionsFamilies } from './flow-functions';
import { functionalFamilies } from './functional';
import { conditionalsFamilies, stringsFamilies, typesOperatorsFamilies } from './fundamentals';
import { modulesFamilies, typeHintsFamilies } from './modules-types';
import { classesFamilies, dataclassesFamilies } from './oop';
import { practicalFamilies } from './practical';
import { asyncFamilies, testingFamilies } from './testing-async';

/**
 * Python: modern Python 3.14. Every code question is run by the real CPython 3.14
 * runner (see program-builders.ts and content/src/checks/program-snippets.ts).
 */
export const pythonTrack: TrackSource = {
  id: 'python',
  name: 'Python',
  category: 'languages',
  description:
    'Modern Python 3.14 from types, strings and collections through functions, OOP, exceptions, generators, type hints, testing, asyncio and practical data processing.',
  topics: [
    {
      id: 'py-fundamentals',
      name: 'Python fundamentals',
      description: 'How values, types and operators behave, and how Python decides what is true.',
      skills: [
        {
          id: 'py-types-operators',
          name: 'Variables, types and operators',
          description:
            'Names and objects, numeric types, type conversion, division and modulo, comparisons, precedence and float rounding.',
          objectives: [
            'Predict the result and type of arithmetic with `/`, `//`, `%` and `**`',
            'Convert between strings and numbers and diagnose `ValueError` and `TypeError`',
            'Explain chained comparisons, operator precedence and banker’s rounding',
            'Recognize where `bool` behaves as an `int`',
          ],
          questions: typesOperatorsFamilies,
        },
        {
          id: 'py-conditionals-truthiness',
          prerequisites: ['py-types-operators'],
          name: 'Conditionals, truthiness and identity',
          description:
            '`if`/`elif`, conditional expressions, `match`, truthiness, `and`/`or` values, short-circuiting, `None` and `is` versus `==`.',
          objectives: [
            'Predict which branch runs and which values are truthy',
            'Choose between `is None`, `==` and truthiness tests',
            'Fix bugs caused by `x or default` replacing valid falsy values',
            'Read `match` statements with sequence, mapping and class patterns',
          ],
          questions: [...conditionalsFamilies, ...conditionalsAdvanced],
        },
      ],
    },
    {
      id: 'py-text',
      name: 'Strings',
      description: 'Work with immutable text: slicing, methods, formatting and Unicode.',
      skills: [
        {
          id: 'py-strings',
          prerequisites: ['py-types-operators'],
          name: 'Strings',
          description:
            'Indexing and slicing, immutability, common methods, `split` and `join`, f-string formatting, `strip` pitfalls and Unicode.',
          objectives: [
            'Predict slices with negative indexes and steps',
            'Format numbers and text with f-string format specs',
            'Avoid `strip` and `split` pitfalls with `removesuffix` and explicit separators',
            'Explain why string methods return new strings',
          ],
          questions: [...stringsFamilies, ...stringsAdvanced],
        },
      ],
    },
    {
      id: 'py-collections-topic',
      name: 'Collections',
      description: 'Choose the right built-in collection and avoid surprises from shared mutable objects.',
      skills: [
        {
          id: 'py-collections',
          prerequisites: ['py-types-operators'],
          name: 'Lists, tuples, dicts and sets',
          description:
            'List methods, tuples, set operations, dict lookups and merging, hashability, modifying while iterating and the `collections` module.',
          objectives: [
            'Choose between list, tuple, dict and set for a task',
            'Predict the effect of in-place list methods and dict operations',
            'Fix `KeyError` and unhashable-key errors',
            'Use `Counter`, `defaultdict` and `deque` correctly',
          ],
          questions: collectionsFamilies,
        },
        {
          id: 'py-mutability-copying',
          prerequisites: ['py-collections'],
          name: 'Mutability, aliasing and copying',
          description:
            'Names versus objects, aliasing, argument mutation, shallow and deep copies, `[x] * n`, and `+=` on mutable and immutable values.',
          objectives: [
            'Predict when a change is visible through another name',
            'Choose between assignment, shallow copy and `copy.deepcopy`',
            'Fix functions that unexpectedly mutate their arguments',
            'Explain the tuple-containing-a-list `+=` trap',
          ],
          questions: [...mutabilityFamilies, ...mutabilityAdvanced],
        },
      ],
    },
    {
      id: 'py-control-flow-topic',
      name: 'Control flow',
      description: 'Loop idiomatically and get loop boundaries right.',
      skills: [
        {
          id: 'py-control-flow',
          prerequisites: ['py-conditionals-truthiness'],
          name: 'Loops and iteration tools',
          description:
            '`for` and `while`, `range`, `enumerate`, `zip`, `break`/`continue`, loop `else`, the walrus operator and off-by-one bugs.',
          objectives: [
            'Predict the values produced by `range`, `enumerate` and `zip`',
            'Use `for`/`else` and `break` for searches',
            'Fix off-by-one and non-terminating loops',
            'Detect silent truncation with `zip(strict=True)`',
          ],
          questions: controlFlowFamilies,
        },
      ],
    },
    {
      id: 'py-functions-topic',
      name: 'Functions',
      description: 'Define and call functions: arguments, defaults, scope and lambdas.',
      skills: [
        {
          id: 'py-functions',
          prerequisites: ['py-control-flow'],
          name: 'Functions, arguments and scope',
          description:
            'Return values, positional and keyword arguments, defaults and the mutable default pitfall, `*args`/`**kwargs`, keyword-only and positional-only parameters, LEGB scope, `global`/`nonlocal` and `lambda`.',
          objectives: [
            'Predict how arguments bind to a function signature',
            'Fix the mutable default argument bug with a `None` sentinel',
            'Diagnose `UnboundLocalError` and choose `global` or `nonlocal`',
            'Design signatures with keyword-only and positional-only parameters',
          ],
          questions: functionsFamilies,
        },
      ],
    },
    {
      id: 'py-comprehensions-topic',
      name: 'Comprehensions',
      description: 'Build lists, dicts and sets declaratively, and know when to stay lazy.',
      skills: [
        {
          id: 'py-comprehensions',
          prerequisites: ['py-control-flow'],
          name: 'Comprehensions and generator expressions',
          description:
            'List, dict and set comprehensions, filtering versus transforming, nested comprehensions, scope rules and generator expressions.',
          objectives: [
            'Translate loops into equivalent comprehensions, and recognize when not to',
            'Predict the order of nested comprehension clauses',
            'Choose between a list comprehension and a lazy generator expression',
            'Explain comprehension scope, including the class-body pitfall',
          ],
          questions: comprehensionsFamilies,
        },
      ],
    },
    {
      id: 'py-oop',
      name: 'Object-oriented programming',
      description: 'Model data and behavior with classes, dataclasses and special methods.',
      skills: [
        {
          id: 'py-classes',
          prerequisites: ['py-functions'],
          name: 'Classes, inheritance and properties',
          description:
            '`__init__` and `self`, instance versus class attributes, instance/class/static methods, inheritance and `super()`, properties, composition and the MRO.',
          objectives: [
            'Predict attribute lookup on instances and classes',
            'Choose between instance, class and static methods',
            'Fix missing `self` and missing `super().__init__` bugs',
            'Prefer composition where inheritance exposes too much',
          ],
          questions: [...classesFamilies, ...classesAdvanced],
        },
        {
          id: 'py-dataclasses-dunders',
          prerequisites: ['py-classes'],
          name: 'Dataclasses and dunder methods',
          description:
            '`@dataclass` with defaults, `default_factory`, `frozen`, `order` and `__post_init__`; `__repr__`, `__str__`, `__eq__`, `__hash__` and operator methods.',
          objectives: [
            'Define dataclasses with safe defaults and the right options',
            'Explain how `__eq__` and `__hash__` must agree',
            'Implement `__repr__`, operators and ordering for a value type',
            'Diagnose dataclass definition errors',
          ],
          questions: dataclassesFamilies,
        },
      ],
    },
    {
      id: 'py-exceptions-topic',
      name: 'Exceptions and resource management',
      description: 'Handle failures deliberately and always clean up.',
      skills: [
        {
          id: 'py-exceptions',
          prerequisites: ['py-functions'],
          name: 'Exceptions and context managers',
          description:
            '`try`/`except`/`else`/`finally`, handler order, custom exceptions, chaining with `from`, exception groups and context managers with `with` and `contextlib`.',
          objectives: [
            'Predict the execution order of `try`, `except`, `else` and `finally`',
            'Design custom exception hierarchies and chain exceptions with `from`',
            'Replace overbroad handlers with specific ones',
            'Write context managers that clean up even on errors',
          ],
          questions: exceptionsFamilies,
        },
      ],
    },
    {
      id: 'py-iteration',
      name: 'Iterators and generators',
      description: 'Produce and consume values lazily.',
      skills: [
        {
          id: 'py-iterators-generators',
          prerequisites: ['py-comprehensions'],
          name: 'Iterators and generators',
          description:
            'Iterables versus iterators, generator functions and `yield`, lazy evaluation, exhaustion bugs, `yield from`, custom iterators and `itertools`.',
          objectives: [
            'Explain the difference between an iterable and an iterator',
            'Predict when generator code runs',
            'Fix bugs caused by consuming an iterator twice',
            'Use `itertools` tools such as `islice`, `chain`, `batched` and `groupby` correctly',
          ],
          questions: iteratorsFamilies,
        },
      ],
    },
    {
      id: 'py-modules',
      name: 'Modules and packages',
      description: 'Organize code into modules and packages and manage dependencies.',
      skills: [
        {
          id: 'py-modules-packages',
          prerequisites: ['py-functions'],
          name: 'Modules, packages and environments',
          description:
            'Import forms, `__name__ == "__main__"`, module caching, packages and relative imports, circular imports, virtual environments, pinning and entry points.',
          objectives: [
            'Predict what runs when a module is imported',
            'Diagnose `ImportError`, `ModuleNotFoundError` and circular imports',
            'Explain why `from module import name` copies a binding',
            'Choose practices for environments, pinning and entry points',
          ],
          questions: [...modulesFamilies, ...modulesAdvanced],
        },
      ],
    },
    {
      id: 'py-typing',
      name: 'Type hints',
      description: 'Document and check types with annotations, without expecting run-time enforcement.',
      skills: [
        {
          id: 'py-type-hints',
          prerequisites: ['py-functions'],
          name: 'Type hints',
          description:
            'Annotations, `X | None`, collection types, generics with the 3.12+ syntax, `type` aliases, deferred annotations in 3.14, and static versus run-time checking.',
          objectives: [
            'Annotate functions with collection, optional and generic types',
            'Explain that the interpreter does not enforce hints',
            'Narrow optional values before using them',
            'Use type parameter syntax and `type` aliases',
          ],
          questions: typeHintsFamilies,
        },
      ],
    },
    {
      id: 'py-functional-topic',
      name: 'Functional programming',
      description: 'Pass functions around, close over state and wrap behavior with decorators.',
      skills: [
        {
          id: 'py-functional',
          prerequisites: ['py-functions'],
          name: 'Higher-order functions, closures and decorators',
          description:
            'Functions as values, `map`/`filter`, sort keys, closures and late binding, decorators, `functools.wraps`, decorator factories and `functools` tools.',
          objectives: [
            'Sort records by several keys with `key` functions',
            'Predict closure behavior, including late binding in loops',
            'Write decorators that preserve signatures and metadata',
            'Diagnose decorator wiring mistakes',
          ],
          questions: functionalFamilies,
        },
      ],
    },
    {
      id: 'py-testing',
      name: 'Testing and debugging',
      description: 'Verify behavior with tests and mocks, and read tracebacks to find bugs.',
      skills: [
        {
          id: 'py-testing-debugging',
          prerequisites: ['py-functions', 'py-classes'],
          name: 'Testing and debugging',
          description:
            '`assert`, `unittest` test cases and assertions, `setUp` and fixtures, `unittest.mock` with `patch` and autospec, and reading tracebacks.',
          objectives: [
            'Write `unittest` tests with the right assertion methods',
            'Keep tests isolated with `setUp` and fixtures',
            'Patch dependencies where they are looked up, using autospec',
            'Find the cause of a bug from its traceback',
          ],
          questions: [...testingFamilies, ...testingAdvanced],
        },
      ],
    },
    {
      id: 'py-async-topic',
      name: 'Async programming',
      description: 'Run I/O-bound work concurrently with asyncio.',
      skills: [
        {
          id: 'py-async',
          prerequisites: ['py-functions', 'py-exceptions'],
          name: 'async/await and asyncio',
          description:
            'Coroutines, `await`, `asyncio.run`, `gather`, `TaskGroup`, tasks and interleaving, timeouts, semaphores, async generators, and blocking versus non-blocking calls.',
          objectives: [
            'Predict the order in which coroutines and tasks run',
            'Fix missing `await` and nested `asyncio.run` bugs',
            'Keep the event loop responsive by avoiding blocking calls',
            'Use `TaskGroup`, timeouts and semaphores for structured concurrency',
          ],
          questions: asyncFamilies,
        },
      ],
    },
    {
      id: 'py-practical',
      name: 'Practical Python',
      description: 'Process real business data reliably.',
      skills: [
        {
          id: 'py-practical-data',
          prerequisites: ['py-collections', 'py-exceptions'],
          name: 'Data processing and validation',
          description:
            'JSON and CSV processing, text files, validation, grouping and aggregation, `Decimal` for money and defensive handling of external input.',
          objectives: [
            'Convert data between JSON, CSV and Python objects without losing information',
            'Compute money with `Decimal` and explicit rounding',
            'Group and aggregate records for reports',
            'Validate external input and report every problem clearly',
          ],
          questions: practicalFamilies,
        },
      ],
    },
  ],
};
