import type { TrackSource } from '@pracstack/content-model';
import {
  beansContextFamilies,
  bootStartupFamilies,
  dependencyInjectionFamilies,
} from './fundamentals';
import { architectureFamilies, operationsFamilies, testingFamilies } from './production';
import { configurationFamilies, securityFamilies } from './platform';
import { serviceLayerFamilies, transactionFamilies } from './business';
import { dataJpaFamilies } from './data-jpa';
import {
  exceptionHandlingFamilies,
  httpBehaviorFamilies,
  restControllerFamilies,
  validationFamilies,
} from './web';

/**
 * Spring Boot 4.1 on Java 21. Every Java snippet is compiled (and run where it is a
 * program) on the real Java runner, which has Spring Boot, Spring Data JPA with H2,
 * Spring Security, Actuator and the test libraries on its class path; see
 * ../program-builders.ts.
 */
export const springBootTrack: TrackSource = {
  id: 'spring-boot',
  name: 'Spring Boot',
  category: 'frameworks',
  description:
    'Build production-ready REST services with Spring Boot 4.1 on Java 21: dependency injection, web APIs, validation, data access, transactions, configuration, security, testing and operations.',
  topics: [
    {
      id: 'sb-fundamentals',
      name: 'Spring fundamentals',
      description:
        'How the application context creates and wires beans, and what Spring Boot adds at startup.',
      skills: [
        {
          id: 'sb-beans-context',
          name: 'Beans and the application context',
          description:
            'Configuration classes, `@Bean` methods, bean names and scopes, lifecycle callbacks, component scanning and bean overriding.',
          objectives: [
            'Predict how many instances the context creates for singleton and prototype beans.',
            'Name the beans a configuration registers and look them up correctly.',
            'Explain when beans are created and when lifecycle callbacks run.',
            'Diagnose beans that are missing because they were never registered or scanned.',
          ],
          questions: beansContextFamilies,
        },
        {
          id: 'sb-boot-startup',
          prerequisites: ['sb-beans-context'],
          name: 'Spring Boot startup and auto-configuration',
          description:
            '`@SpringBootApplication`, `SpringApplication.run`, runners and startup events, conditional auto-configuration and startup failures.',
          objectives: [
            'Explain what `@SpringBootApplication` and `SpringApplication.run` do.',
            'Predict when runners and startup events execute.',
            'Predict whether a conditional auto-configured bean is created.',
            'Diagnose a failed startup from the exception and the failure report.',
          ],
          questions: bootStartupFamilies,
        },
      ],
    },
    {
      id: 'sb-dependency-injection-topic',
      name: 'Dependency injection',
      description: 'Wire components through constructors and resolve injection errors.',
      skills: [
        {
          id: 'sb-dependency-injection',
          prerequisites: ['sb-beans-context'],
          name: 'Dependency injection',
          description:
            'Constructor injection, `@Primary` and `@Qualifier`, collections and optional dependencies, scopes, and missing, ambiguous and circular dependencies.',
          objectives: [
            'Wire services through constructor injection and predict what they receive.',
            'Choose between `@Primary`, `@Qualifier`, `List` and `Optional` injection.',
            'Fix missing, ambiguous and circular dependency failures.',
            'Explain why objects created with `new` are not injected.',
          ],
          questions: dependencyInjectionFamilies,
        },
      ],
    },
    {
      id: 'sb-rest-apis',
      name: 'REST APIs and HTTP',
      description:
        'Map requests to controller methods and answer with the right status, headers and body.',
      skills: [
        {
          id: 'sb-rest-controllers',
          prerequisites: ['sb-dependency-injection'],
          name: 'REST controllers and request mapping',
          description:
            '`@RestController`, `@RequestMapping` and the method-specific mappings, path variables, query parameters, request bodies and mapping resolution.',
          objectives: [
            'Map HTTP methods and paths to controller methods.',
            'Bind path variables, query parameters and JSON bodies to parameters.',
            'Predict which handler Spring picks when several mappings match.',
            'Fix controllers that return view names or declare ambiguous mappings.',
          ],
          questions: restControllerFamilies,
        },
        {
          id: 'sb-http-behavior',
          prerequisites: ['sb-rest-controllers'],
          name: 'HTTP methods, status codes and responses',
          description:
            'Method semantics, status codes, `ResponseEntity`, `@ResponseStatus`, content types and negotiation, conditional requests and response contracts.',
          objectives: [
            'Choose the HTTP method and status code for an API operation.',
            'Build responses with `ResponseEntity`, headers and `Location`.',
            'Predict 4xx responses for unreadable, unsupported or unacceptable requests.',
            'Evolve a response contract without breaking clients.',
          ],
          questions: httpBehaviorFamilies,
        },
      ],
    },
    {
      id: 'sb-validation-errors',
      name: 'DTOs, validation and errors',
      description: 'Validate input at the edge and turn failures into consistent error responses.',
      skills: [
        {
          id: 'sb-dtos-validation',
          prerequisites: ['sb-rest-controllers'],
          name: 'DTOs and Bean Validation',
          description:
            'Request and response DTOs as records, Bean Validation constraints, `@Valid`, nested and custom constraints, validation errors and business rules in services.',
          objectives: [
            'Choose the right constraint for required, sized and formatted fields.',
            'Predict when validation runs and which violations it reports.',
            'Use request DTOs to prevent mass assignment.',
            'Separate format validation from business validation in services.',
          ],
          questions: validationFamilies,
        },
        {
          id: 'sb-exception-handling',
          prerequisites: ['sb-http-behavior'],
          name: 'Exception handling and error responses',
          description:
            'Custom exceptions, `@RestControllerAdvice`, `@ExceptionHandler` selection, `ProblemDetail`, `ResponseStatusException` and safe, consistent error responses.',
          objectives: [
            'Map domain exceptions to status codes in one advice class.',
            'Predict which exception handler Spring selects.',
            'Return consistent `ProblemDetail` responses.',
            'Keep stack traces and internal details out of error responses.',
          ],
          questions: exceptionHandlingFamilies,
        },
      ],
    },
    {
      id: 'sb-business-data',
      name: 'Business logic and data',
      description:
        'Keep business rules in services, persist data with Spring Data JPA and keep it consistent with transactions.',
      skills: [
        {
          id: 'sb-service-layer',
          prerequisites: ['sb-dependency-injection', 'sb-rest-controllers'],
          name: 'Service layer',
          description:
            'Thin controllers, services that own business rules and transaction boundaries, abstractions that make code reusable and testable, and stateless singletons.',
          objectives: [
            'Move business rules out of controllers into reusable services.',
            'Choose the service method as the transaction boundary of a use case.',
            'Spot per-request state stored in singleton services.',
            'Keep services independent of HTTP types.',
          ],
          questions: serviceLayerFamilies,
        },
        {
          id: 'sb-data-jpa',
          prerequisites: ['sb-service-layer'],
          name: 'Spring Data JPA',
          description:
            'Entities and primary keys, repositories, derived query methods, `@Query`, pagination and sorting, relationships, lazy loading and the N+1 problem.',
          objectives: [
            'Map an entity with an id and write repository interfaces.',
            'Predict the results of derived queries, `@Query` methods and pages.',
            'Fix repository methods that fail at startup.',
            'Diagnose lazy loading failures, unsaved relationships and N+1 queries.',
          ],
          questions: dataJpaFamilies,
        },
        {
          id: 'sb-transactions',
          prerequisites: ['sb-service-layer'],
          name: 'Transactions and consistency',
          description:
            '`@Transactional` and its proxy, rollback rules for checked and unchecked exceptions, self-invocation, propagation, rollback-only transactions and optimistic locking.',
          objectives: [
            'Predict whether a transactional method commits or rolls back.',
            'Explain why self-invocation and objects created with `new` are not transactional.',
            'Choose between `REQUIRED` and `REQUIRES_NEW` propagation.',
            'Prevent lost updates with `@Version` and keep external side effects consistent.',
          ],
          questions: transactionFamilies,
        },
      ],
    },
    {
      id: 'sb-configuration-topic',
      name: 'Configuration',
      description:
        'Externalize settings, bind them to typed objects and adapt them per environment.',
      skills: [
        {
          id: 'sb-configuration',
          prerequisites: ['sb-boot-startup'],
          name: 'Configuration, properties and profiles',
          description:
            '`application.properties` and YAML, `@Value`, `@ConfigurationProperties`, relaxed binding of environment variables, property precedence, profiles, validation, units and secrets.',
          objectives: [
            'Bind configuration to typed `@ConfigurationProperties` records.',
            'Predict which value wins between defaults, environment variables and command-line arguments.',
            'Activate profile-specific beans and configuration.',
            'Fail fast on invalid configuration and keep secrets out of code.',
          ],
          questions: configurationFamilies,
        },
      ],
    },
    {
      id: 'sb-security-topic',
      name: 'Security',
      description: 'Authenticate users, authorize requests and avoid common web security mistakes.',
      skills: [
        {
          id: 'sb-security',
          prerequisites: ['sb-rest-controllers'],
          name: 'Spring Security fundamentals',
          description:
            'Authentication versus authorization, the security filter chain, request rules and their order, roles and authorities, password hashing, CSRF and method security.',
          objectives: [
            'Distinguish 401 from 403 and authentication from authorization.',
            'Write request rules in the right order with roles and authorities.',
            'Store passwords with an adaptive hash such as BCrypt.',
            'Decide when CSRF protection is needed and spot common security mistakes.',
          ],
          questions: securityFamilies,
        },
      ],
    },
    {
      id: 'sb-testing-topic',
      name: 'Testing',
      description: 'Test business logic, controllers and data access at the right level.',
      skills: [
        {
          id: 'sb-testing',
          prerequisites: ['sb-service-layer'],
          name: 'Testing Spring Boot applications',
          description:
            'JUnit 5 and AssertJ, Mockito stubbing and verification, controller tests with MockMvc, test slices versus full integration tests, and database fixtures.',
          objectives: [
            'Predict which tests pass and why a failing test fails.',
            'Stub and verify collaborators with Mockito without over-specifying.',
            'Test controllers with MockMvc and choose between slice and full-context tests.',
            'Keep tests independent with fresh fixtures.',
          ],
          questions: testingFamilies,
        },
      ],
    },
    {
      id: 'sb-production',
      name: 'Operations and architecture',
      description: 'Run the application in production and keep its structure healthy as it grows.',
      skills: [
        {
          id: 'sb-operations',
          prerequisites: ['sb-configuration'],
          name: 'Operations and Actuator',
          description:
            'Packaging and containers, logging levels and practices, health checks and probes, Actuator endpoint exposure, troubleshooting startup failures and production configuration.',
          objectives: [
            'Configure logging levels per package and write useful log statements.',
            'Predict health and probe responses and choose which endpoints to expose.',
            'Diagnose common startup failures from the failure report.',
            'Prepare a service for containers and production traffic.',
          ],
          questions: operationsFamilies,
        },
        {
          id: 'sb-architecture',
          prerequisites: ['sb-service-layer'],
          name: 'Application architecture',
          description:
            'Layered and hexagonal structure, separation of concerns, modular monoliths, application events, microservices trade-offs and integration patterns.',
          objectives: [
            'Keep dependencies pointing from adapters to the domain.',
            'Decouple modules with events and understand their run-time behavior.',
            'Decide when a modular monolith or microservices fit.',
            'Choose integration patterns that survive failures and duplicates.',
          ],
          questions: architectureFamilies,
        },
      ],
    },
  ],
};
