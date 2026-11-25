import type { TrackSource } from '@pracstack/content-model';
import { collectionsFamilies, genericsFamilies } from './collections-generics';
import { concurrencyFamilies } from './concurrency';
import { enterpriseDesignFamilies, jsonValidationFamilies } from './enterprise';
import { exceptionsFamilies } from './exceptions';
import { equalityControlFamilies, typesOperatorsFamilies } from './fundamentals';
import { lambdasFamilies, optionalFamilies, streamsFamilies } from './functional';
import { patternMatchingFamilies, recordsEnumsFamilies } from './modern';
import { classesObjectsFamilies, inheritanceInterfacesFamilies, polymorphismFamilies } from './oop';
import { stringsArraysFamilies } from './strings-arrays';
import { testingFamilies } from './testing';

/**
 * Java: modern Java 21 (LTS). Every code question is compiled (and run where it is a
 * program) on the real JDK 21 runner; see ../program-builders.ts.
 */
export const javaTrack: TrackSource = {
  id: 'java',
  name: 'Java',
  category: 'languages',
  description:
    'Modern Java 21 (LTS) from the fundamentals to records, pattern matching, streams, testing, concurrency and the enterprise building blocks that prepare you for Spring Boot.',
  topics: [
    {
      id: 'java-fundamentals',
      name: 'Java fundamentals',
      description: 'Primitive types, operators, conversions, equality, null and control flow.',
      skills: [
        {
          id: 'java-types-operators',
          name: 'Primitive types, operators and conversions',
          description:
            'Integer division, overflow, compound assignment, widening and narrowing conversions, casts and floating-point pitfalls.',
          objectives: [
            'Predict the result of integer division, remainders and overflow.',
            'Explain when a conversion is implicit and when it needs a cast.',
            'Spot precision loss in casts, widening conversions and `double` money values.',
            'Diagnose `ArithmeticException` and `NumberFormatException` failures.',
          ],
          questions: typesOperatorsFamilies,
        },
        {
          id: 'java-equality-control-flow',
          prerequisites: ['java-types-operators'],
          name: 'Equality, null and control flow',
          description:
            '`==` versus `equals`, wrapper caching, `null` and unboxing, short-circuit operators, `switch` statements and loops.',
          objectives: [
            'Choose between `==`, `equals` and `Objects.equals` for a comparison.',
            'Predict the behavior of loops, labeled `break`/`continue` and `switch` fall-through.',
            'Find the null dereference or unboxing behind a `NullPointerException`.',
          ],
          questions: equalityControlFamilies,
        },
      ],
    },
    {
      id: 'java-strings-arrays-topic',
      name: 'Strings and arrays',
      description:
        'Immutable strings, string building and comparison, arrays and the `Arrays` utilities.',
      skills: [
        {
          id: 'java-strings-arrays',
          prerequisites: ['java-equality-control-flow'],
          name: 'Strings, StringBuilder and arrays',
          description:
            'String immutability and equality, common `String` methods, `StringBuilder`, arrays, multidimensional arrays and `java.util.Arrays`.',
          objectives: [
            'Predict the result of `String` methods, knowing strings never change.',
            'Compare strings correctly and explain why `==` sometimes seems to work.',
            'Build strings efficiently with `StringBuilder` or `String.join`.',
            'Use arrays, multidimensional arrays and `Arrays` utilities without index or copy bugs.',
          ],
          questions: stringsArraysFamilies,
        },
      ],
    },
    {
      id: 'java-oop',
      name: 'Classes and object-oriented programming',
      description:
        'Model business objects with classes, inheritance, interfaces, composition and polymorphism.',
      skills: [
        {
          id: 'java-classes-objects',
          prerequisites: ['java-equality-control-flow'],
          name: 'Classes, constructors and encapsulation',
          description:
            'Fields, methods, constructors and `this(...)` chaining, static members, access modifiers, pass-by-value and encapsulation.',
          objectives: [
            'Write constructors that chain with `this(...)` and initialize every `final` field.',
            'Predict how static and instance members behave across objects.',
            'Explain why Java is always pass-by-value, even for objects.',
            'Fix encapsulation leaks with defensive copies and unmodifiable views.',
          ],
          questions: classesObjectsFamilies,
        },
        {
          id: 'java-inheritance-interfaces',
          prerequisites: ['java-classes-objects'],
          name: 'Inheritance, abstract classes and interfaces',
          description:
            'Superclass constructors, abstract classes, interfaces with default and static methods, and composition over inheritance.',
          objectives: [
            'Predict constructor order across a class hierarchy.',
            'Resolve default method conflicts and know what interfaces can contain.',
            'Choose between an interface, an abstract class and composition.',
            'Recognize fragile base class problems and unsafe downcasts.',
          ],
          questions: inheritanceInterfacesFamilies,
        },
        {
          id: 'java-polymorphism',
          prerequisites: ['java-inheritance-interfaces'],
          name: 'Polymorphism, overriding and overloading',
          description:
            'Dynamic dispatch, static overload resolution, override rules, hiding of fields and static methods, and overridable calls in constructors.',
          objectives: [
            'Predict which method runs: overload resolution at compile time, overriding at run time.',
            'Apply the rules for valid overrides and use `@Override` to catch mistakes.',
            'Spot overloaded `equals` and other overloads that were meant to be overrides.',
            'Explain why constructors must not call overridable methods.',
          ],
          questions: polymorphismFamilies,
        },
      ],
    },
    {
      id: 'java-collections-generics',
      name: 'Collections and generics',
      description:
        'Choose and use lists, sets, maps and queues correctly, and write type-safe generic code.',
      skills: [
        {
          id: 'java-collections',
          prerequisites: ['java-classes-objects'],
          name: 'Lists, sets, maps and queues',
          description:
            '`ArrayList`, `HashSet`/`LinkedHashSet`/`TreeSet`, `HashMap`/`LinkedHashMap`/`TreeMap`, `ArrayDeque`, the `equals`/`hashCode` contract, fail-fast iteration and unmodifiable collections.',
          objectives: [
            'Choose the collection that fits the required uniqueness, order and access pattern.',
            'Use map operations such as `merge`, `computeIfAbsent` and `TreeMap` navigation.',
            'Explain the `equals`/`hashCode` contract and the danger of mutable keys.',
            'Fix `ConcurrentModificationException` and `UnsupportedOperationException` failures.',
          ],
          questions: collectionsFamilies,
        },
        {
          id: 'java-generics',
          prerequisites: ['java-collections'],
          name: 'Generics',
          description:
            'Generic classes, records and methods, bounded type parameters, wildcards and PECS, raw types and type erasure.',
          objectives: [
            'Write generic classes and methods with the right type parameters and bounds.',
            'Apply PECS: `? extends` for producers, `? super` for consumers.',
            'Explain why `List<Integer>` is not a `List<Number>`.',
            'Predict what type erasure forbids and where raw types cause failures.',
          ],
          questions: genericsFamilies,
        },
      ],
    },
    {
      id: 'java-exceptions-topic',
      name: 'Exceptions',
      description: 'Throw, catch, translate and debug exceptions, and close resources reliably.',
      skills: [
        {
          id: 'java-exceptions',
          prerequisites: ['java-inheritance-interfaces'],
          name: 'Exceptions and resource handling',
          description:
            'Checked and unchecked exceptions, `try`/`catch`/`finally`, custom exceptions and causes, try-with-resources and suppressed exceptions.',
          objectives: [
            'Decide between checked and unchecked exceptions and satisfy the compiler’s rules.',
            'Predict the control flow of `try`, `catch`, `finally` and `return`.',
            'Use try-with-resources and explain close order and suppressed exceptions.',
            'Find the root cause of a failure in a chain of wrapped exceptions.',
          ],
          questions: exceptionsFamilies,
        },
      ],
    },
    {
      id: 'java-modern',
      name: 'Modern Java',
      description:
        'Records, enums, `var`, text blocks, switch expressions, pattern matching and sealed types (Java 21).',
      skills: [
        {
          id: 'java-records-enums',
          prerequisites: ['java-classes-objects'],
          name: 'Records, enums, var and text blocks',
          description:
            'Records with compact constructors and validation, enums with fields and behavior, local variable type inference and text blocks.',
          objectives: [
            'Model immutable value objects with records and validate them in compact constructors.',
            'Use enums with fields, methods and constant-specific behavior.',
            'Predict what `var` infers and where it is not allowed.',
            'Write text blocks and predict their indentation and line breaks.',
          ],
          questions: recordsEnumsFamilies,
        },
        {
          id: 'java-pattern-matching',
          prerequisites: ['java-records-enums', 'java-polymorphism'],
          name: 'Switch expressions, pattern matching and sealed types',
          description:
            'Switch expressions, `instanceof` patterns, record patterns, guarded cases, `case null`, sealed hierarchies and exhaustiveness.',
          objectives: [
            'Write switch expressions with arrows, multiple labels and `yield`.',
            'Deconstruct records with type, record and nested patterns.',
            'Model alternatives with sealed interfaces and rely on exhaustive switches.',
            'Order guarded cases correctly and handle `null` explicitly.',
          ],
          questions: patternMatchingFamilies,
        },
      ],
    },
    {
      id: 'java-functional',
      name: 'Functional programming',
      description: 'Lambdas, functional interfaces, method references, streams and `Optional`.',
      skills: [
        {
          id: 'java-lambdas',
          prerequisites: ['java-generics'],
          name: 'Lambdas and functional interfaces',
          description:
            '`Predicate`, `Function`, `Consumer`, `Supplier`, `BiFunction` and `UnaryOperator`, composition, method references, captures and comparators.',
          objectives: [
            'Choose the functional interface that matches a lambda’s inputs and output.',
            'Compose functions and predicates with `andThen`, `compose`, `and` and `negate`.',
            'Use the four kinds of method references.',
            'Explain effectively-final captures and checked exceptions in lambdas.',
          ],
          questions: lambdasFamilies,
        },
        {
          id: 'java-streams',
          prerequisites: ['java-lambdas', 'java-collections'],
          name: 'Streams and collectors',
          description:
            '`filter`/`map`/`reduce`/`collect`, `flatMap`, sorting with comparators, `groupingBy`, `toMap`, laziness, short-circuiting and common stream mistakes.',
          objectives: [
            'Build stream pipelines that filter, transform, sort and aggregate data.',
            'Group and summarize data with `groupingBy`, `partitioningBy` and `toMap`.',
            'Predict evaluation order, laziness and short-circuiting.',
            'Fix duplicate-key, reused-stream and side-effect bugs.',
          ],
          questions: streamsFamilies,
        },
        {
          id: 'java-optional',
          prerequisites: ['java-lambdas'],
          name: 'Optional',
          description:
            'Creating optionals, `map`/`flatMap`/`filter`, `orElse` versus `orElseGet`, `orElseThrow`, and where `Optional` should and should not be used.',
          objectives: [
            'Create and transform optionals without calling `get()`.',
            'Explain why `orElse` evaluates its argument eagerly and when to use `orElseGet`.',
            'Use `Optional` as a return type and avoid it for fields, parameters and collections.',
          ],
          questions: optionalFamilies,
        },
      ],
    },
    {
      id: 'java-testing-topic',
      name: 'Testing',
      description: 'Unit tests with JUnit 5, AssertJ, parameterized tests and Mockito.',
      skills: [
        {
          id: 'java-testing',
          prerequisites: ['java-exceptions', 'java-lambdas'],
          name: 'Unit testing with JUnit 5, AssertJ and Mockito',
          description:
            'Writing and organizing JUnit 5 tests, assertions, AssertJ, parameterized tests, the test lifecycle, and Mockito mocks, stubs and verification.',
          objectives: [
            'Predict which tests pass and fail, and read assertion failure messages.',
            'Choose JUnit 5 and AssertJ assertions that state the expected behavior precisely.',
            'Cover boundaries with parameterized tests and keep tests independent.',
            'Stub and verify collaborators with Mockito, and diagnose Mockito errors.',
          ],
          questions: testingFamilies,
        },
      ],
    },
    {
      id: 'java-concurrency-topic',
      name: 'Concurrency',
      description: 'Run work in parallel safely with threads, executors and futures.',
      skills: [
        {
          id: 'java-concurrency',
          prerequisites: ['java-lambdas', 'java-collections'],
          name: 'Threads, executors and thread safety',
          description:
            'Threads, `ExecutorService`, `Future`, `CompletableFuture`, virtual threads, race conditions, `synchronized`, atomics and concurrent collections.',
          objectives: [
            'Run tasks with executors and futures, and always shut executors down.',
            'Compose asynchronous work with `CompletableFuture`.',
            'Identify race conditions and fix them with atomics, locks or atomic map operations.',
            'Find the real cause behind `ExecutionException` and `CompletionException`.',
          ],
          questions: concurrencyFamilies,
        },
      ],
    },
    {
      id: 'java-enterprise',
      name: 'Practical enterprise Java',
      description:
        'The everyday building blocks of business applications, as preparation for Spring Boot.',
      skills: [
        {
          id: 'java-enterprise-design',
          prerequisites: ['java-records-enums', 'java-optional', 'java-exceptions'],
          name: 'DTOs, services, repositories and debugging',
          description:
            'DTOs versus entities, service classes with injected dependencies, repository abstractions, Maven and Gradle dependencies, and debugging with stack traces and helpful NPE messages.',
          objectives: [
            'Separate API DTOs from entities and map between them.',
            'Design services that receive repository and gateway interfaces through their constructors.',
            'Explain dependency coordinates, scopes and version conflicts in Maven and Gradle.',
            'Locate a failure from a stack trace or a helpful `NullPointerException` message.',
          ],
          questions: enterpriseDesignFamilies,
        },
        {
          id: 'java-json-validation',
          prerequisites: ['java-enterprise-design'],
          name: 'JSON with Jackson and Bean Validation',
          description:
            'Serializing and deserializing records with Jackson 3, Jackson annotations and errors, and Jakarta Bean Validation with Hibernate Validator.',
          objectives: [
            'Convert records to and from JSON with `ObjectMapper`, including generic lists.',
            'Control JSON output with `@JsonProperty`, `@JsonIgnore` and `@JsonInclude`.',
            'Validate request objects with Bean Validation constraints, `@Valid` and cross-field rules.',
            'Explain how `null` is treated by each kind of constraint.',
          ],
          questions: jsonValidationFamilies,
        },
      ],
    },
  ],
};
