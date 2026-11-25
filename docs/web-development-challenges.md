# Web Development Challenges

Real application projects in a framework, built and run in a sandbox and graded with real HTTP
requests. Distinct from algorithm [Coding Challenges](content.md). Security: see
[execution-security.md](execution-security.md); costs: [execution-costs.md](execution-costs.md).

## What a learner does

1. Browse `/web-challenges` (filter by framework, difficulty, category, status; search).
2. Open a challenge: scenario, HTTP contract, objectives, per-framework status, history.
3. Pick a framework and open the workspace (`/web-challenges/<id>/<framework>/workspace`):
   - file explorer (read-only template files marked with a lock, edited files with a dot),
   - Monaco editor with tabs (one model per file; cursor, scroll and undo kept per file),
   - **Run application** builds and starts the project; the **HTTP client** sends requests to it,
   - **Run tests** runs the visible tests (not recorded),
   - **Submit** runs visible and hidden tests; an accepted submission marks the framework solved,
   - compiler errors link to file and line; application output in the Output tab.
4. Drafts save automatically (this browser, and the account when signed in), per challenge and
   framework. A draft written for an older challenge version is offered for recovery, never applied
   or discarded silently.
5. Timed mode (30–120 min) uses a server deadline: reloading never resets it; submissions the server
   accepts before the deadline count even if grading finishes after it; later ones are refused.

Saving or building never means solved: only an accepted submission does.

## Frameworks and runtimes

| Framework             | Runner image                  | Runtime                                   | Build                                                          | Database                    |
| --------------------- | ----------------------------- | ----------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| ASP.NET Core          | `pracstack-web-aspnetcore:1`  | .NET SDK 10.0.404                         | `dotnet build` (no NuGet)                                      | in-memory                   |
| Spring Boot           | `pracstack-web-spring-boot:1` | Temurin 21, Spring Boot 4.1.3             | `javac` on a fixed class path (`core`, `jpa`, `security` sets) | in-memory or H2 (`jpa` set) |
| Django REST Framework | `pracstack-web-django:1`      | Python 3.14.10, Django 5.2.19, DRF 3.16.1 | syntax check, `migrate`, fixtures                              | SQLite, fresh file per run  |
| Angular               | —                             | —                                         | not available (no safe preview yet)                            | —                           |

The database is always named plainly in the UI. SQLite and H2 are not PostgreSQL or SQL Server.

## Content model

`packages/content-model/src/web-challenge.ts`. A canonical challenge (`WebChallengeSource`) has one
business problem, one HTTP contract (`endpoints`), visible and hidden tests, and one implementation
per framework (`status: 'available' | 'coming-soon'`). A challenge with three verified
implementations is **one** challenge.

Files on disk, next to `challenge.ts`:

```
content/src/web-challenges/<id>/
  challenge.ts                         metadata, instructions, endpoints, tests, implementations
  <framework>/starter/**               the whole starter project (read-only unless listed editable)
  <framework>/reference/**             solved versions of the editable files only
  <framework>/mutants/<name>/**        plausible wrong versions the hidden tests must catch
```

Public: catalog summaries (manifest). Served by the API after access checks: details, starter
projects, visible tests, hidden-test categories. Private (never served): hidden tests, references.

### Tests

A test is a sequence of requests (`http.get/post/...` in `content/src/web-challenges/helpers.ts`)
with expectations: status (one or several), JSON assertions (`equals`, `exists`, `type`,
`contains`, `notContains` on dot paths; order-insensitive, keys case-insensitive) and header
patterns. `capture` reads a value (e.g. a created id) for `{{name}}` in later requests of the same
test. Tests run in order against one application instance per run, so they must not rely on
absolute counts other tests change.

### Checks

```bash
npm run web-runners:build                                   # once
npm run content:check-web -- employee-rest-api              # starters fail, references pass, mutants caught
npm run content:check-web -- employee-rest-api django       # one framework
```

`content/src/checks/web-references.spec.ts` runs the same check for every challenge in CI-like runs
(Docker required; `PRACSTACK_SKIP_DOCKER_TESTS=1` skips). The structural rules are in
`packages/content-model/src/web-validate.ts` and run in `npm run content:build`.

### Adding a framework implementation to a challenge

1. Write the starter project under `<framework>/starter/` so it builds and starts in the runner (see
   `packages/web-runner/docker/<framework>/run.sh`), with TODOs in the editable files.
2. Put the solved editable files under `<framework>/reference/`, and at least two mutants.
3. Add the implementation in `challenge.ts` (`editable`, `entryFile`, runtime text, database; for
   Spring Boot `spring: { mainClass, librarySet }`).
4. Run the check until every line passes.

### Adding a framework runner

Add `packages/web-runner/docker/<framework>/` (Dockerfile + `run.sh` that unpacks the tar from stdin
into `/tmp/app`, prints `<marker>building`, builds, prints `<marker>build-failed` or
`<marker>build-ok` and `<marker>starting`, then `exec`s the app on 127.0.0.1:8080), add the image to
`WEB_RUNNER_IMAGES` and limits to `DEFAULT_WEB_LIMITS`, teach `parseDiagnostics` its compiler
format, and allow it in `web-validate.ts`.

## API

| Method and path                                                               | Purpose                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/web-challenges/:id`                                                 | Challenge (access-checked) and the caller's progress                            |
| `GET /api/web-challenges/:id/frameworks/:framework/project`                   | Starter project                                                                 |
| `POST /api/web-challenges/:id/runs`                                           | `{ framework, files, mode: visible \| submit, timedSessionId? }` → run (queued) |
| `GET /api/web-runs/:id`                                                       | Poll a run (owner only)                                                         |
| `GET /api/web-challenges/:id/submissions`, `GET /api/web-challenges/progress` | History and progress                                                            |
| `POST /api/web-sessions`, `GET/DELETE /api/web-sessions/:id`                  | Interactive application session                                                 |
| `POST /api/web-sessions/:id/requests`                                         | HTTP-client request (relative path, approved headers)                           |
| `GET/PUT/DELETE /api/me/web-drafts/:id/:framework`                            | Account drafts                                                                  |
| `GET /api/me/web-usage`                                                       | Executions used today and limits                                                |
| `POST /api/web-timed-sessions`, `GET .../:id`, `POST .../:id/finish`          | Timed mode                                                                      |

Verdicts: accepted, tests failed, compilation error, application startup error, time limit
exceeded, resource limit exceeded, infrastructure error (never counted against the learner).

## Progress and career preparation

Accepted submissions mark a challenge solved per framework (sticky). Web challenges are an activity
kind (`web-challenge`, optional framework) in job roles, the job description analyzer's paths and
the study planner, so a Java Spring Boot posting leads to Java and Spring Boot skills and the Spring
Boot implementation of the web challenges.

## Not built yet

Angular frontend challenges and previews, full-stack (frontend + backend) projects, database
engines other than SQLite/H2 for web challenges, adding/renaming files in the workspace, language
servers (the editor highlights syntax; C# and Java also get the existing live syntax check only in
the algorithm workspace).
