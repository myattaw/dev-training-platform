# Enterprise developer preparation (Phase 5)

PracStack now prepares people for enterprise .NET and Microsoft-stack jobs, not only
algorithm interviews. This document records what is implemented, how it is verified, and
what each part needs to run on AWS.

## What is genuinely executed, and what is not

| Area | How answers are checked |
| --- | --- |
| C# coding challenges | Compiled with Roslyn and run in the C# runner container against hidden tests ([runners.md](runners.md)) |
| ASP.NET Core API exercises (e.g. Employee Management API) | The learner's endpoints run in a real ASP.NET Core app on a loopback port inside the sandbox; a read-only test driver sends real HTTP requests |
| C# Skill Mastery questions | Every C# snippet is compiled, and every program is run, by the same runner at content-check time (`content/src/checks/csharp-snippets.spec.ts`) |
| ASP.NET Core Skill Mastery questions | Compiled against the ASP.NET Core shared framework; HTTP and dependency-injection questions run a real app |
| SQL Server (T-SQL) | **Not executed.** Questions are reviewed reasoning only (see "SQL Server" below) |
| Azure, Power Platform, engineering practices | **Not executed.** Scenario-based questions with realistic artifacts; no Azure, Microsoft 365 or Power Platform tenant is used |

Questions that are not machine-checked say so in their track description, and no page
claims execution that does not happen.

## C# runner on AWS

On AWS, C# runs in its own runner function (`CsharpRunner`, see [runners.md](runners.md)):
the same Roslyn harness as the local Docker image, on the Node.js Lambda base image with the
.NET 10 runtime, supervised like Java. Its attacks run locally in `runner-images.spec.ts`
(credentials hidden from every process, clean-up between runs, loops and memory bombs, ASP.NET
Core on loopback), and `infra/scripts/verify-runners.ts` probes the deployed function for
network access and credentials. `DOTNET_EnableWriteXorExecute=0` (the file-size limit otherwise
breaks the JIT) and `DOTNET_EnableDiagnostics=0` are set as locally.

**Cost.** Lambda bills per GB-second, so the runner costs nothing while idle. A typical C#
submission takes 1–2 s at 1 GB; an ASP.NET Core API submission (one app per test) about
6 s. At Lambda's on-demand x86 price that is roughly $0.00002–$0.0001 per submission, so
10,000 submissions a month would cost on the order of a dollar. The existing per-user and global
rate limits and the budget kill switch apply unchanged. The image is ~220 MB (ECR storage
cents per month); cold starts add about a second.

**Remaining risks** are those already listed for Java in [runners.md](runners.md) (warm
environments are reused between runs and separated by process clean-up, not a fresh
microVM). In addition, .NET keeps a thread pool, so the process limit must stay well above
its needs (256 is enough in tests).

## SQL Server (T-SQL)

The SQL Server track is a curriculum of reasoning questions; **no T-SQL is executed**.
Running learners' T-SQL needs a real SQL Server, and two things block it:

- **License acceptance.** The official `mcr.microsoft.com/mssql/server` image only starts with
  `ACCEPT_EULA=Y`. Accepting Microsoft's license terms is the owner's decision, so this
  phase did not do it.
- **Edition.** Developer edition is free but licensed for development and testing only.
  Serving learners on a public site is production use, so production needs **Express**
  (free, licensed for production: 10 GB per database, limited memory and cores, ample for
  practice databases) or a paid edition.

Options for a later phase:

| Option | Fit | Monthly cost (order of magnitude) |
| --- | --- | --- |
| Local only: SQL Server Developer in Docker, like the Oracle track | Development and content checks | Free; needs about 2 GB RAM and accepting the EULA |
| Amazon RDS for SQL Server Express (license included, smallest instance) | Production; managed backups and patching | Tens of dollars, always on, plus a VPC path from the runner |
| Express in a container on a small always-on host | Production; you patch it | Similar to the RDS option, more operations work |

Lambda cannot host SQL Server, so any production option is an always-on database, unlike the
current pay-per-use runners. When it is chosen, add a `sqlserver` dialect to
`packages/sql-engine` following `oracle-engine.ts` (a long-lived database, one locked-down
schema per dataset, a read-only learner login, statement timeouts, row limits), then enable
`sql-query` questions with `dialect: 'sqlserver'`.

## Enterprise Scenarios

See `packages/content-model/src/scenario.ts`. A scenario has business context, requirements,
acceptance criteria, artifacts and tasks; each task is either an executable challenge (graded
by the code runner) or a question graded by the API against a private key. Each scenario states
its own limitations, e.g. "the workflow design is assessed by reasoning questions; nothing runs
in Power Automate".

## Job Role Preparation and the job description analyzer

See [job-roles.md](job-roles.md).
