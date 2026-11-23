import type { TrackSource } from '@pracstack/content-model';
import { efCoreFamilies, testingArchitectureFamilies } from './data-architecture';
import { httpRestFamilies, minimalApiRoutingFamilies } from './http-routing';
import { diConfigFamilies, middlewareFamilies } from './pipeline-di';
import { securityFamilies, validationErrorFamilies } from './validation-security';

/**
 * ASP.NET Core on .NET 10. HTTP, routing, middleware, DI, validation and security
 * questions run real programs in the C# runner, most of them hosting a real
 * ASP.NET Core app on loopback and sending it HTTP requests (see builders.ts).
 * EF Core and testing-framework code is shown as text: those questions are
 * reviewed reasoning, because the packages are not available to the runner.
 */
export const aspnetCoreTrack: TrackSource = {
  id: 'aspnet-core',
  name: 'ASP.NET Core',
  category: 'frameworks',
  description:
    'Build web APIs with ASP.NET Core on .NET 10: HTTP and REST design, minimal APIs and routing, middleware, dependency injection and configuration, validation and error handling, security, EF Core data access, testing and architecture. HTTP, middleware and DI questions run a real ASP.NET Core app and check its actual responses.',
  topics: [
    {
      id: 'aspnet-web-api-fundamentals',
      name: 'Web API fundamentals',
      description: 'Design HTTP APIs and map them to endpoints and routes.',
      skills: [
        {
          id: 'aspnet-http-rest',
          name: 'HTTP and REST API design',
          description:
            'Methods, safety and idempotency, status codes, `Location` and conditional headers, resource design, pagination, problem details and idempotency keys.',
          questions: httpRestFamilies,
        },
        {
          id: 'aspnet-minimal-apis-routing',
          prerequisites: ['aspnet-http-rest'],
          name: 'Minimal APIs and routing',
          description:
            'Route templates and constraints, parameter binding from route, query, body and services, `Results` and `TypedResults`, route groups, route precedence and controllers with `[ApiController]`.',
          questions: minimalApiRoutingFamilies,
        },
      ],
    },
    {
      id: 'aspnet-app-infrastructure',
      name: 'Pipeline and services',
      description:
        'How requests flow through middleware, and how services and settings are wired up.',
      skills: [
        {
          id: 'aspnet-middleware-pipeline',
          prerequisites: ['aspnet-minimal-apis-routing'],
          name: 'Middleware pipeline',
          description:
            'Middleware order, short-circuiting, `Use`, `Run`, `Map` and `UseWhen`, exception handler placement, routing, authentication and authorization order, and scoped services in middleware.',
          questions: middlewareFamilies,
        },
        {
          id: 'aspnet-dependency-injection-config',
          prerequisites: ['aspnet-middleware-pipeline'],
          name: 'Dependency injection and configuration',
          description:
            'Service lifetimes, captive dependencies, multiple registrations, configuration sources and precedence, the options pattern and its validation, and logging.',
          questions: diConfigFamilies,
        },
      ],
    },
    {
      id: 'aspnet-robust-secure-apis',
      name: 'Robust and secure APIs',
      description:
        'Reject bad input clearly, fail safely, and let each caller do only what they may.',
      skills: [
        {
          id: 'aspnet-validation-errors',
          prerequisites: ['aspnet-minimal-apis-routing'],
          name: 'Validation and error handling',
          description:
            'Data annotations, validation in controllers and minimal APIs, 400 versus 422, problem details, global exception handling, and error responses that do not leak secrets.',
          questions: validationErrorFamilies,
        },
        {
          id: 'aspnet-security',
          prerequisites: ['aspnet-middleware-pipeline'],
          name: 'API security',
          description:
            'Authentication versus authorization, 401 and 403, claims, roles and policies, resource-based authorization, BOLA/IDOR, over-posting, JWT validation and secure defaults.',
          questions: securityFamilies,
        },
      ],
    },
    {
      id: 'aspnet-data-architecture',
      name: 'Data, testing and architecture',
      description: 'Persist data with EF Core, test the API, and structure the application.',
      skills: [
        {
          id: 'aspnet-data-access-efcore',
          prerequisites: ['aspnet-dependency-injection-config'],
          name: 'Data access with EF Core',
          description:
            'DbContext lifetime, relationships, migrations, LINQ translation, tracking, N+1 queries and loading, transactions and optimistic concurrency.',
          questions: efCoreFamilies,
        },
        {
          id: 'aspnet-testing-architecture',
          prerequisites: ['aspnet-dependency-injection-config'],
          name: 'Testing and architecture',
          description:
            'Unit and integration tests, test doubles, TDD and BDD, service layers, DTOs versus entities, repositories over EF Core, clean architecture, modular monoliths and the outbox pattern.',
          questions: testingArchitectureFamilies,
        },
      ],
    },
  ],
};
