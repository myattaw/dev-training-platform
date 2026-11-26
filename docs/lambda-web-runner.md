# Web Development Challenges on AWS Lambda

Status: **Phase 0 (local feasibility) and Phase 1 (runner images) done on 2026-11-26.** Nothing is
deployed.

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
  infrastructure error and an alarm), and a check on AWS of whether exiting the runtime after
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

## Next phases

2. Trusted worker: queued run in DynamoDB, async worker invokes the runner, grades, stores; global
   limit of 2 through a DynamoDB lease.
3. Batch HTTP client in the web app (local and AWS).
4. CDK: three functions in the runner VPC with no permissions, the worker, config flag, kill
   switch, alarms.
5. Security checks (`verify-runners` for web functions) and tests.
6. Staging, measure, then production with approval.
