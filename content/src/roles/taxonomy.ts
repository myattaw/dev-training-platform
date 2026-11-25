import type { TaxonomyTerm } from '@pracstack/content-model';
import { challenge, scenario, skill, skills } from './activities';

/*
 * Technologies and practices that job postings ask for, with the PracStack
 * practice that covers each. `practice: []` means "not covered yet": the
 * analyzer and the role pages say so instead of pointing at unrelated content.
 *
 * Names: `label` and `aliases` are high confidence, `variants` (abbreviations,
 * informal or historical names) medium, `ambiguity.aliases` low and, with
 * `context`, only counted next to one of the context words. Every name is
 * matched on token boundaries; see packages/content-model/src/job-analysis.ts
 * and docs/job-roles.md.
 */
export const TAXONOMY: readonly TaxonomyTerm[] = [
  /* ---------------- Languages ---------------- */
  {
    id: 'csharp',
    label: 'C#',
    category: 'language',
    aliases: ['C Sharp', 'CSharp'],
    practice: [
      ...skills(
        'cs-value-reference-types',
        'cs-nullable-types',
        'cs-pattern-matching',
        'cs-oop',
        'cs-exceptions',
      ),
      challenge('transaction-batch', 'csharp'),
      challenge('legacy-invoice-refactor', 'csharp'),
      challenge('reverse-string', 'csharp'),
      challenge('balanced-brackets', 'csharp'),
    ],
    tracks: ['csharp'],
  },
  {
    id: 'dotnet',
    label: '.NET',
    category: 'framework',
    aliases: ['.NET Core', 'dotnet', 'dot net'],
    practice: skills('cs-collections', 'cs-generics-methods', 'cs-delegates-events', 'cs-async'),
    tracks: ['csharp'],
    note: 'Practiced through C# (the C# track covers the .NET base class library: collections, generics, async).',
  },
  {
    id: 'dotnet-framework',
    label: '.NET Framework',
    category: 'framework',
    aliases: ['Microsoft .NET Framework'],
    variants: ['.NET 4.8', '.NET Framework 4'],
    practice: [],
    relatedPractice: skills(
      'cs-value-reference-types',
      'cs-oop',
      'cs-collections',
      'cs-linq',
      'cs-exceptions',
    ),
    gap: {
      notCovered:
        'Modern C# carries over, but Framework-only parts (System.Web, Web Forms, WCF, web.config and app.config, the Global Assembly Cache) and how they differ from modern .NET are not practiced.',
      resources: [
        {
          label: '.NET Framework documentation',
          url: 'https://learn.microsoft.com/en-us/dotnet/framework/',
        },
        {
          label: 'Porting from .NET Framework to .NET',
          url: 'https://learn.microsoft.com/en-us/dotnet/core/porting/',
        },
      ],
    },
    note: 'The legacy, Windows-only framework (4.x), distinct from modern .NET. PracStack covers modern C#; framework-only technologies such as Web Forms and WCF are not covered.',
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    category: 'language',
    aliases: [],
    practice: [
      ...skills('ts-primitive-types', 'ts-union-types', 'ts-object-types', 'ts-generics'),
      challenge('pangram', 'typescript'),
    ],
    tracks: ['typescript'],
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    category: 'language',
    aliases: ['ECMAScript'],
    variants: ['JS', 'ES6'],
    matchCase: ['JS', 'ES6'],
    practice: [skill('ts-typeof-narrowing'), challenge('reverse-string', 'typescript')],
    coverage: 'partial',
    gap: {
      notCovered:
        'Practiced through TypeScript only: browser APIs (the DOM, events, fetch) and Node.js specifics are not covered.',
    },
    tracks: ['typescript'],
    note: 'Practiced through TypeScript, a typed superset of JavaScript.',
  },
  {
    id: 'java',
    label: 'Java',
    category: 'language',
    aliases: [],
    practice: [
      challenge('pangram', 'java'),
      challenge('balanced-brackets', 'java'),
      challenge('merge-intervals', 'java'),
      challenge('lru-cache', 'java'),
    ],
    note: 'Coding challenges can be solved in Java; there is no Java Skill Mastery track yet.',
  },
  {
    id: 'python',
    label: 'Python',
    category: 'language',
    aliases: [],
    practice: [],
    gap: {
      notCovered:
        'PracStack has no Python practice; coding challenges run in TypeScript, Java and C#.',
      resources: [{ label: 'The Python Tutorial', url: 'https://docs.python.org/3/tutorial/' }],
    },
  },
  {
    id: 'cpp',
    label: 'C++',
    category: 'language',
    aliases: ['CPP'],
    practice: [],
    gap: {
      notCovered: 'PracStack has no C++ practice.',
      resources: [
        { label: 'C++ language documentation', url: 'https://learn.microsoft.com/en-us/cpp/cpp/' },
      ],
    },
  },
  {
    id: 'sql',
    label: 'SQL',
    category: 'database',
    aliases: ['Structured Query Language'],
    practice: skills(
      'pg-select-where',
      'pg-order-limit',
      'pg-functions-case',
      'pg-group-by',
      'pg-joins-basics',
      'pg-subqueries-basics',
    ),
    coverage: 'executable',
    tracks: ['postgresql'],
    note: 'General SQL is practiced on PostgreSQL: you write queries that run and are graded.',
  },

  /* ---------------- Frameworks and libraries ---------------- */
  {
    id: 'aspnet-core',
    label: 'ASP.NET Core',
    category: 'framework',
    aliases: ['ASP.NET Core Web API', 'ASPNET Core'],
    practice: [
      skill('aspnet-minimal-apis-routing'),
      skill('aspnet-middleware-pipeline'),
      skill('aspnet-dependency-injection-config'),
      skill('aspnet-validation-errors'),
      challenge('employee-api', 'csharp'),
    ],
    tracks: ['aspnet-core'],
  },
  {
    id: 'aspnet-mvc',
    label: 'ASP.NET MVC',
    category: 'framework',
    aliases: ['ASP.NET MVC 5'],
    ambiguity: {
      aliases: ['MVC'],
      context: ['.NET', 'C#', 'ASP', 'Razor'],
      note: 'MVC is a general design pattern; it is counted as ASP.NET MVC only next to .NET, C# or ASP.',
    },
    matchCase: ['MVC'],
    practice: [],
    relatedPractice: [
      skill('aspnet-http-rest'),
      skill('aspnet-minimal-apis-routing'),
      skill('aspnet-middleware-pipeline'),
    ],
    gap: {
      notCovered:
        'Classic MVC on .NET Framework (controllers and Razor views in System.Web.Mvc, Global.asax, filters, bundling) is not practiced. ASP.NET Core practice teaches related routing, HTTP and dependency-injection ideas, but its APIs differ.',
      resources: [
        {
          label: 'ASP.NET MVC documentation',
          url: 'https://learn.microsoft.com/en-us/aspnet/mvc/',
        },
        {
          label: 'Migrating from ASP.NET to ASP.NET Core',
          url: 'https://learn.microsoft.com/en-us/aspnet/core/migration/proper-to-2x/',
        },
      ],
    },
    note: 'Classic ASP.NET MVC (on .NET Framework), distinct from ASP.NET Core.',
  },
  {
    id: 'aspnet',
    label: 'ASP.NET (classic or Core)',
    category: 'framework',
    aliases: [],
    ambiguity: {
      aliases: ['ASP.NET'],
      note: '“ASP.NET” on its own can mean classic ASP.NET (MVC, Web Forms) or ASP.NET Core; the posting does not say which. PracStack covers ASP.NET Core only.',
    },
    practice: [skill('aspnet-minimal-apis-routing'), skill('aspnet-middleware-pipeline')],
    coverage: 'partial',
    gap: {
      notCovered:
        'Only ASP.NET Core is practiced. If the job means classic ASP.NET (MVC 5, Web Forms on .NET Framework), study it separately.',
      resources: [
        {
          label: 'ASP.NET MVC documentation',
          url: 'https://learn.microsoft.com/en-us/aspnet/mvc/',
        },
      ],
    },
    tracks: ['aspnet-core'],
  },
  {
    id: 'entity-framework',
    label: 'Entity Framework',
    category: 'framework',
    aliases: ['Entity Framework Core', 'EF Core'],
    variants: ['EF6'],
    practice: [skill('aspnet-data-access-efcore'), skill('cs-linq-execution')],
    coverage: 'partial',
    gap: {
      notCovered:
        'EF Core is practiced; classic Entity Framework 6 (EDMX models, ObjectContext) is not.',
    },
    tracks: ['aspnet-core'],
    note: 'Covered by EF Core practice in the ASP.NET Core track; classic Entity Framework 6 specifics are not.',
  },
  {
    id: 'linq',
    label: 'LINQ',
    category: 'framework',
    aliases: ['Language Integrated Query', 'Language-Integrated Query'],
    practice: skills('cs-linq', 'cs-linq-execution'),
    tracks: ['csharp'],
  },
  {
    id: 'ado-net',
    label: 'ADO.NET',
    category: 'framework',
    aliases: [],
    practice: [],
    relatedPractice: [skill('mssql-programming')],
    gap: {
      notCovered:
        'Connections, commands, parameters and data readers in ADO.NET are not practiced; T-SQL programming practice covers the database side.',
      resources: [
        {
          label: 'ADO.NET documentation',
          url: 'https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/',
        },
      ],
    },
    note: 'The .NET data-access library; not to be confused with "ADO" for Azure DevOps.',
  },
  {
    id: 'angular',
    label: 'Angular',
    category: 'framework',
    aliases: [],
    practice: skills('ng-signals', 'ng-component-io'),
    tracks: ['angular'],
  },
  {
    id: 'react',
    label: 'React',
    category: 'framework',
    aliases: ['React.js', 'ReactJS'],
    matchCase: ['React'],
    practice: [],
    gap: {
      notCovered: 'PracStack has no React practice; the front-end practice is Angular.',
      resources: [{ label: 'Learn React', url: 'https://react.dev/learn' }],
    },
  },

  {
    id: 'nodejs',
    label: 'Node.js',
    category: 'framework',
    aliases: ['NodeJS', 'Node'],
    matchCase: ['Node'],
    practice: [],
    relatedPractice: [skill('ts-function-types'), challenge('pangram', 'typescript')],
    gap: {
      notCovered:
        'TypeScript is practiced, but the Node.js runtime (modules, the event loop, streams, npm, Express) is not.',
    },
  },
  {
    id: 'spring',
    label: 'Spring',
    category: 'framework',
    aliases: ['Spring Boot', 'Spring Framework'],
    matchCase: ['Spring'],
    practice: [],
    relatedPractice: [challenge('lru-cache', 'java'), challenge('merge-intervals', 'java')],
    gap: {
      notCovered:
        'Java coding challenges are practiced; the Spring framework (dependency injection, Spring Boot, Spring Data, Spring MVC) is not.',
    },
  },

  /* ---------------- Databases and data ---------------- */
  {
    id: 'sql-server',
    label: 'SQL Server',
    category: 'database',
    aliases: ['Microsoft SQL Server', 'MS SQL Server', 'Transact-SQL'],
    variants: ['MSSQL', 'MS SQL', 'T-SQL', 'TSQL'],
    practice: [
      skill('mssql-querying'),
      skill('mssql-joins-aggregation'),
      skill('mssql-advanced-queries'),
      skill('mssql-programming'),
      skill('mssql-transactions'),
      skill('mssql-performance'),
    ],
    relatedPractice: skills('pg-joins-basics', 'pg-group-by', 'pg-subqueries-basics'),
    tracks: ['sql-server'],
    note: 'T-SQL questions are knowledge questions; writing and running T-SQL is available only where a SQL Server engine is set up. General SQL query writing is practiced on PostgreSQL.',
  },
  {
    id: 'stored-procedures',
    label: 'stored procedures',
    category: 'database',
    aliases: ['stored procedure', 'stored procs'],
    practice: [skill('mssql-programming'), skill('mssql-transactions')],
    tracks: ['sql-server'],
  },
  {
    id: 'ssis',
    label: 'SSIS',
    category: 'database',
    aliases: ['SQL Server Integration Services'],
    practice: [skill('mssql-ssis')],
    gap: {
      notCovered:
        'Knowledge questions only: building, deploying and running SSIS packages in Visual Studio and the SSIS catalog is not practiced.',
      resources: [
        {
          label: 'SQL Server Integration Services documentation',
          url: 'https://learn.microsoft.com/en-us/sql/integration-services/sql-server-integration-services',
        },
      ],
    },
    tracks: ['sql-server'],
  },
  {
    id: 'ssrs',
    label: 'SSRS',
    category: 'database',
    aliases: ['SQL Server Reporting Services'],
    practice: [skill('mssql-ssrs')],
    gap: {
      notCovered:
        'Knowledge questions only: designing reports in Report Builder or Visual Studio and deploying them to a report server is not practiced.',
      resources: [
        {
          label: 'SQL Server Reporting Services documentation',
          url: 'https://learn.microsoft.com/en-us/sql/reporting-services/create-deploy-and-manage-mobile-and-paginated-reports',
        },
      ],
    },
    tracks: ['sql-server'],
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    category: 'database',
    aliases: [],
    variants: ['Postgres'],
    practice: skills(
      'pg-select-where',
      'pg-order-limit',
      'pg-functions-case',
      'pg-group-by',
      'pg-joins-basics',
      'pg-subqueries-basics',
    ),
    coverage: 'executable',
    tracks: ['postgresql'],
  },
  {
    id: 'oracle',
    label: 'Oracle Database',
    category: 'database',
    aliases: ['Oracle SQL', 'Oracle DB'],
    variants: ['Oracle'],
    practice: skills(
      'ora-row-limiting',
      'ora-nulls',
      'ora-dates',
      'ora-decode-case',
      'ora-connect-by',
    ),
    tracks: ['oracle-sql'],
    note: 'Oracle SQL queries; PL/SQL programming has its own track (see PL/SQL).',
  },
  {
    id: 'plsql',
    label: 'PL/SQL',
    category: 'database',
    aliases: ['Oracle PL/SQL', 'PLSQL', 'PL SQL'],
    practice: skills(
      'plsql-blocks',
      'plsql-control',
      'plsql-cursors',
      'plsql-exceptions',
      'plsql-subprograms',
      'plsql-packages',
      'plsql-bulk',
      'plsql-triggers',
    ),
    tracks: ['oracle-plsql'],
    gap: {
      notCovered:
        'You read, predict and complete PL/SQL (every sample is verified on a real Oracle database), but you do not run your own PL/SQL here yet.',
      resources: [
        {
          label: 'Oracle Database PL/SQL Language Reference',
          url: 'https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/',
        },
      ],
    },
  },
  {
    id: 'data-modeling',
    label: 'data modeling',
    category: 'database',
    aliases: ['data modelling', 'database design', 'relational modeling'],
    practice: [skill('mssql-data-modeling')],
    tracks: ['sql-server'],
  },

  /* ---------------- Testing ---------------- */
  {
    id: 'software-testing',
    label: 'software testing',
    category: 'testing',
    aliases: ['testing', 'quality assurance', 'test plans', 'test cases'],
    variants: ['test'],
    practice: [skill('eng-testing'), skill('cs-unit-testing')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'unit-testing',
    label: 'unit testing',
    category: 'testing',
    aliases: ['unit tests', 'unit test'],
    variants: ['xUnit', 'NUnit', 'MSTest', 'Jest', 'JUnit'],
    practice: [
      skill('cs-unit-testing'),
      skill('eng-testing'),
      skill('aspnet-testing-architecture'),
    ],
    tracks: ['engineering-practices'],
  },
  {
    id: 'tdd',
    label: 'TDD',
    category: 'testing',
    aliases: ['test-driven development', 'test driven development'],
    practice: [
      skill('cs-unit-testing'),
      skill('eng-testing'),
      skill('aspnet-testing-architecture'),
    ],
    tracks: ['engineering-practices'],
  },
  {
    id: 'bdd',
    label: 'BDD',
    category: 'testing',
    aliases: [
      'behavior-driven development',
      'behaviour-driven development',
      'behavior driven development',
      'behaviour driven development',
      'behavior-driven design',
      'behaviour-driven design',
      'behavior driven design',
    ],
    variants: ['SpecFlow', 'Cucumber', 'Gherkin'],
    practice: [
      skill('cs-unit-testing'),
      skill('eng-testing'),
      skill('aspnet-testing-architecture'),
    ],
    coverage: 'partial',
    gap: {
      notCovered:
        'Testing practice covers the ideas; writing Gherkin scenarios and SpecFlow or Cucumber step definitions is not practiced.',
    },
    tracks: ['engineering-practices'],
  },

  /* ---------------- Security ---------------- */
  {
    id: 'security',
    label: 'cybersecurity',
    category: 'security',
    aliases: [
      'cyber security',
      'OWASP',
      'OWASP Top 10',
      'secure coding',
      'application security',
      'information security',
      'security best practices',
    ],
    practice: [
      skill('eng-secure-coding'),
      skill('aspnet-security'),
      skill('az-identity-security'),
      challenge('secure-customer-api', 'csharp'),
    ],
    tracks: ['engineering-practices'],
  },

  /* ---------------- Architecture and integration ---------------- */
  {
    id: 'rest',
    label: 'REST',
    category: 'architecture',
    aliases: ['RESTful', 'REST API', 'REST APIs', 'RESTful API', 'RESTful APIs'],
    matchCase: ['REST'],
    practice: [skill('aspnet-http-rest'), challenge('employee-api', 'csharp')],
    tracks: ['aspnet-core'],
  },
  {
    id: 'soap',
    label: 'SOAP',
    category: 'architecture',
    aliases: ['SOAP web services'],
    matchCase: ['SOAP'],
    practice: [],
    gap: {
      notCovered: 'SOAP, WSDL and WCF services are not practiced; REST APIs are.',
      resources: [
        {
          label: 'WCF documentation',
          url: 'https://learn.microsoft.com/en-us/dotnet/framework/wcf/',
        },
      ],
    },
  },
  {
    id: 'microservices',
    label: 'microservices',
    category: 'architecture',
    aliases: ['microservice', 'micro-services', 'microservice architecture'],
    practice: [],
    relatedPractice: [
      skill('az-service-bus'),
      skill('aws-messaging-events'),
      skill('aspnet-testing-architecture'),
    ],
    gap: {
      notCovered:
        'Designing and running a microservice system (service boundaries, data ownership, service-to-service communication, deployment) is not practiced. Messaging and API practice is related.',
      resources: [
        {
          label: 'Microservices architecture (Azure Architecture Center)',
          url: 'https://learn.microsoft.com/en-us/azure/architecture/microservices/',
        },
      ],
    },
  },
  {
    id: 'oop',
    label: 'object-oriented programming',
    category: 'architecture',
    aliases: ['object oriented programming', 'object-oriented design', 'object oriented design'],
    variants: ['OOP'],
    matchCase: ['OOP'],
    practice: [
      skill('cs-oop'),
      skill('cs-records-immutability'),
      skill('cs-solid-di'),
      challenge('lru-cache', 'csharp'),
      challenge('undo-redo-history', 'csharp'),
    ],
    tracks: ['csharp'],
  },
  {
    id: 'data-structures',
    label: 'data structures and algorithms',
    category: 'architecture',
    aliases: ['data structures', 'algorithms'],
    variants: ['DSA'],
    matchCase: ['DSA'],
    practice: [
      challenge('balanced-brackets'),
      challenge('merge-intervals'),
      challenge('lru-cache'),
      challenge('text-cursor-buffer'),
    ],
    note: 'Coding challenges can be solved in TypeScript, Java or C#.',
  },
  {
    id: 'systems-analysis',
    label: 'systems analysis and design',
    category: 'practice',
    aliases: ['system analysis and design', 'systems analysis', 'systems analyst'],
    practice: [],
    relatedPractice: [skill('eng-agile-sdlc')],
    gap: {
      notCovered:
        'Analyzing a business process and producing design specifications (use cases, data flows, interface designs) is not practiced. The SDLC skill covers where analysis fits.',
    },
  },

  /* ---------------- DevOps and tooling ---------------- */
  {
    id: 'azure-devops',
    label: 'Azure DevOps',
    category: 'devops',
    aliases: ['Azure DevOps Services', 'Azure Pipelines', 'Azure Boards', 'Azure Repos'],
    variants: ['VSTS', 'TFS', 'Team Foundation Server'],
    ambiguity: {
      aliases: ['ADO'],
      context: [
        'DevOps',
        'pipeline',
        'board',
        'repo',
        'sprint',
        'work item',
        'CI/CD',
        'build',
        'source control',
        'version control',
      ],
      note: '“ADO” is counted as Azure DevOps only next to DevOps, pipeline, board or repo words (ADO.NET is a different technology).',
    },
    matchCase: ['ADO', 'VSTS', 'TFS'],
    practice: [skill('az-devops-pipelines')],
    tracks: ['azure'],
  },
  {
    id: 'github-actions',
    label: 'GitHub Actions',
    category: 'devops',
    aliases: [],
    practice: [skill('eng-ci-cd')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'cicd',
    label: 'CI/CD',
    category: 'devops',
    aliases: ['continuous integration', 'continuous delivery', 'continuous deployment'],
    variants: ['CI / CD'],
    practice: [skill('eng-ci-cd'), skill('az-devops-pipelines')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'git',
    label: 'Git',
    category: 'devops',
    aliases: ['source control', 'version control', 'source code control'],
    variants: ['GitHub', 'GitLab', 'Bitbucket'],
    practice: [skill('eng-git-workflow')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'docker',
    label: 'Docker',
    category: 'devops',
    aliases: [],
    practice: [],
    gap: {
      notCovered: 'Containers and Dockerfiles are not practiced.',
      resources: [{ label: 'Docker: get started', url: 'https://docs.docker.com/get-started/' }],
    },
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes',
    category: 'devops',
    aliases: [],
    variants: ['K8s'],
    practice: [],
    gap: {
      notCovered: 'Kubernetes is not practiced.',
      resources: [
        {
          label: 'Kubernetes basics',
          url: 'https://kubernetes.io/docs/tutorials/kubernetes-basics/',
        },
      ],
    },
  },

  /* ---------------- Cloud ---------------- */
  {
    id: 'cloud',
    label: 'cloud platforms',
    category: 'cloud',
    aliases: [
      'cloud platform',
      'cloud computing',
      'cloud services',
      'cloud technologies',
      'cloud-based',
      'cloud environments',
      'cloud',
    ],
    practice: [skill('az-functions'), skill('aws-lambda-serverless')],
    tracks: ['azure', 'aws'],
    note: 'Cloud basics are practiced on Azure and AWS.',
  },
  {
    id: 'azure',
    label: 'Azure',
    category: 'cloud',
    aliases: ['Microsoft Azure'],
    practice: [
      skill('az-identity-security'),
      skill('az-functions'),
      skill('az-service-bus'),
      skill('az-logic-apps-integration'),
      skill('az-devops-pipelines'),
    ],
    tracks: ['azure'],
  },
  {
    id: 'azure-functions',
    label: 'Azure Functions',
    category: 'cloud',
    aliases: ['Azure Function'],
    practice: [skill('az-functions')],
    tracks: ['azure'],
  },
  {
    id: 'azure-logic-apps',
    label: 'Azure Logic Apps',
    category: 'cloud',
    aliases: ['Logic Apps', 'Logic App'],
    practice: [skill('az-logic-apps-integration')],
    tracks: ['azure'],
  },
  {
    id: 'azure-service-bus',
    label: 'Azure Service Bus',
    category: 'cloud',
    aliases: ['Service Bus'],
    practice: [skill('az-service-bus')],
    tracks: ['azure'],
  },
  {
    id: 'aws',
    label: 'AWS',
    category: 'cloud',
    aliases: ['Amazon Web Services'],
    practice: [
      skill('aws-iam-security'),
      skill('aws-lambda-serverless'),
      skill('aws-api-data'),
      skill('aws-messaging-events'),
      skill('aws-iac-delivery'),
    ],
  },

  /* ---------------- Business applications ---------------- */
  {
    id: 'power-platform',
    label: 'Power Platform',
    category: 'business-apps',
    aliases: ['Microsoft Power Platform'],
    practice: [
      skill('pp-power-apps'),
      skill('pp-power-automate'),
      skill('pp-dataverse'),
      skill('pp-alm-governance'),
    ],
    tracks: ['power-platform'],
  },
  {
    id: 'power-apps',
    label: 'Power Apps',
    category: 'business-apps',
    aliases: ['PowerApps', 'Microsoft Power Apps'],
    variants: ['canvas apps', 'model-driven apps'],
    practice: [skill('pp-power-apps')],
    tracks: ['power-platform'],
  },
  {
    id: 'power-automate',
    label: 'Power Automate',
    category: 'business-apps',
    aliases: ['Microsoft Power Automate'],
    variants: ['Microsoft Flow', 'MS Flow'],
    practice: [skill('pp-power-automate')],
    tracks: ['power-platform'],
    note: 'Formerly Microsoft Flow.',
  },
  {
    id: 'dataverse',
    label: 'Dataverse',
    category: 'business-apps',
    aliases: ['Microsoft Dataverse'],
    variants: ['Common Data Service', 'CDS'],
    matchCase: ['CDS'],
    practice: [skill('pp-dataverse')],
    tracks: ['power-platform'],
    note: 'Called Common Data Service (CDS) before 2020.',
  },
  {
    id: 'dynamics-365',
    label: 'Dynamics 365',
    category: 'business-apps',
    aliases: ['Microsoft Dynamics 365', 'Dynamics CRM', 'Microsoft Dynamics CRM'],
    variants: ['D365'],
    ambiguity: {
      aliases: ['CRM'],
      context: ['Dynamics', 'D365', 'Microsoft', 'Power Platform', 'Power Apps', 'Dataverse'],
      note: '“CRM” is a general term; it is counted as Dynamics 365 only next to Microsoft, Dynamics or Power Platform words.',
    },
    matchCase: ['CRM'],
    practice: [skill('pp-dynamics-365'), skill('pp-dataverse')],
    tracks: ['power-platform'],
  },
  {
    id: 'power-bi',
    label: 'Power BI',
    category: 'business-apps',
    aliases: ['PowerBI', 'Microsoft Power BI'],
    practice: [skill('pp-power-bi')],
    tracks: ['power-platform'],
  },
  {
    id: 'dax',
    label: 'DAX',
    category: 'business-apps',
    aliases: ['Data Analysis Expressions'],
    matchCase: ['DAX'],
    practice: [skill('pp-power-bi')],
    tracks: ['power-platform'],
  },

  /* ---------------- Engineering competencies ---------------- */
  {
    id: 'debugging',
    label: 'debugging',
    category: 'engineering',
    aliases: [
      'debug',
      'debugger',
      'fix bugs',
      'fixing bugs',
      'bug fixing',
      'bug fixes',
      'correct errors',
    ],
    practice: [
      skill('cs-exceptions'),
      challenge('legacy-invoice-refactor', 'csharp'),
      scenario('cicd-pipeline-failure'),
    ],
    coverage: 'partial',
    gap: {
      notCovered:
        'You practice reading failures and exceptions and fixing code; stepping through code in a debugger (breakpoints, watches, call stacks) is not practiced.',
      resources: [
        {
          label: 'Debugging in Visual Studio',
          url: 'https://learn.microsoft.com/en-us/visualstudio/debugger/',
        },
      ],
    },
  },
  {
    id: 'troubleshooting',
    label: 'troubleshooting',
    category: 'engineering',
    aliases: ['troubleshoot', 'root cause analysis', 'root-cause analysis'],
    practice: [
      scenario('sql-performance-investigation'),
      scenario('cicd-pipeline-failure'),
      skill('mssql-performance'),
    ],
    coverage: 'conceptual',
  },
  {
    id: 'application-maintenance',
    label: 'application maintenance',
    category: 'engineering',
    aliases: [
      'software maintenance',
      'maintain existing systems',
      'maintaining existing systems',
      'maintain existing applications',
      'maintaining existing applications',
      'maintenance of existing',
    ],
    variants: ['maintenance'],
    practice: [
      skill('cs-refactoring'),
      challenge('legacy-invoice-refactor', 'csharp'),
      scenario('legacy-modernization'),
    ],
  },
  {
    id: 'legacy-modernization',
    label: 'legacy modernization',
    category: 'engineering',
    aliases: [
      'application modernization',
      'legacy systems',
      'legacy applications',
      'legacy code',
      'modernization',
    ],
    practice: [
      scenario('legacy-modernization'),
      challenge('legacy-invoice-refactor', 'csharp'),
      skill('cs-refactoring'),
    ],
  },
  {
    id: 'production-support',
    label: 'production support',
    category: 'engineering',
    aliases: [
      'on-call',
      'on call support',
      'incident response',
      'incident management',
      'application support',
    ],
    practice: [],
    relatedPractice: [scenario('cicd-pipeline-failure'), scenario('sql-performance-investigation')],
    gap: {
      notCovered:
        'Supporting a live system (incidents, on-call, communicating impact) is not practiced; the troubleshooting scenarios are related.',
    },
  },
  {
    id: 'monitoring',
    label: 'monitoring',
    category: 'engineering',
    aliases: [
      'observability',
      'application monitoring',
      'Application Insights',
      'Azure Monitor',
      'CloudWatch',
    ],
    practice: [],
    gap: {
      notCovered: 'Logging, metrics, alerts and dashboards are not practiced.',
      resources: [
        {
          label: 'Azure Monitor overview',
          url: 'https://learn.microsoft.com/en-us/azure/azure-monitor/overview',
        },
        {
          label: 'What is Amazon CloudWatch?',
          url: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html',
        },
      ],
    },
  },
  {
    id: 'software-design',
    label: 'software design',
    category: 'engineering',
    aliases: [
      'system design',
      'systems design',
      'technical design',
      'design specifications',
      'design specification',
      'design documents',
      'solution design',
    ],
    practice: [skill('cs-solid-di'), skill('aspnet-testing-architecture')],
    coverage: 'partial',
    gap: {
      notCovered:
        'Class-level design (SOLID, dependency injection, layering) is practiced; designing whole systems and writing design specifications is not.',
      resources: [
        {
          label: 'Azure Architecture Center guide',
          url: 'https://learn.microsoft.com/en-us/azure/architecture/guide/',
        },
      ],
    },
  },
  {
    id: 'code-review',
    label: 'code reviews',
    category: 'engineering',
    aliases: [
      'code review',
      'peer review',
      'peer reviews',
      'pull request reviews',
      'code walkthroughs',
    ],
    practice: [skill('eng-git-workflow')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'design-walkthroughs',
    label: 'design walkthroughs',
    category: 'engineering',
    aliases: [
      'design walkthrough',
      'walkthroughs',
      'walkthrough',
      'design reviews',
      'design review',
    ],
    practice: [],
    relatedPractice: [skill('eng-agile-sdlc')],
    gap: {
      notCovered:
        'Presenting and reviewing designs, code and test plans with a team is not practiced. Be ready to explain a design decision out loud.',
    },
  },
  {
    id: 'integration-testing',
    label: 'integration testing',
    category: 'testing',
    aliases: ['integration tests', 'integration test'],
    practice: [skill('aspnet-testing-architecture'), skill('eng-testing')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'regression-testing',
    label: 'regression testing',
    category: 'testing',
    aliases: ['regression tests', 'regression test'],
    practice: [skill('eng-testing'), skill('cs-unit-testing')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'structured-programming',
    label: 'structured programming',
    category: 'engineering',
    aliases: ['procedural programming'],
    practice: [
      challenge('reverse-string'),
      challenge('apply-edit-commands'),
      challenge('balanced-brackets'),
    ],
    note: 'Any coding challenge practices structured control flow: sequence, selection and loops.',
  },
  {
    id: 'os-fundamentals',
    label: 'operating system fundamentals',
    category: 'engineering',
    aliases: [
      'operating system facilities',
      'operating systems',
      'operating system',
      'OS fundamentals',
      'OS concepts',
    ],
    practice: [],
    gap: {
      notCovered:
        'Processes, threads, memory, permissions and the command line are not practiced (C# async practice touches threads and tasks).',
    },
  },
  {
    id: 'file-organization',
    label: 'file organization and access',
    category: 'engineering',
    aliases: [
      'file organization',
      'file access',
      'file handling',
      'file I/O',
      'file systems',
      'file system',
    ],
    practice: [],
    gap: {
      notCovered: 'Reading and writing files, file formats and access methods are not practiced.',
      resources: [
        {
          label: 'File and stream I/O in .NET',
          url: 'https://learn.microsoft.com/en-us/dotnet/standard/io/',
        },
      ],
    },
  },
  {
    id: 'security-remediation',
    label: 'security remediation',
    category: 'security',
    aliases: [
      'vulnerability remediation',
      'remediate vulnerabilities',
      'security vulnerabilities',
      'vulnerability management',
      'remediation',
    ],
    practice: [skill('eng-secure-coding'), challenge('secure-customer-api', 'csharp')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'data-validation',
    label: 'data validation',
    category: 'engineering',
    aliases: [
      'input validation',
      'business data validation',
      'validation rules',
      'validate data',
      'business rules',
    ],
    practice: [
      skill('aspnet-validation-errors'),
      challenge('employee-api', 'csharp'),
      challenge('transaction-batch', 'csharp'),
    ],
  },
  {
    id: 'data-integration',
    label: 'data integration',
    category: 'database',
    aliases: ['ETL', 'ELT', 'data pipelines', 'data pipeline', 'data migration', 'data loads'],
    matchCase: ['ETL', 'ELT'],
    practice: [
      skill('mssql-ssis'),
      scenario('transaction-processing'),
      skill('az-logic-apps-integration'),
    ],
    coverage: 'conceptual',
  },
  {
    id: 'azure-data-factory',
    label: 'Azure Data Factory',
    category: 'cloud',
    aliases: ['ADF'],
    matchCase: ['ADF'],
    practice: [],
    relatedPractice: [skill('mssql-ssis'), skill('az-logic-apps-integration')],
    gap: {
      notCovered:
        'Azure Data Factory pipelines are not practiced; SSIS and Logic Apps practice cover related integration ideas.',
      resources: [
        {
          label: 'Azure Data Factory documentation',
          url: 'https://learn.microsoft.com/en-us/azure/data-factory/introduction',
        },
      ],
    },
  },
  {
    id: 'report-development',
    label: 'report development',
    category: 'database',
    aliases: ['reporting solutions', 'business reports', 'paginated reports', 'reporting tools'],
    practice: [skill('mssql-ssrs'), skill('pp-power-bi')],
  },
  {
    id: 'apis',
    label: 'APIs',
    category: 'architecture',
    aliases: ['API', 'web API', 'web APIs', 'API development', 'API design'],
    matchCase: ['API', 'APIs'],
    practice: [skill('aspnet-http-rest'), challenge('employee-api', 'csharp')],
    tracks: ['aspnet-core'],
  },

  /* ---------------- Ways of working ---------------- */
  {
    id: 'alm',
    label: 'application lifecycle management',
    category: 'practice',
    aliases: ['ALM'],
    matchCase: ['ALM'],
    practice: [skill('pp-alm-governance'), skill('eng-ci-cd')],
    tracks: ['power-platform'],
  },
  {
    id: 'agile',
    label: 'Agile',
    category: 'practice',
    aliases: ['Agile methodology', 'Agile methodologies'],
    practice: [skill('eng-agile-sdlc')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'scrum',
    label: 'Scrum',
    category: 'practice',
    aliases: ['Scrum Master'],
    practice: [skill('eng-agile-sdlc')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'sdlc',
    label: 'SDLC',
    category: 'practice',
    aliases: ['software development life cycle', 'software development lifecycle'],
    practice: [skill('eng-agile-sdlc')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'requirements-gathering',
    label: 'requirements gathering',
    category: 'practice',
    aliases: [
      'requirements analysis',
      'requirements elicitation',
      'gathering requirements',
      'gather requirements',
    ],
    practice: [skill('eng-agile-sdlc')],
    tracks: ['engineering-practices'],
  },
  {
    id: 'technical-documentation',
    label: 'technical documentation',
    category: 'practice',
    aliases: ['technical writing', 'technical docs', 'documentation'],
    practice: [],
    gap: {
      notCovered:
        'Writing documentation is not practiced or assessed on PracStack. Be ready to describe documents you have written: design specifications, runbooks, user guides.',
      resources: [
        {
          label: 'Microsoft Writing Style Guide',
          url: 'https://learn.microsoft.com/en-us/style-guide/welcome/',
        },
      ],
    },
  },
];
