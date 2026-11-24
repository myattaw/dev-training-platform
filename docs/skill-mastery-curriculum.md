# Skill Mastery curriculum: what works today, and what is planned

Everything listed under **Working** is in the catalog, served by the practice API and graded on
the server. Nothing under **Planned** is shown in the app: the catalog only lists skills that have
questions (at least 15 each, enforced by `content/src/content.spec.ts`).

Every working skill has at least 2 questions per difficulty tier and at least 7 at tiers 4–5, so a
learner can reach mastery (docs/scoring.md) without being served a repeat.

## How questions are checked

| Check | Applies to | How |
| --- | --- | --- |
| Executed SQL | `sql-query` questions | The reference query runs on the sample data and two hidden datasets, in PGlite (PostgreSQL) or Oracle Database Free; it must succeed everywhere, and the hidden data must give a different result than the sample (so hard-coded answers fail). |
| Compiled and run | TypeScript predict-output | Compiled with `strict`, run in a sandbox; the output must match the key. |
| Compiled | TypeScript fill-in-blank | Compiled once per accepted answer. |
| Answer key vs compiler | Multiple choice with `typeCheck` | "Does this compile?", "Which compile?" and "What type is inferred?" (exact type identity). Angular snippets compile against the real `@angular/core` types. |
| Hand-reviewed | Concept multiple choice, SQL predict-output | Written and reviewed by hand; not machine-checked. |

Variants are generated from question families with stable keys (`content/src/skill-mastery/family.ts`),
so ids never change when variants are added, and the practice server can rotate families.

## Working content

| Technology | Topics | Skills | Questions | Families | Machine-checked | Hand-reviewed | Needs a backend engine |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TypeScript | 4 | 8 | 139 | 65 | 119 | 20 | No (graded by the API) |
| Angular | 2 | 2 | 44 | 17 | 38 | 6 | No (graded by the API) |
| PostgreSQL | 5 | 6 | 141 | 69 | 118 (executed) | 23 | 118 SQL questions need the SQL runner (PGlite locally, Lambda on AWS) |
| Oracle SQL | 3 | 5 | 101 | 64 | 66 (executed) | 35 | 66 SQL questions need Oracle; **local only** (Docker), not deployed |

### TypeScript

- Types and annotations: Primitive types; Union and literal types
- Type narrowing: Narrowing with typeof and truthiness; Discriminated unions
- Objects and functions: Interfaces and object types; Function types
- Reusable types: Generics; Utility types

### Angular

- Reactivity with signals: Signals, computed and effects
- Components: Inputs, outputs, models and queries

### PostgreSQL

- Basic queries: SELECT and WHERE; ORDER BY and LIMIT
- Expressions: Functions, CASE and COALESCE
- Aggregation: GROUP BY and HAVING
- Joins: Inner, left and self joins
- Subqueries: Scalar, IN and EXISTS subqueries

### Oracle SQL (local only)

- Oracle query basics: DUAL, ROWNUM and FETCH FIRST; NULLs, NVL and COALESCE
- Oracle functions: Dates; DECODE and CASE
- Hierarchical queries: CONNECT BY

## Planned

These need tooling the content build does not have yet, so they are deliberately not in the
catalog.

| Technology | Planned skill | Why it is not built yet |
| --- | --- | --- |
| Angular | Template control flow (`@if`, `@for`, `@switch`, `@defer`) | Needs the Angular template compiler in the content checks, to verify template snippets. |
| Angular | Dependency injection in depth (providers, hierarchical injectors) | Behavior is runtime-only; needs a test harness that boots an injector. |
| Angular | Forms (signal forms, reactive forms) | Needs runtime checks of form state. |
| Angular | Routing (routes, guards, resolvers, input binding) | Needs a router test harness. |
| Angular | HTTP and `resource()` | Needs mocked HTTP in the checks. |
| TypeScript | Conditional and mapped types; classes; modules and declaration files | Straightforward with the existing checks; not written yet. |
| PostgreSQL | Window functions, CTEs (including recursive), set operations, data modification (INSERT/UPDATE/DELETE with RETURNING) | Data-modifying questions need graders that compare the table state after the statement, not a result set. |
| Oracle SQL | Analytic functions, MERGE, PL/SQL blocks | PL/SQL needs a grader for procedural output; Oracle practice is local only. |

## Enterprise tracks (Phase 5)

| Track | Skills | How answers are verified |
| --- | --- | --- |
| C# (`csharp`) | 15: value and reference types, nullable types, pattern matching, collections, OOP, records and immutability, methods and generics, delegates and events, LINQ, deferred execution, exceptions, async, unit testing and TDD, dependency injection and SOLID, refactoring | Every C# snippet is compiled, and every program run, by the real C# runner (`content/src/checks/csharp-snippets.spec.ts`) |
| ASP.NET Core (`aspnet-core`) | 8: HTTP and REST, minimal APIs and routing, middleware, DI and configuration, validation and errors, security, EF Core, testing and architecture | C# compiled against the ASP.NET Core framework; HTTP, middleware, DI and authorization questions run a real app on loopback. EF Core and design questions are reviewed reasoning |
| SQL Server (`sql-server`) | 7: querying, joins and aggregation, advanced queries, programming, transactions, performance, data modeling | Reviewed reasoning only: no SQL Server engine yet (see [enterprise-prep.md](enterprise-prep.md)) |
| Azure (`azure`) | 5: identity and security, Functions, Service Bus, Logic Apps and integration, Azure DevOps pipelines | Reviewed reasoning with realistic artifacts; no Azure account is used |
| Engineering practices (`engineering-practices`) | 5: Git, CI/CD, testing, agile and SDLC, secure coding | Reviewed reasoning; the C# test-double and security snippets are compiled and run |
| Power Platform (`power-platform`) | 6: Power Apps, Power Automate, Dataverse, Dynamics 365, ALM and governance, Power BI | Reviewed reasoning; no Microsoft tenant is used |

Every skill has at least 15 questions, at least two at each tier and at least seven at tiers 4–5
(`content/src/content.spec.ts`). Not written yet: SSIS/SSRS, and hands-on Microsoft tenant labs.
