import type { JobRole } from '@pracstack/content-model';
import { challenge, scenario, skills } from './activities';

/*
 * Job roles. Available roles are ordered preparation paths through content
 * that exists today. A competency with no practice yet has no activities
 * (shown as "No practice on PracStack yet"). Coming-soon roles carry only a
 * title, summary and technologies. The content build validates every
 * reference (packages/content-model/src/roles.ts).
 *
 * Enterprise Scenarios (kind: 'scenario') are not registered yet; until they
 * are, scenario steps point at the enterprise coding challenges.
 */
export const ROLES: readonly JobRole[] = [
  {
    id: 'dotnet-backend-developer',
    version: 1,
    status: 'available',
    title: '.NET Backend Developer',
    summary:
      'Server-side C# and .NET: the language, SQL Server, ASP.NET Core APIs, testing and delivery.',
    description:
      'Builds and maintains the server side of business applications in C# on .NET: domain logic, data access with SQL Server, HTTP APIs on ASP.NET Core, automated tests, security and delivery pipelines. The path starts with the C# language and SQL, then builds up to a realistic API graded over real HTTP.',
    technologies: [
      'csharp',
      'dotnet',
      'linq',
      'sql',
      'sql-server',
      'rest',
      'aspnet-core',
      'entity-framework',
      'unit-testing',
      'security',
      'cicd',
      'git',
    ],
    competencies: [
      {
        id: 'csharp-fundamentals',
        name: 'C# fundamentals',
        description:
          'Value and reference types, nullable reference types and pattern matching: the core of reading and writing modern C#.',
        activities: [
          ...skills('cs-value-reference-types', 'cs-nullable-types', 'cs-pattern-matching'),
          challenge('reverse-string', 'csharp'),
          challenge('balanced-brackets', 'csharp'),
        ],
      },
      {
        id: 'collections-linq',
        name: 'Collections and LINQ',
        description:
          'Choosing the right collection, querying it with LINQ, and knowing when a query actually runs.',
        activities: [
          ...skills('cs-collections', 'cs-linq', 'cs-linq-execution'),
          challenge('pangram', 'csharp'),
          challenge('merge-intervals', 'csharp'),
        ],
      },
      {
        id: 'object-oriented-programming',
        name: 'Object-oriented programming',
        description:
          'Classes, interfaces, records, generics and delegates: how .NET codebases are structured.',
        activities: [
          ...skills(
            'cs-oop',
            'cs-records-immutability',
            'cs-generics-methods',
            'cs-delegates-events',
          ),
          challenge('lru-cache', 'csharp'),
          challenge('undo-redo-history', 'csharp'),
        ],
      },
      {
        id: 'exceptions-async',
        name: 'Exceptions and async',
        description:
          'Exception handling, resource cleanup and async/await, which every request handler depends on.',
        activities: skills('cs-exceptions', 'cs-async'),
      },
      {
        id: 'sql-fundamentals',
        name: 'SQL fundamentals',
        description:
          'Filtering, sorting, aggregating, joining and subqueries, practised on a real PostgreSQL database.',
        activities: skills(
          'pg-select-where',
          'pg-order-limit',
          'pg-functions-case',
          'pg-group-by',
          'pg-joins-basics',
          'pg-subqueries-basics',
        ),
      },
      {
        id: 'sql-server-tsql',
        name: 'SQL Server and T-SQL',
        description:
          'The SQL Server dialect: T-SQL querying, window functions, stored procedures and transactions.',
        activities: skills(
          'mssql-querying',
          'mssql-joins-aggregation',
          'mssql-advanced-queries',
          'mssql-programming',
          'mssql-transactions',
        ),
      },
      {
        id: 'rest-apis',
        name: 'REST APIs',
        description: 'Resource design, HTTP methods and status codes, idempotency and pagination.',
        activities: skills('aspnet-http-rest'),
      },
      {
        id: 'aspnet-core',
        name: 'ASP.NET Core',
        description:
          'Minimal APIs and routing, middleware, dependency injection, validation and data access with EF Core.',
        activities: skills(
          'aspnet-minimal-apis-routing',
          'aspnet-middleware-pipeline',
          'aspnet-dependency-injection-config',
          'aspnet-validation-errors',
          'aspnet-data-access-efcore',
        ),
      },
      {
        id: 'testing',
        name: 'Automated testing',
        description: 'Unit and integration tests for .NET code, and designing code to be testable.',
        activities: skills('eng-testing', 'aspnet-testing-architecture'),
      },
      {
        id: 'security',
        name: 'Application security',
        description:
          'Authentication, authorisation and the common web vulnerabilities (OWASP Top 10).',
        activities: [
          ...skills('aspnet-security', 'eng-secure-coding'),
          challenge('secure-customer-api', 'csharp'),
        ],
      },
      {
        id: 'ci-cd',
        name: 'CI/CD',
        description: 'Source control workflows, build pipelines and automated deployment.',
        activities: skills('eng-git-workflow', 'eng-ci-cd', 'az-devops-pipelines'),
      },
      {
        id: 'enterprise-scenario',
        name: 'Enterprise development scenario',
        description:
          'Putting it together: a realistic ASP.NET Core API for a business system, graded over real HTTP.',
        activities: [
          scenario('employee-management-api'),
          scenario('transaction-processing'),
          scenario('secure-customer-api'),
          scenario('legacy-modernization'),
        ],
      },
    ],
  },
  {
    id: 'fullstack-angular-dotnet-developer',
    version: 1,
    status: 'available',
    title: 'Full-Stack Angular + .NET Developer',
    summary: 'TypeScript and Angular in the browser, C#, ASP.NET Core and SQL on the server.',
    description:
      'Builds features end to end: Angular front ends written in TypeScript, C# services on ASP.NET Core and the SQL behind them. The path alternates between the two sides so each new concept has practice on both, then ends with the API the front end calls and how to test it.',
    technologies: [
      'typescript',
      'angular',
      'csharp',
      'dotnet',
      'sql',
      'rest',
      'aspnet-core',
      'unit-testing',
      'git',
    ],
    competencies: [
      {
        id: 'typescript',
        name: 'TypeScript',
        description:
          'The type system Angular code depends on: unions, narrowing, objects, generics.',
        activities: skills(
          'ts-primitive-types',
          'ts-union-types',
          'ts-typeof-narrowing',
          'ts-discriminated-unions',
          'ts-object-types',
          'ts-function-types',
          'ts-generics',
          'ts-utility-types',
        ),
      },
      {
        id: 'angular',
        name: 'Angular',
        description: 'Signals, computed state and component inputs and outputs.',
        activities: skills('ng-signals', 'ng-component-io'),
      },
      {
        id: 'csharp',
        name: 'C# for the back end',
        description:
          'The C# needed for services: types, nullability, classes, collections, LINQ, exceptions and async.',
        activities: skills(
          'cs-value-reference-types',
          'cs-nullable-types',
          'cs-oop',
          'cs-collections',
          'cs-linq',
          'cs-exceptions',
          'cs-async',
        ),
      },
      {
        id: 'problem-solving',
        name: 'Problem solving on both sides',
        description:
          'Stateful coding challenges solved in TypeScript and in C#, graded by hidden tests.',
        activities: [
          challenge('text-cursor-buffer', 'typescript'),
          challenge('apply-edit-commands', 'typescript'),
          challenge('undo-redo-history', 'csharp'),
          challenge('lru-cache', 'csharp'),
        ],
      },
      {
        id: 'sql',
        name: 'SQL',
        description: 'Queries the back end runs: filtering, joins and aggregation.',
        activities: skills('pg-select-where', 'pg-joins-basics', 'pg-group-by'),
      },
      {
        id: 'web-apis',
        name: 'Web APIs with ASP.NET Core',
        description: 'Designing and building the HTTP API the Angular app calls.',
        activities: [
          ...skills('aspnet-http-rest', 'aspnet-minimal-apis-routing', 'aspnet-validation-errors'),
          challenge('employee-api', 'csharp'),
        ],
      },
      {
        id: 'testing',
        name: 'Automated testing',
        description: 'Testing practices and testable API design.',
        activities: skills('eng-testing', 'aspnet-testing-architecture'),
      },
    ],
  },
  {
    id: 'csharp-dotnet-developer',
    version: 1,
    status: 'available',
    title: 'C# / .NET Developer',
    summary: 'Deep, practical C#: the language features .NET work relies on, and problem solving.',
    description:
      'Writes and maintains C# code of any kind: services, tools, libraries or desktop applications. The path goes through the whole C# track in learning order, then applies it to coding challenges solved in C#, the SQL most C# work needs, and testing.',
    technologies: ['csharp', 'dotnet', 'linq', 'oop', 'data-structures', 'sql', 'unit-testing'],
    competencies: [
      {
        id: 'language-fundamentals',
        name: 'Language fundamentals',
        description: 'Value and reference types, nullability and pattern matching.',
        activities: [
          ...skills('cs-value-reference-types', 'cs-nullable-types', 'cs-pattern-matching'),
          challenge('reverse-string', 'csharp'),
        ],
      },
      {
        id: 'types-and-objects',
        name: 'Types and objects',
        description: 'Classes, interfaces, inheritance, records, structs and immutability.',
        activities: skills('cs-oop', 'cs-records-immutability'),
      },
      {
        id: 'generics-delegates',
        name: 'Generics and delegates',
        description: 'Generic methods and types, lambdas, delegates and events.',
        activities: skills('cs-generics-methods', 'cs-delegates-events'),
      },
      {
        id: 'collections-linq',
        name: 'Collections and LINQ',
        description: 'Collections, LINQ queries and deferred execution.',
        activities: [
          ...skills('cs-collections', 'cs-linq', 'cs-linq-execution'),
          challenge('pangram', 'csharp'),
          challenge('merge-intervals', 'csharp'),
        ],
      },
      {
        id: 'errors-async',
        name: 'Errors and asynchronous code',
        description: 'Exceptions, using and dispose, async and await.',
        activities: skills('cs-exceptions', 'cs-async'),
      },
      {
        id: 'problem-solving',
        name: 'Problem solving in C#',
        description: 'Stacks, caches and stateful editors, graded on the server by hidden tests.',
        activities: [
          challenge('balanced-brackets', 'csharp'),
          challenge('lru-cache', 'csharp'),
          challenge('apply-edit-commands', 'csharp'),
          challenge('text-cursor-buffer', 'csharp'),
          challenge('undo-redo-history', 'csharp'),
        ],
      },
      {
        id: 'sql-for-csharp',
        name: 'SQL for C# developers',
        description: 'The queries C# code sends: filtering, joins and aggregation.',
        activities: skills('pg-select-where', 'pg-joins-basics', 'pg-group-by'),
      },
      {
        id: 'unit-testing',
        name: 'Unit testing',
        description: 'Writing and maintaining tests for C# code.',
        activities: skills('eng-testing'),
      },
    ],
  },
  {
    id: 'aspnet-core-backend-developer',
    version: 1,
    status: 'available',
    title: 'ASP.NET Core Backend Developer',
    summary:
      'HTTP APIs on ASP.NET Core: routing, dependency injection, data access, security and testing.',
    description:
      'Designs and builds HTTP APIs on ASP.NET Core. The path assumes working C#, then goes from HTTP and REST design through the framework (routing, middleware, dependency injection, validation), data access with EF Core and SQL Server, security and testing, and ends with two APIs graded over real HTTP.',
    technologies: [
      'aspnet-core',
      'csharp',
      'rest',
      'entity-framework',
      'sql-server',
      'unit-testing',
      'security',
    ],
    competencies: [
      {
        id: 'csharp-essentials',
        name: 'C# essentials for APIs',
        description:
          'Nullability, classes and records, LINQ and async: the C# every endpoint uses.',
        activities: skills('cs-nullable-types', 'cs-records-immutability', 'cs-linq', 'cs-async'),
      },
      {
        id: 'http-rest',
        name: 'HTTP and REST design',
        description: 'Methods, status codes, idempotency, resource design and problem details.',
        activities: skills('aspnet-http-rest'),
      },
      {
        id: 'framework',
        name: 'Routing, middleware and dependency injection',
        description: 'How a request flows through ASP.NET Core and how services are wired.',
        activities: skills(
          'aspnet-minimal-apis-routing',
          'aspnet-middleware-pipeline',
          'aspnet-dependency-injection-config',
        ),
      },
      {
        id: 'validation-errors',
        name: 'Validation and error handling',
        description: 'Rejecting bad input clearly and never leaking internals in errors.',
        activities: skills('aspnet-validation-errors'),
      },
      {
        id: 'data-access',
        name: 'Data access',
        description: 'EF Core and the SQL Server queries behind it.',
        activities: skills(
          'aspnet-data-access-efcore',
          'mssql-querying',
          'mssql-joins-aggregation',
        ),
      },
      {
        id: 'security',
        name: 'API security',
        description: 'Authentication, authorisation, BOLA/IDOR and the OWASP Top 10 in code.',
        activities: [
          ...skills('aspnet-security', 'eng-secure-coding'),
          challenge('secure-customer-api', 'csharp'),
        ],
      },
      {
        id: 'testing-architecture',
        name: 'Testing and architecture',
        description: 'Unit and integration tests, and structuring an API so it stays testable.',
        activities: skills('aspnet-testing-architecture', 'eng-testing'),
      },
      {
        id: 'build-an-api',
        name: 'Build an API',
        description: 'A complete API for a business system, graded over real HTTP.',
        activities: [scenario('employee-management-api'), scenario('secure-customer-api')],
      },
    ],
  },
  {
    id: 'sql-server-database-developer',
    version: 1,
    status: 'available',
    title: 'SQL Server Database Developer',
    summary: 'T-SQL querying and programming, transactions, performance and schema design.',
    description:
      'Writes and tunes the T-SQL behind business applications: queries and reports, stored procedures, transactions under concurrency, indexes and schema design. ETL and reporting services (SSIS, SSRS) are part of many such roles but are not covered on PracStack yet.',
    technologies: ['sql-server', 'sql', 'data-modeling', 'ssis', 'ssrs'],
    competencies: [
      {
        id: 'querying',
        name: 'Querying data',
        description: 'Filtering, sorting, NULLs, joins and aggregation in T-SQL.',
        activities: skills('mssql-querying', 'mssql-joins-aggregation'),
      },
      {
        id: 'advanced-queries',
        name: 'Advanced queries',
        description: 'Subqueries, CTEs and window functions.',
        activities: skills('mssql-advanced-queries'),
      },
      {
        id: 'programmability',
        name: 'T-SQL programming',
        description: 'Stored procedures, functions, error handling and safe dynamic SQL.',
        activities: skills('mssql-programming'),
      },
      {
        id: 'transactions',
        name: 'Transactions and concurrency',
        description: 'Isolation levels, blocking and deadlocks.',
        activities: skills('mssql-transactions'),
      },
      {
        id: 'performance',
        name: 'Performance tuning',
        description: 'Indexes, SARGable predicates, statistics and parameter sniffing.',
        activities: [...skills('mssql-performance'), scenario('sql-performance-investigation')],
      },
      {
        id: 'design',
        name: 'Database design',
        description: 'Keys, constraints, normalisation and data types.',
        activities: skills('mssql-data-modeling'),
      },
      {
        id: 'etl-reporting',
        name: 'ETL and reporting (SSIS, SSRS)',
        description: 'Integration Services packages and Reporting Services reports.',
        activities: [],
      },
    ],
  },
  {
    id: 'azure-developer',
    version: 1,
    status: 'available',
    title: 'Azure Developer',
    summary: 'Building and running .NET workloads on Microsoft Azure.',
    description:
      'Builds cloud applications on Azure with C#: secure identity and secrets, serverless functions, messaging and integration, and delivery through Azure DevOps. The path starts with the C# that cloud code depends on.',
    technologies: [
      'azure',
      'azure-functions',
      'azure-logic-apps',
      'azure-service-bus',
      'azure-devops',
      'csharp',
    ],
    competencies: [
      {
        id: 'csharp-for-cloud',
        name: 'C# for cloud code',
        description: 'Async code and failure handling, which every cloud call needs.',
        activities: skills('cs-async', 'cs-exceptions'),
      },
      {
        id: 'identity-security',
        name: 'Identity, access and secrets',
        description: 'Entra ID, RBAC, managed identities and Key Vault.',
        activities: skills('az-identity-security'),
      },
      {
        id: 'functions',
        name: 'Azure Functions',
        description: 'Triggers and bindings, retries, idempotency and hosting.',
        activities: skills('az-functions'),
      },
      {
        id: 'messaging',
        name: 'Messaging with Service Bus',
        description: 'Queues and topics, settlement, dead-lettering and idempotent consumers.',
        activities: skills('az-service-bus'),
      },
      {
        id: 'integration',
        name: 'Logic Apps and integration',
        description: 'Connectors, error handling and choosing the right integration service.',
        activities: skills('az-logic-apps-integration'),
      },
      {
        id: 'delivery',
        name: 'Delivery with Azure DevOps',
        description: 'Source control and YAML pipelines with environments and approvals.',
        activities: [
          ...skills('eng-git-workflow', 'az-devops-pipelines'),
          scenario('cicd-pipeline-failure'),
        ],
      },
    ],
  },
  {
    id: 'power-platform-developer',
    version: 1,
    status: 'available',
    title: 'Power Platform Developer',
    summary: 'Apps, flows and data on the Microsoft Power Platform.',
    description:
      'Builds business solutions on the Power Platform: canvas and model-driven apps, automated flows, Dataverse data models and security, Dynamics 365 extensions, reports and the application lifecycle that moves them between environments.',
    technologies: [
      'power-platform',
      'power-apps',
      'power-automate',
      'dataverse',
      'dynamics-365',
      'power-bi',
    ],
    competencies: [
      {
        id: 'power-apps',
        name: 'Power Apps',
        description: 'Canvas and model-driven apps, Power Fx, delegation and components.',
        activities: skills('pp-power-apps'),
      },
      {
        id: 'power-automate',
        name: 'Power Automate',
        description: 'Cloud flows, expressions, error handling and approvals.',
        activities: [...skills('pp-power-automate'), scenario('leave-approval-workflow')],
      },
      {
        id: 'dataverse',
        name: 'Dataverse',
        description: 'Tables, relationships, business logic and security.',
        activities: skills('pp-dataverse'),
      },
      {
        id: 'dynamics-365',
        name: 'Extending Dynamics 365',
        description: 'Forms, business process flows, plug-ins and the Web API.',
        activities: skills('pp-dynamics-365'),
      },
      {
        id: 'reporting',
        name: 'Power BI reporting',
        description: 'Data models and DAX measures.',
        activities: skills('pp-power-bi'),
      },
      {
        id: 'alm',
        name: 'ALM and governance',
        description: 'Solutions, environments, pipelines and DLP policies.',
        activities: skills('pp-alm-governance'),
      },
    ],
  },
  {
    id: 'enterprise-application-developer',
    version: 1,
    status: 'coming-soon',
    title: 'Enterprise Application Developer',
    summary:
      'Changing large business systems safely: integration, messaging and the delivery process.',
    technologies: [
      'csharp',
      'dotnet',
      'microservices',
      'azure-service-bus',
      'sdlc',
      'requirements-gathering',
    ],
  },
  {
    id: 'power-platform-solution-architect',
    version: 1,
    status: 'coming-soon',
    title: 'Power Platform Solution Architect',
    summary: 'Designing Power Platform and Dynamics 365 solutions from business requirements.',
    technologies: [
      'power-platform',
      'dataverse',
      'dynamics-365',
      'power-bi',
      'requirements-gathering',
      'systems-analysis',
    ],
  },
];
