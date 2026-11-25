# Milestone: multi-language Skill Mastery and Web Development Challenges

Branch `multi-language-web-challenges` (from `main` at 19d3f1f). Nothing is pushed, merged or
deployed. This file is the checklist of what is done, verified, and still open.

## Done and verified

| Area | Status | Evidence |
| --- | --- | --- |
| Python runner (3.14.10, Django 5.2.19, DRF 3.16.1) | done | smoke tests, every Python/Django snippet |
| Swift runner (6.4.3, Swift 6 mode, one process per test) | done | every Swift snippet |
| Java runner: program mode, Spring Boot 4.1.3 class path | done | every Java/Spring snippet |
| Snippet checks for Java/Python/Swift (`codeCheck`, program builders) | done | `program-snippets.spec.ts` |
| Python track: 18 skills, 166 families, 412 questions | done | 418/418 snippets |
| Java track: 18 skills, 162 families, 464 questions | done | 460/460 snippets |
| Swift track: 15 skills, 123 families, 304 questions | done | 358/358 snippets (Swift 6) |
| Django track: 15 skills, 133 families, 289 questions | done | 259/259 snippets |
| Web runner: ASP.NET Core, Spring Boot, Django images + trusted probe | done | runner/probe specs, reference checks |
| Web challenge model, grading, validation, content build | done | `web-validate.ts`, content build |
| Web challenge API (runs, sessions/HTTP client, drafts, quotas, timed) | done | `web-challenges.spec.ts` (12 tests, real runners) |
| Web UI: catalog, detail, multi-file workspace, HTTP client | done | `e2e/web-challenges.e2e.ts` (3 flows, real runners) |
| Web challenges: employee-rest-api (3 fw), dependency-injection-troubleshooting (ASP.NET Core, Spring Boot), role-based-access-control (3 fw), product-search-api (3 fw), pagination-sorting (3 fw) | done | `npm run content:check-web` (starters fail, references pass, mutants caught) |
| Career prep: taxonomy, roles, analyzer, planner, role progress | done | `new-technologies.spec.ts`, role specs |
| Docs: execution security, costs, web challenges, language support | done | `docs/` |

## In progress at the time of writing

- Spring Boot Skill Mastery track (being authored and checked).
- Web challenges: user-registration, consistent-error-handling, fix-broken-task-api, order-service.
- Python and Swift for the 8 algorithm Coding Challenges.

## Not done (see the final report for priorities)

- Angular frontend challenges and safe previews (blocked on a separate preview origin).
- AWS execution for web challenges (Fargate design in `execution-security.md`; disabled).
- Python and Swift runner functions on AWS (API reports "not available on this server").
- Full-stack challenges; database engines beyond SQLite/H2 for web challenges.
- Double-booking concurrency challenge, N+1 query challenge, regression-test-writing challenge,
  refactoring challenge, CSV import challenge, shopping cart challenge.
- Company Interview Prep recommendations of web challenges (taxonomy links exist; no company mapping).
