# PracStack API

`services/api` is a plain function from request to response (`createApi` in `src/app.ts`).
Two thin adapters run it:

- **Local server** (`src/local/server.ts`, Phase 3): Node `http`, bound to `127.0.0.1`.
- **AWS Lambda** behind API Gateway (Phase 6): not built yet; it will adapt API Gateway
  events to the same `ApiRequest`/`ApiResponse` types.

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
| GET    | `/api/skill-mastery/skills/:skillId/history` |                            | last 50 attempts       |

Errors use `{ "error": { "code", "message" } }`. Codes: `bad-request` 400, `unauthorized`
401, `not-found` 404, `conflict` 409, `token-expired` 410, `rate-limited` 429 (with
`Retry-After`), `internal` 500. Messages are safe to show; internal errors are logged, never
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
multiple-selection question.

## Limits

| Limit                      | Value                         | Where                  |
| -------------------------- | ----------------------------- | ---------------------- |
| Requests per user          | 120 per minute (sliding window) | `SlidingWindowRateLimiter` |
| Request body               | 16 KB (413 above)             | local server           |
| Predict-output answer      | 2,000 characters              | `ANSWER_LIMITS`        |
| Fill-in-blank answer       | 200 characters per blank      | `ANSWER_LIMITS`        |
| Ids                        | kebab-case, ≤ 100 characters  | validation             |

On AWS, API Gateway throttling replaces the in-memory limiter (Phase 7).

## Storage

`ProgressStore` (`src/store/progress-store.ts`) is shaped for DynamoDB: every record is keyed
by user, and recording an answer is a single transaction. Implementations:

- `InMemoryProgressStore`: tests.
- `FileProgressStore`: local development. JSON in `.local/progress.json` (git-ignored),
  written atomically (temp file + rename). Single process only. Delete the file to reset your
  local progress.
- DynamoDB: Phase 6.

## Authentication

`Authenticator` resolves the caller. Phase 3 has only `LocalDevAuthenticator`: **every request
is the same "Local developer" user, with no authentication.** Because of that:

- `createApi` refuses it unless `allowLocalDevUser: true` is passed explicitly;
- the local server listens on `127.0.0.1` only, never on a network interface;
- the web app labels the session "Local mode".

Cognito JWT authentication replaces it in Phase 6, without changes to the API logic.

## Running locally

```bash
npm start          # content build, then API (port 3100, reloads on change) + web (port 4200)
npm run api        # API only
```

The Angular dev server proxies `/api` to `127.0.0.1:3100` (`apps/web/proxy.conf.json`).
The server reads generated content from `content/dist/`; run `npm run content:build` after
editing content. Options: `--port`, `--data <file>`, `--content <dir>`, `--static <dir>`
(serve a built web app too; the end-to-end tests use this).
