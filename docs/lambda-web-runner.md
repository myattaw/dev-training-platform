# Web Development Challenges on AWS Lambda

Status: **Phases 0–5 (local feasibility, runner images, trusted worker, batch HTTP client, CDK stack, post-deployment checks) done on 2026-11-26; Phase 6: live on production 2026-11-26; every post-deployment check passes, with "own run's event only" from the runtime API accepted as a stated limit.**
Nothing is deployed.

The chosen design: graded runs, visible-test runs and the HTTP client all run as **batches** on
Lambda container images, one image per framework, in the existing isolated runner VPC (no route
out, no DNS, no credentials). A batch builds the project, starts the application, sends every
request in order through the existing probe, and returns the raw responses; the API grades them,
exactly as with the local Docker runner. The same batch behavior is used locally.

## Phase 0: does it work under Lambda's conditions?

Spike: `services/runners/spike/web/` (not production code).

- `build.sh` builds `pracstack-lambda-web-{aspnetcore,spring-boot,django}:spike`: the Lambda
  Node.js 22 base (Amazon Linux 2023) with the pinned .NET SDK 10.0.404 or Temurin 21 plus the
  Spring Boot library sets, or the Lambda Python 3.14 base (Python **3.14.10**, the same version as
  the local image) with Django 5.2.19 and DRF 3.16.1. Each runs the unchanged `run.sh` and
  `probe.mjs` under a small custom runtime (`bootstrap.mjs`) that strips credentials (as
  `docker/entrypoint.sh`), limits processes (`prlimit`), watches memory, and kills every other
  process and empties `/tmp` before and after each run (as `isolate.ts`).
- `check.ts` runs every challenge's starter, reference solution and mutants through the images
  under the Lambda Runtime Interface Emulator with Lambda's conditions: non-root user (993:990),
  read-only image, writable `/tmp` only, Lambda's memory and its proportional CPU (1,769 MB =
  1 vCPU), one warm environment reused for every run. It applies the same expectations as
  `content:check-web`.
- `attack.ts` runs a hostile project in a warm environment.

### Results (this PC, Lambda-equivalent CPU limits)

| Framework    | Memory / CPU    | Checks | Whole batch (median / max) | Build (median) | Peak memory |
| ------------ | --------------- | ------ | -------------------------- | -------------- | ----------- |
| Django       | 2,048 MB / 1.16 | 36/36  | 2.9 s / 3.7 s              | ~0.9 s         | 118 MB      |
| Spring Boot  | 4,096 MB / 2.32 | 41/41  | 2.9 s / 3.5 s              | ~1.0 s         | 191 MB      |
| ASP.NET Core | 4,096 MB / 2.32 | 42/42  | 4.1 s / 4.5 s              | ~3.5 s         | 354 MB      |

Every verdict matches the Docker runner: starters fail, references pass every visible and hidden
test, and every mutant is caught by a hidden test. A "batch" here is the whole hidden-test suite,
so a learner's HTTP-client batch is no slower. Images: 1.1–1.6 GB (Lambda allows 10 GB).

At these durations a run costs about 4 s × 4 GB = 16 GB-seconds; 10,000 runs a month would stay
inside Lambda's free 400,000 GB-seconds.

### Security observations

- **Credentials:** a hostile app scanning every process's environment found no AWS keys (only
  Lambda's non-secret `AWS_LAMBDA_*` settings of the runtime process).
- **Leftovers:** a detached background process and a file in `/tmp` planted by one run were gone
  before the next run started. Runs that ended normally left only already-dead (zombie) processes
  that the runtime had not reaped yet; harmless, but Phase 1 waits for the child to exit.
- **Runtime API:** learner code can reach Lambda's runtime API on loopback, as already stated for
  the code runners in [runners.md](runners.md#known-limits-stated-plainly). An application runs
  longer than a code-runner program, so Phase 1 adds: a per-run key in the event, results signed
  by the supervisor and checked by the trusted worker (a forged response becomes an
  infrastructure error and an alarm, unless it was signed with a key read from the run's own
  event; see "Phase 6"), and a check on AWS of whether exiting the runtime after
  each run forces a fresh environment.

### Local-only findings fixed in the spike

- The Runtime Interface Emulator listens on port 8080 itself, the port every application uses;
  the probe then reached the emulator. The emulator is moved to port 9000. (On AWS nothing else
  listens on 8080; Phase 5 verifies that the probe reaches the application.)
- The Lambda base images lack `tar`, `find` and `prlimit`; `libicu` is added for .NET.

### Not testable locally (Phase 5–6, on staging)

- Network isolation (comes from the VPC; `verify-runners` is extended to the web functions).
- Real cold starts of 1.1–1.6 GB images, and Lambda's real CPU speed (this PC may be faster).
- Memory size: peak use suggests 2 GB may be enough for every framework; measure on staging.

## Phase 1: the runner functions

| Piece                                                     | Where                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Handler (one per image, `WEB_FRAMEWORK`)                  | `services/runners/src/web-handler.ts`                                                                |
| Images                                                    | `services/runners/docker/web-{aspnetcore,spring-boot,django}.Dockerfile`, `web-entrypoint.sh`        |
| Build contexts / local images                             | `npm run build -w @pracstack/runners -- --web-images` (`dist/web-*`, `pracstack-lambda-web-*:local`) |
| Batch protocol, signing, grading                          | `packages/web-runner/src/batch.ts`                                                                   |
| Probe logic (shared with the local probe image, now `:3`) | `packages/web-runner/docker/probe/probe-lib.mjs`                                                     |
| Tests                                                     | `services/runners/src/web-runner-images.spec.ts`, `packages/web-runner/src/batch.spec.ts`            |

How a batch runs:

1. The worker sends `{ runId, key, framework, tar, spring?, sequences, limits? }`. `key` is 32
   random bytes, new for every run. The handler validates everything (`parseWebBatchEvent`).
2. The handler empties `/tmp` and kills leftovers, then runs the framework's unchanged `run.sh`
   through `startIsolated` (`isolate.ts`): clean environment (no credentials, nothing from the
   function's environment), `prlimit` on processes, files and file size, a memory watch and an
   output cap, its own process group.
3. The probe runs **inside the handler process** (no separate probe process whose pipes learner
   code could reach): it waits for HTTP on 127.0.0.1:8080, then sends the sequences.
4. The handler returns `{ body, signature }`: the body JSON (with `runId`) and its HMAC-SHA256
   with the key. The key never leaves the handler's memory: it is in no environment, file or
   command line. The worker accepts only a body that verifies with the run's key and names the
   run (`verifyBatch`); anything else, such as a response learner code posts to the runtime API,
   is an infrastructure error.
5. The handler stops the application's process group, waits for it to exit (no zombies), and
   cleans up again.

Limits match the local runner: build 120 / 90 / 60 s and startup 30 / 60 / 30 s (ASP.NET Core /
Spring Boot / Django), 2,048 / 2,048 / 1,024 MB of application memory, 5 s per request, 4 MB of
output, and the function's remaining time. The worker may lower them (tests do), never raise them.
Learner-visible outcomes are those of the Docker runner (`batchToTestRun`).

Tested locally under the emulator (15 tests): the reference solution passes and the starter
fails for each framework in a reused environment; compilation errors give diagnostics; and with a
hostile Django project: no credentials readable from any process; a planted background process
and file are gone by the next run; an application that exits on start is a startup failure, one
that never listens hits the startup limit, one that allocates 3 GB is stopped for memory; and the
environment still works afterwards.

## Phase 2: the trusted web worker

```
browser ─POST /runs─▶ API ── store run (queued) ──▶ DynamoDB
                       │        ▲                     ▲
                       └─dispatch(userId, runId)      │ claim, phases, result, progress
                                │                     │
                                ▼                     │
                        web worker ── global slot (lease of 2) ──┘
                                │
                                └─ sync invoke, signed batch ─▶ web runner function (framework)
browser ─GET /web-runs/:id (poll)─▶ API ── read run ──▶ DynamoDB
```

| Piece                                                                | Where                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Run records and leases (memory/file store, DynamoDB)                 | `services/api/src/store/web-store.ts`, `dynamo-web.ts`      |
| API side: validate, per-user slot, quota, store, dispatch, serve     | `services/api/src/web/web-challenge-service.ts`             |
| Worker: claim, global slot, run, grade, record, complete, free slots | `services/api/src/web/web-run-worker.ts`                    |
| Shared: project assembly, learner-visible results, timed sessions    | `services/api/src/web/web-shared.ts`                        |
| Executors: Docker (local) and Lambda (signed batches)                | `packages/web-runner/src/executor.ts`, `lambda-executor.ts` |
| Worker function entry (bundled next to the API, same content)        | `services/api/src/lambda/web-worker.ts` → `web-worker.mjs`  |
| API → worker on AWS (`WEB_WORKER_FUNCTION`, async invoke)            | `services/api/src/lambda/handler.ts`, `invoke.ts`           |

- **Stateless API.** A run is stored as soon as it is accepted (`queued`), so any API instance
  can serve `GET /api/web-runs/:id`. Records expire after a day (DynamoDB TTL). A run item is
  gzipped and kept under 300 KB (logs, then the files of a finished run, are dropped if needed).
- **Limits.** Per user: one run at a time, a lease `user-runs#<user>` taken by the API (409
  otherwise) and freed by the worker. Globally: at most 2 runs build or run at once, a lease
  `web-runs` taken by the worker; others wait (`queued`) up to 2 minutes on AWS (5 locally) and
  then end as "busy" (infrastructure error, not an attempt). Lease holders expire after 10
  minutes, so a crashed worker cannot block anyone for long. Plus the daily quota as before.
- **Exactly once.** The worker claims the run (`queued` → `building`, conditional); a repeated
  dispatch finds it claimed and does nothing, and only the claiming worker frees the user's slot.
- **Trust.** The worker rebuilds the project from trusted content and the stored editable files,
  sends requests only, verifies the signed response with the run's key, and grades it itself. A
  response that fails verification is an infrastructure error and logs an `alarm` line
  (`web-runner-unverified`) for a metric filter.
- **Locally** the same worker runs inside the API process with the Docker executor; nothing
  changes for the browser.
- **Browse-only** remains the default on AWS until the worker function is deployed
  (`WEB_WORKER_FUNCTION` unset → `executionAvailable: false`). The API bundle is checked to contain
  no Docker runner code (`build-lambda.ts`).

Tests: `web-run-worker.spec.ts` (global limit of 2 across users, trusted grading and progress,
infrastructure errors not counted, the busy path, a repeated dispatch runs once, the Lambda
executor's signature checks and failure mapping), `store/web-store.spec.ts` (runs and leases on
the memory store and DynamoDB Local, concurrent acquisitions, item size), and
`lambda/web-bundle.spec.ts`: the real API and worker bundles with DynamoDB Local and the real
Django runner image, through the AWS SDK. A reference submission is accepted and recorded; a
response altered on its way back is an infrastructure error.

## Phase 3: the HTTP client as batch runs

Live application sessions are gone, locally too. The HTTP client is a third kind of run:

- The learner lists 1–20 requests (method, relative path, approved headers, bodies ≤ 16 KB and
  64 KB in all; `WEB_REQUEST_LIMITS`). **Send requests** creates a run with `mode: 'requests'`.
- The worker sends them as **one sequence** to one fresh application, so state carries over (a
  `POST` is visible to the next `GET`), then stops it. Nothing is graded: a completed run's verdict
  is `responded`, and its result lists each request with its response (bodies cut to 32 KB for
  display; in DynamoDB to 2 KB if the item would be too large) plus the application's output.
  Build and startup failures are reported exactly as for test runs, with diagnostics.
- Same path as every run: per-user slot (one run of any kind at a time), daily quota, global limit
  of 2, stored run, signed batch on Lambda. Never an attempt; not allowed in timed sessions.
- The request list is kept in the browser per challenge and framework.

| Piece                                      | Where                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Contract (`mode`, `requests`, `exchanges`) | `packages/api-contracts/src/web-challenges.ts`                                        |
| Validation                                 | `services/api/src/web/web-validation.ts` (`parseWebHttpRequests`)                     |
| Worker: one sequence, `toRequestsResult`   | `services/api/src/web/web-run-worker.ts`, `web-shared.ts`                             |
| UI: request list, responses, Output tab    | `apps/web/src/app/features/web-challenges/ui/http-client.ts`, `pages/web-workspace.*` |

Removed: `/api/web-sessions*`, the session policy (lifetime, idle timeout, request cap), the
"Run application" button and the in-memory session map in the API.

Tests: `web-run-worker.spec.ts` (one sequence with exactly the learner's requests, responses and
logs, long bodies cut, a missing response explained, not graded or recorded, quota counted, build
errors with diagnostics, refused in timed sessions), `web-challenges.spec.ts` (validation; the
real Django app answers requests in order and keeps state between them),
`web-bundle.spec.ts` (the same through the Lambda bundles and the runner image),
`store/web-store.spec.ts` (shrinking response bodies), `e2e/web-challenges.e2e.ts` (send two
requests in the browser, see 200 and 404, the output, and the list after a reload).

## Phase 4: the stack (CDK)

Everything is behind one flag, off by default: `-c webExecution=true` (`PracStackProps.webExecution`).
Off, the template is byte-for-byte what it was before Phase 4, and web challenges stay
browse-only. On, the stack adds:

| Resource                                   | What it may do                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 web runner functions (container images)  | Nothing: the isolated runner VPC (no route out, no DNS) and its no-traffic security group; role with logs and VPC attachment only; no environment variables |
| Web worker function (`web-worker.handler`) | Its logs, the table, and invoking exactly the 3 web runners; outside the VPC like the API                                                                   |
| API function                               | Additionally starts the worker (`WEB_WORKER_FUNCTION`); it never invokes a web runner                                                                       |
| Metric filter + 2 alarms                   | Worker errors, and any `{"level":"alarm"}` line the worker logs (e.g. `web-runner-unverified`)                                                              |

Sizes (`WEB_RUNNER_SIZES`, `WEB_WORKER`): ASP.NET Core and Spring Boot 3,008 MB (this
account's Lambda memory limit; the first production deploy at 4,096 MB was refused on
2026-11-26), Django 2,048 MB (Phase 0 measurements at 4,096 MB; checked again on AWS), 300 s timeout (the handler stops before it:
build at most 120 s, startup at most 60 s), 1,024 MB `/tmp`. The worker: 512 MB, 480 s timeout =
2 minutes waiting for a slot + one runner + margin, below the 10-minute run lease.

- **No retries.** The API's asynchronous start of the worker is delivered once
  (`MaximumRetryAttempts: 0`, events older than 5 minutes dropped): a retry after a timeout could
  hold a slot twice. A run whose worker never finished is reported by the API as an
  infrastructure error once its 10-minute lease has passed (`getRun`), so the browser stops
  waiting and the learner can run again. Never an attempt.
- **Global limit** 2 (`WEB_CONCURRENT_GLOBAL`), enforced by the worker's lease, not by reserved
  concurrency (the account's Lambda quota is too small to reserve; `runnerConcurrency` applies to
  the web runners too when set).
- **Kill switch.** The budget action's deny policy covers the worker and the web runners, and is
  attached to the worker's role as well as the API's. Attaching it to the API role by hand stops
  everything (the API can no longer start the worker). See `docs/aws.md`.
- **Alarms.** Nine in all with web execution, inside CloudWatch's ten free alarm metrics. Web
  runner errors get no alarm of their own: their timeouts and memory kills are usually the
  learner's application.
- **Assets.** `npm run deploy:prepare` stages `runners/web-{aspnetcore,spring-boot,django}` (and
  refuses to continue without them). The worker uses the API's asset (`web-worker.mjs`).
- **Outputs** (for Phase 5's `verify-runners`): `WebWorkerName`, `WebWorkerRoleName`,
  `Web{Aspnetcore,SpringBoot,Django}RunnerName`.

Tests: `infra/test/pracstack-stack.spec.ts`, "web execution": off by default; only free or
pay-per-use resource types added; runners in the VPC with no data access and no environment;
the worker's permissions, timeout arithmetic and no-retry setting; the API starts only the worker;
the kill switch covers all of it; alarms within the free ten; outputs; cdk-nag passes. API:
`web-run-worker.spec.ts` (a run whose worker never finished ends after its lease).

## Phase 5: post-deployment checks for the web functions

`infra/scripts/verify-runners.ts` now also checks the web runners when the stack has web
execution (and says it skipped them otherwise). The checks live in
`services/runners/src/web-verify.ts` and run unchanged in two places: on AWS after a deployment,
and locally in `web-verify.spec.ts` against the three images under the Lambda Runtime Interface
Emulator, with fake credentials in the function's environment and an internal Docker network
with no way out standing in for the VPC.

For each framework (ASP.NET Core, Spring Boot, Django):

| Check                                     | How                                                                                                                                            | Local result |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Runs a real challenge, signed             | The first challenge's reference solution: every visible and hidden test passes; the response verifies with its run's key and with no other key | pass (15/15) |
| Probe application runs                    | A small app per framework (`webProbeApp` in `probes.ts`): `POST /probe` runs a Node.js script                                                  | pass         |
| No network                                | HTTPS to the Lambda endpoint, to the internet and to a raw IP, and DNS, from inside the app                                                    | pass         |
| No AWS credentials in any process         | Every `/proc/*/environ`; also that other processes' environments are readable (the check is real)                                              | pass         |
| No leftovers between runs                 | One run leaves a detached process and a file in `/tmp`; the next run in the same environment (same init start time and boot id) finds neither  | pass         |
| No other run's event from the runtime API | From inside the app, `GET /runtime/invocation/next` on Lambda's runtime API must return no event, or only the run's own (accepted in Phase 6)  | pass         |

### Known finding: the runtime API (measured and decided in Phase 6)

Under the emulator, learner code can call Lambda's runtime API during its run (it is on
loopback, as for the code runners) and receives an invocation event, in all three images. Only
one run was in flight each time, so it was almost certainly the run's own event (not yet
confirmed). That event holds the run's signing key.

What it would allow, as assessed: the learner could sign a result for their **own** run. Grading
compares response content with expected values that never leave the worker, so a forged result
still needs the correct responses, which is the same as solving the challenge. It gives no access
to other users' runs (every learner process is killed before a run ends) and reveals no expected
values (the event's requests reach the application anyway). It does break one claim made above:
"a forged response becomes an infrastructure error" holds only for forgeries made without
reading the event.

Decision (2026-11-26): **measure first.** The check stays strict. Locally it is a known failure
(`it.fails` in `web-verify.spec.ts`, so the suite stays green and a change in behavior is
flagged); on staging, `verify-runners` shows whether real Lambda behaves like the emulator.
Then decide: accept "own event only" as a stated limit (and narrow the check to other runs'
events), or harden the design.

## Phase 6: on AWS (production, 2026-11-26)

By the owner's choice, staging was skipped (no users yet) and web execution went straight to
`PracStack-production` (`-c webExecution=true`), each deploy approved after its `cdk diff`.

Two problems the local images did not show, both fixed:

- **Memory limit.** This account allows at most 3,008 MB per function; the first deploy (4,096
  MB) was refused and rolled back. ASP.NET Core and Spring Boot now use 3,008 MB.
- **Open files.** Lambda's hard limit is 1,024 open files; the handler asked for 2,048, `prlimit`
  failed and every run ended as "The runner could not build the project." It now asks for 1,024.
  The local image tests now run with Lambda's limits (`--ulimit nofile=1024:1024`, 3,008 MB).

`verify-runners` on production after the fixes: every check passes (code runners; web reference
solutions 15/15 each; no network; no credentials; no leftovers between runs in a reused
environment) **except the runtime API check, in all three frameworks.** `smoke-test`: 17/17. After
the decision below, every check passes (26/26).

Reference solution, 15 tests in one batch, on Lambda:

| Framework    | Memory   | First (cold) run | Warm run |
| ------------ | -------- | ---------------- | -------- |
| Django       | 2,048 MB | 15.9 s           | 3.2 s    |
| Spring Boot  | 3,008 MB | 23.2 s           | 5.4 s    |
| ASP.NET Core | 3,008 MB | 41.6 s           | 8.0 s    |

Warm runs are close to the Phase 0 local numbers (3–5 s); a learner's first run after a quiet
period is the slow one.

### The runtime API finding, measured

Real Lambda behaves like the emulator: learner code received an event in every framework. On
Django the event's request ID (`f7d5f4f9…`) was **the probe invocation's own** (CloudWatch START
line), and the environment's next invocations started normally. So it is "own event only", as
assessed above: the learner can read their own run's key and could sign a result for their own
run, which still needs the correct responses to pass. Other users' runs and expected values are
not exposed.

**Decision (owner, 2026-11-26): accepted as a stated limit.** The check now fails only if learner
code receives an event of **another** run: the probe reports the runId of the event it took (never
its key), and it must be the probe run's own. It is named "cannot take another run's invocation
from the runtime API" and passes on production and locally, where it is a plain test again.
