# Milestone: multi-language Skill Mastery and Web Development Challenges

Branch `multi-language-web-challenges` (from `main` at 19d3f1f). Nothing is pushed, merged or
deployed. This file is the checklist of what is done, verified, and still open.

## Done and verified

| Area                                                                                                                                                                                                                                                          | Status | Evidence                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------- |
| Python runner (3.14.10, Django 5.2.19, DRF 3.16.1)                                                                                                                                                                                                            | done   | smoke tests, every Python/Django snippet            |
| Swift runner (6.4.3, Swift 6 mode, one process per test)                                                                                                                                                                                                      | done   | every Swift snippet                                 |
| Java runner: program mode, Spring Boot 4.1.3 class path                                                                                                                                                                                                       | done   | every Java/Spring snippet                           |
| Snippet checks for Java/Python/Swift (`codeCheck`, program builders)                                                                                                                                                                                          | done   | `program-snippets.spec.ts`                          |
| Python track: 18 skills, 174 families, 430 questions                                                                                                                                                                                                          | done   | 436/436 snippets                                    |
| Java track: 18 skills, 165 families, 472 questions                                                                                                                                                                                                            | done   | 468/468 snippets                                    |
| Swift track: 15 skills, 130 families, 320 questions                                                                                                                                                                                                           | done   | 374/374 snippets (Swift 6)                          |
| Django track: 15 skills, 155 families, 325 questions                                                                                                                                                                                                          | done   | 295/295 snippets                                    |
| Spring Boot track: 15 skills, 136 families, 274 questions                                                                                                                                                                                                     | done   | 242/242 snippets                                    |
| Python and Swift in all 8 algorithm Coding Challenges                                                                                                                                                                                                         | done   | `challenge-grading.spec.ts`                         |
| Every new skill meets the mastery rule (≥2 per tier, ≥7 at tiers 4–5, ≥15)                                                                                                                                                                                    | done   | `content.spec.ts`, `check-programs`                 |
| Web runner: ASP.NET Core, Spring Boot, Django images + trusted probe                                                                                                                                                                                          | done   | runner/probe specs, reference checks                |
| Web challenge model, grading, validation, content build                                                                                                                                                                                                       | done   | `web-validate.ts`, content build                    |
| Web challenge API (runs, sessions/HTTP client, drafts, quotas, timed)                                                                                                                                                                                         | done   | `web-challenges.spec.ts` (12 tests, real runners)   |
| Web UI: catalog, detail, multi-file workspace, HTTP client                                                                                                                                                                                                    | done   | `e2e/web-challenges.e2e.ts` (4 flows, real runners) |
| 9 web challenges, 25 framework implementations (employee-rest-api, user-registration, product-search-api, pagination-sorting, order-service, fix-broken-task-api, consistent-error-handling, dependency-injection-troubleshooting, role-based-access-control) | done   | 119/119 starter, reference and mutant checks        |
| Career prep: taxonomy, roles, analyzer, planner, role progress                                                                                                                                                                                                | done   | `new-technologies.spec.ts`, role specs              |
| Docs: execution security, costs, web challenges, language support                                                                                                                                                                                             | done   | `docs/`                                             |

## Not done (see the final report for priorities)

- Angular frontend challenges and safe previews (blocked on a separate preview origin).
- AWS execution for web challenges (Fargate design in `execution-security.md`; disabled).
- Python and Swift runner functions on AWS (API reports "not available on this server").
- Full-stack challenges; database engines beyond SQLite/H2 for web challenges.
- Double-booking concurrency challenge, N+1 query challenge, regression-test-writing challenge,
  refactoring challenge, CSV import challenge, shopping cart challenge.
- Company Interview Prep recommendations of web challenges (taxonomy links exist; no company mapping).
