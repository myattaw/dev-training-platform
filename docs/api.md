# PracStack API

`services/api` is a plain function from request to response (`createApi` in `src/app.ts`).
Two thin adapters run it:

- **Local server** (`src/local/server.ts`, Phase 3): Node `http`, bound to `127.0.0.1`.
- **AWS Lambda** behind API Gateway (`src/lambda/`, Phase 6): adapts HTTP API (payload v2)
  events to the same `ApiRequest`/`ApiResponse` types. Bundled into one file by
  `npm run build:lambda -w @pracstack/api`; the build fails if the SQL engine or the code runner
  would be included. Deployment: [aws.md](aws.md).

Request and response types are shared with the browser in `packages/api-contracts`. The
server never trusts them: every body is validated at runtime (`src/validation.ts`).

## Endpoints

| Method | Path                                         | Body / query               | Returns                |
| ------ | -------------------------------------------- | -------------------------- | ---------------------- |
| GET    | `/api/me`                                    |                            | user and total XP      |
| GET    | `/api/skill-mastery/progress`                | `?technologyId=`           | scores of practiced skills |
| POST   | `/api/skill-mastery/practice/next`           | `{ skillId }`              | a question + token     |
| POST   | `/api/skill-mastery/practice/hint`           | `{ token }`                | the next hint          |
| POST   | `/api/skill-mastery/practice/answer`         | `{ token, answer }`        | verdict, explanation, new score |
| POST   | `/api/skill-mastery/practice/run-sql`        | `{ token, query }`         | result on sample data (not graded) |
| POST   | `/api/challenges/:id/run`                    | `{ language, code }`       | visible tests on the server (not stored) |
| POST   | `/api/challenges/:id/submissions`            | `{ language, code }`       | verdict: visible details, hidden counts |
| GET    | `/api/challenges/:id/submissions`            |                            | last 20 submissions    |
| GET    | `/api/challenges/progress`                   |                            | solved status per challenge |
| GET    | `/api/skill-mastery/skills/:skillId/history` |                            | last 50 attempts       |
| PATCH  | `/api/me`                                    | `{ displayName }`          | updated user           |
| GET    | `/api/me/entitlements`                       |                            | plan, features, `billing.available: false` |
| GET    | `/api/me/progress`                           |                            | overview across the app |
| POST   | `/api/me/progress/import`                    | `{ importId, drafts, overwrite? }` | imported / unchanged / conflicts (idempotent) |
| GET    | `/api/me/drafts/:challengeId/:language`      |                            | an account draft       |
| GET    | `/api/me/identities`                         |                            | linked sign-in methods |
| POST   | `/api/me/identities/link-intents`            |                            | single-use link token (10 min) |
| POST   | `/api/me/identities/link`                    | `{ token }`                | links the calling identity |
| GET    | `/api/me/companies`                          |                            | saved companies with progress |
| POST / DELETE | `/api/me/companies/:slug/save`        |                            | save / unsave          |
| PUT    | `/api/me/companies/:slug/questions/:questionId` | `{ status }`            | the learner's own mark |
| GET    | `/api/me/preparation`                        |                            | target job role and saved plans |
| PUT    | `/api/me/preparation/target-role`            | `{ roleId }` (null clears) | target role (available roles only) |
| POST / DELETE | `/api/me/preparation/plans`, `/plans/:id` | `{ title, termIds }`  | save (max 10, term ids only) / delete a plan |
| GET    | `/api/scenarios/progress`                    |                            | Enterprise Scenarios the learner has started, with per-task status |
| GET    | `/api/scenarios/:id/progress`                 |                            | one scenario's task statuses |
| POST   | `/api/scenarios/:id/answer`                   | `{ taskId, answer }`       | grades a question task against the private key; returns the result, the correct answer, the explanation and progress. Challenge tasks are done only through an accepted challenge submission |
| GET    | `/api/companies`                             | `?q=&letter=&page=`        | one page of companies (25) |
| GET    | `/api/companies/:slug`                       |                            | reported questions, progress, paths |
| GET    | `/api/companies/:slug/questions`             |                            | reported questions only |
| GET    | `/api/companies/:slug/recommendations`       |                            | practice, with Pro items locked by plan |
| POST   | `/api/interview-sessions`                    | `{ companySlug, challengeId, durationMinutes, language, clientRequestId }` | session with server deadline |
| GET    | `/api/interview-sessions`                    | `?companySlug=`            | last 20 sessions       |
| GET    | `/api/interview-sessions/:id`                |                            | session + server time  |
| POST   | `/api/interview-sessions/:id/submit`         | `{ language, code }`       | graded submission (before the deadline only) |
| POST   | `/api/interview-sessions/:id/finish`         | `{ outcome }`              | finished session (idempotent) |

Company Interview Prep, timed sessions, accounts and plans are described in
[company-interview-prep.md](company-interview-prep.md), [job-roles.md](job-roles.md) (Job Role
Preparation; job postings are analysed in the browser and never sent), [accounts-and-auth.md](accounts-and-auth.md)
and [monetization.md](monetization.md). Account data is stored by `AccountStore`
(`src/store/account-store.ts`; DynamoDB layout at the top of `src/store/dynamo-account.ts`).

Errors use `{ "error": { "code", "message" } }`. Codes: `bad-request` 400, `unauthorized`
401, `forbidden` 403 (plan does not include the feature), `session-expired` 409 (timed session deadline passed), `not-found` 404, `conflict` 409, `token-expired` 410, `rate-limited` 429 (with
`Retry-After`), `internal` 500, `unavailable` 503 (e.g. the code runner is down). Messages are safe to show; internal errors are logged, never
returned.

## Rules that keep scores honest

Scores are computed only on the server (`src/practice/practice-service.ts`) with
`@pracstack/scoring`. The browser only displays results.

- **The server picks the question.** `next` chooses by the learner's score band (see
  [scoring.md](scoring.md)), avoiding recently answered questions, and issues a random,
  single-use token (UUID v4).
- **No rerolling.** While a token is unanswered and not expired, `next` returns the *same*
  question (with hints already revealed). Reloading the page does not give an easier question.
- **Hints are counted by the server.** `hint` increments the token's counter; the answer uses
  that count, not anything the browser sends.
- **Answering is idempotent.** Each token is scored once. Answering again returns the stored
  response, without scoring or awarding XP again.
- **Answers are never in served questions.** Questions are served from the private content
  bundle with answers, hints and explanations removed; explanations are returned only after
  answering.
- **Tokens expire** after 30 minutes (`410 token-expired`). A token whose question changed
  version since it was served is rejected (`409`).
- **Tokens are per user.** Someone else's token is reported as `404`, not `403`, so tokens
  cannot be probed.
- **Concurrent writes are safe.** An answer is one conditional write (token + attempt +
  mastery + XP) with optimistic concurrency on the mastery record; on conflict the server
  recomputes from the new state (up to 3 times).

Partial credit (graded in `src/practice/grading.ts`) avoids punishing minor slips: right
output with different spacing, some blanks right, or only correct options chosen in a
multiple-selection question. SQL answers are graded by running them; see [sql.md](sql.md).

## Limits

| Limit                      | Value                         | Where                  |
| -------------------------- | ----------------------------- | ---------------------- |
| Requests per user          | 120 per minute                | `rateLimiter`          |
| SQL runs and answers       | 30 per minute per user        | `sqlRateLimiter`       |
| SQL query text             | 5,000 characters              | `ANSWER_LIMITS`        |
| Code runs and submissions  | 10 per minute per user        | `codeRateLimiter`      |
| Submitted code             | 64 KB                         | `CODE_LIMITS`          |
| Request body               | 400 KB (413 above)            | `MAX_REQUEST_BODY_BYTES` |
| Predict-output answer      | 2,000 characters              | `ANSWER_LIMITS`        |
| Fill-in-blank answer       | 200 characters per blank      | `ANSWER_LIMITS`        |
| Ids                        | kebab-case, ≤ 100 characters  | validation             |

On AWS, code runs and SQL runs are also capped across all users (30 and 60 per minute), which
bounds the cost of the runner functions (see [aws.md](aws.md)).

Locally the limits are counted in memory (`SlidingWindowRateLimiter`, sliding window). On AWS
every Lambda instance has its own memory, so they are counted in DynamoDB (`DynamoRateLimiter`:
one atomic counter per user and minute, removed by TTL), and API Gateway additionally throttles
the whole API (10 requests/s, bursts of 20) as a cost ceiling.

## Storage

`ProgressStore` (`src/store/progress-store.ts`) is shaped for DynamoDB: every record is keyed
by user, and recording an answer is a single transaction. Implementations:

- `InMemoryProgressStore`: tests.
- `FileProgressStore`: local development. JSON in `.local/progress.json` (git-ignored),
  written atomically (temp file + rename). Single process only. Delete the file to reset your
  local progress.
- `DynamoProgressStore`: AWS. One table (`pk`/`sk`, TTL `ttl`); every user's records in their
  own partition; answers and submissions are DynamoDB transactions with condition checks, so a
  token is never scored twice and stale mastery is rejected. Layout documented at the top of
  `src/store/dynamo-store.ts`.

All stores pass the same behavioural contract (`src/store/progress-store.spec.ts`); the
DynamoDB one runs against DynamoDB Local in Docker.

## Authentication

`Authenticator` resolves the caller.

**On AWS: `VerifiedJwtAuthenticator`.** Learners sign in with Amazon Cognito (managed login,
authorization code + PKCE) and the web app sends the ID token as `Authorization: Bearer …`.
API Gateway's JWT authorizer verifies its signature, expiry, issuer and audience before the
function runs; the authenticator reads those verified claims (only from API Gateway's request
context, never from client input), re-checks issuer, audience, `token_use` and expiry, and
uses `sub` as the user ID. Anything missing or wrong is a 401.

**Locally: `LocalDevAuthenticator`.** **Every request is the same "Local developer" user, with
no authentication.** Because of that:

- `createApi` refuses it unless `allowLocalDevUser: true` is passed explicitly;
- the local server listens on `127.0.0.1` only, never on a network interface;
- the web app labels the session "Local mode".

The web app reads its sign-in mode from `/config.json` (`apps/web/public/config.json` locally,
written by the CDK stack on AWS).

## Running locally

```bash
npm start          # content build, then API (port 3100, reloads on change) + web (port 4200)
npm run api        # API only
```

The Angular dev server proxies `/api` to `127.0.0.1:3100` (`apps/web/proxy.conf.json`).
The server reads generated content from `content/dist/`; run `npm run content:build` after
editing content. Options: `--port`, `--data <file>`, `--content <dir>`, `--static <dir>`
(serve a built web app too; the end-to-end tests use this), and per-user rate limits
`--requests-per-minute`, `--sql-per-minute`, `--code-per-minute` (defaults 120 / 30 / 10).
Submissions run in Docker containers; see [runners.md](runners.md).
