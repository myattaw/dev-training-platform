# Execution security: web applications, new language runners

Web Development Challenges build and run **whole applications written by learners** (several
files, a framework, an HTTP server) and send them HTTP requests. This is a much larger attack
surface than calling one function in a sandbox (see [runners.md](runners.md) for the algorithm
runners), so this document states the threat model, the controls, what is verified, and what is
**not** production-ready.

**Status:** local Docker execution is implemented and tested. Nothing is deployed to AWS; the AWS
API serves web challenges **browse-only** (no runner is configured there). Production execution
needs the work listed under [Production blockers](#production-blockers) and explicit approval.

## Architecture

```
Browser ──editable files──▶ API (trusted)
                             │ validates paths/sizes, assembles the trusted template + edits,
                             │ enforces plan, quota, concurrency; keeps tests and expectations
                             ▼
             ┌──────────── app container (UNTRUSTED) ─────────────┐
             │ --network none (loopback only), read-only root,     │
             │ noexec /tmp tmpfs, uid 10001, no capabilities,      │
             │ no-new-privileges, memory/CPU/pids/nofile caps      │
             │ run.sh: unpack tar → build → start app on :8080     │
             └───────────────▲─────────────────────────────────────┘
                             │ shares ONLY the network namespace (loopback)
             ┌───────────────┴──── probe container (trusted image) ─┐
             │ receives requests (never expected values), sends     │
             │ them to 127.0.0.1:8080, returns bounded raw responses│
             └──────────────────────────────────────────────────────┘
                             │
API grades the raw responses against expectations it never shared (semantic JSON).
```

Code: `packages/web-runner` (orchestration, probe, images), `services/api/src/web` (service,
validation), `packages/content-model/src/web-grading.ts` (grading).

The same principle as the algorithm runners applies: **expected values never enter a container**.
The probe receives requests only; the application receives requests only. A submission that
prints "all tests passed", forges marker lines, or answers the probe with crafted data still has to
produce the correct HTTP responses: grading happens in the API.

## Threat model

| Threat                                           | Control                                                                                                                                                                                                                                                                                                | Verified by                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Arbitrary code execution (by design)             | Runs only inside the app container; nothing on the host executes learner code                                                                                                                                                                                                                          | Design; runner spec                                                             |
| Container escape                                 | Unprivileged uid, all capabilities dropped, `no-new-privileges`, Docker's default seccomp, read-only root, no host mounts, no Docker socket, `--pull never`                                                                                                                                            | `docker-runner.spec.ts` (code runner); web runner uses the same flags           |
| Privilege escalation inside the container        | No setuid binaries usable (`nosuid` tmpfs, `no-new-privileges`), non-root user                                                                                                                                                                                                                         | Flags                                                                           |
| Filesystem access                                | Read-only root; only `/tmp` (tmpfs, `noexec,nosuid,nodev`, size-capped) is writable; nothing persists (`--rm`)                                                                                                                                                                                         | Flags; `web-challenges.spec.ts`                                                 |
| Credential theft                                 | No environment from the host; no credentials in images; the container has no network to reach a credential service                                                                                                                                                                                     | Image review; flags                                                             |
| Cloud metadata / SSRF / internal services        | `--network none`: the app container has only loopback. The HTTP client cannot name a host: the API accepts only relative paths, sends them through the probe, which only connects to 127.0.0.1:8080                                                                                                    | `parseWebHttpRequest` tests (URLs, `//host`, CRLF, `Host` header, metadata IPs) |
| Redirect-based bypass                            | The probe never follows redirects (Node `http.request`); a 3xx is returned as data                                                                                                                                                                                                                     | Probe code                                                                      |
| Host-header manipulation / DNS rebinding         | Host header is set by the probe and cannot be supplied; there is no DNS (no network)                                                                                                                                                                                                                   | Header allowlist tests                                                          |
| Path traversal in submissions                    | Submitted paths must equal one of the challenge's editable paths exactly; plus a safe-path pattern; tar contains only regular files and directories                                                                                                                                                    | `validateSubmittedFiles` tests (API spec)                                       |
| Build-script / dependency attacks                | Build files (`.csproj`, `pom.xml`, `settings.py`, migrations) are read-only template files; Spring uses a fixed class path; .NET has no NuGet access; Python has no pip; no network                                                                                                                    | Read-only files enforced server-side                                            |
| Denial of service: CPU, memory, fork bombs, disk | `--cpus`, `--memory` = `--memory-swap`, `--pids-limit`, tmpfs size, `nofile` ulimit, no core dumps                                                                                                                                                                                                     | Flags; OOM → `resource-limit-exceeded`                                          |
| Long-running / persistent processes              | No application outlives its run: every run (tests, submission or HTTP-client requests) builds, starts, sends its requests and stops. Build deadline, startup deadline, hard lifetime (5 min); `docker rm -f` on every exit path; leftover containers (label `pracstack.web=1`) removed at server start | `DockerWebRunner`                                                               |
| Output flooding                                  | Output bytes capped (4 MB) then the container is stopped; only the last 400 lines kept; response bodies capped at 64 KB by the probe                                                                                                                                                                   | Runner code                                                                     |
| Cross-user access                                | Runs, sessions, drafts, submissions and timed sessions are looked up by id AND owner; foreign ids are 404                                                                                                                                                                                              | `web-challenges.spec.ts` (alice/bob)                                            |
| Hidden test theft                                | Hidden tests and references are private content (never in the web bundle; leak check); hidden results reveal only categories; application logs are never returned for submissions (they could echo hidden requests)                                                                                    | Leak check; API spec                                                            |
| Result forgery                                   | Grading in the API from raw responses; marker lines only affect the learner's own run state                                                                                                                                                                                                            | Design                                                                          |
| Abuse of execution quotas                        | Server-side daily quota per plan, per-user concurrency (1 run of any kind), global concurrency of 2 runs (web worker), per-minute rate limit, global concurrency and queue limits, kill switch                                                                                                         | API spec (quota, concurrency)                                                   |
| Malicious frontend previews                      | No frontend preview exists yet (see below)                                                                                                                                                                                                                                                             | —                                                                               |

### Known limits (stated plainly)

- **Docker shares the host kernel.** Seccomp, no capabilities and a non-root user are strong, but a
  kernel vulnerability could allow an escape. Locally this is acceptable for development; for a
  multi-tenant production service it is **not sufficient on its own** (see blockers).
- **The app sees hidden-test requests** as they arrive (inherent: it must answer them). It cannot see
  the expected responses.
- **One bit per submission**: each verdict reveals whether hidden tests passed; quotas and rate
  limits bound probing.
- **Same-user state:** the marker the entry script prints status with can be read by the learner's
  own code (same uid). Forging it only breaks or confuses that learner's own run.
- **Framework tests in-process:** grading uses only external HTTP behavior. No grader code runs inside
  the application process (by design, so the application cannot tamper with it).
- **Resource accounting is per container**, not per user across containers; global concurrency
  (`maxConcurrent`) bounds the total.

## Language runners (Python, Swift, Java with Spring)

The new algorithm/snippet runners reuse the existing container controls ([runners.md](runners.md)):

- **Python** (`pracstack-runner-python:1`, CPython 3.14.10, Django 5.2.19, DRF 3.16.1): pip removed,
  `PYTHONDONTWRITEBYTECODE`, `-s -P` (no user site, no script directory on `sys.path`),
  `PYTHONHASHSEED=0` for reproducible output.
- **Swift** (`pracstack-runner-swift:2`, Swift 6.4.3, Swift 6 language mode): compiles to `/tmp`, so
  that tmpfs is mounted **exec** (the only runner that needs it; everything else is `noexec`). One
  process per test, so a crash fails only that test. 1 GB memory, 30 s.
- **Java** (`pracstack-runner-java:2`): adds a fixed, pinned Spring Boot 4.1.3 class path; logging
  is WARN-only. 768 MB, 20 s.

## Frontend (Angular) challenges and previews

**Not implemented.** Running learner frontend code safely needs a separate preview origin (a
different registrable domain), a sandboxed iframe without `allow-same-origin`, a strict CSP, no
access to PracStack tokens or storage, and a browser-test grader (Playwright) in its own isolated
container. That infrastructure does not exist yet, so no preview is exposed and Angular appears only
as "coming soon". Do not add an iframe preview on the PracStack origin.

## Production blockers

1. **Isolation boundary.** Use a VM-level boundary per run (e.g. ECS Fargate tasks, one task per
   run/session, or Firecracker/gVisor workers), not shared-kernel Docker on a shared host.
2. **Network design on AWS.** Task in isolated subnets with no NAT/IGW/endpoints, security group with
   no egress, the probe as a sidecar in the same task (shared `localhost` in `awsvpc` mode).
3. **Job orchestration.** The local API keeps run jobs in memory. On AWS (stateless Lambda) runs need
   a queue (SQS), a worker that starts tasks, and results in DynamoDB. (Done for the chosen Lambda
   design: stored runs, a web worker and batch runs for the HTTP client too, so no session router
   is needed; see `docs/lambda-web-runner.md`.)
4. **Global limits and kill switch** wired to the existing budget action (stop starting tasks when
   spend passes the budget).
5. **Load and abuse testing** of the deployed design, including the probes in `verify-runners.ts`
   extended to web tasks (egress, metadata, credentials).
6. **Frontend previews** need the separate-origin design above.

Until these are done, `PRACSTACK_WEB_EXECUTION` stays unset on AWS (there is no runner), and the
API reports web challenges as browse-only.

## Operating locally

```bash
npm run web-runners:build                 # builds the 3 framework images + the probe (once)
npm start                                 # the local API uses them automatically
PRACSTACK_WEB_EXECUTION=off npm run api   # kill switch: browse-only
docker rm -f $(docker ps -aq --filter label=pracstack.web=1)   # manual clean-up (also done at API start)
```
