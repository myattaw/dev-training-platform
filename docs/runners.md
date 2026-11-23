# Code runners (coding-challenge submissions)

Submissions are graded on the server against the visible tests and the hidden tests: locally in
throwaway Docker containers, on AWS in isolated Lambda functions (see "On AWS" below). TypeScript also runs in the learner's browser for instant feedback on
visible tests; that browser run is a convenience and never counts.

```
Browser ──▶ API (trusted) ──docker run──▶ runner container (untrusted)
            expected values stay here       code + test INPUTS only
            grades raw outcomes  ◀────────  raw return values / errors
```

## The key design rule: expected values never enter the container

The container receives the learner's code and the test **inputs** (`toTestInput` in
`packages/challenge-runtime/src/execute.ts`). It returns what the code produced, as raw encoded
values. The API compares those with the expected values (`gradeOutcomes`). So code that
monkey-patches globals, forges output, or reads every file in the container still cannot make a
hidden test pass without computing the right answer. The tests prove it: the runner request is
checked to contain inputs and no expected values, and a forged result line is ignored.

Hidden tests are reported to the learner as **counts only**. Their descriptions, inputs, outputs,
error messages and console output are never returned (a submission's logs are dropped because
they could contain hidden inputs).

## Container isolation

Every run uses a fresh container (`packages/code-runner/src/docker-runner.ts`):

| Control | Flag / mechanism |
| --- | --- |
| No network | `--network none` |
| Read-only root filesystem; 64 MB writable `/tmp` | `--read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m` |
| Unprivileged user | `--user 10001:10001` (also `USER` in the image) |
| No capabilities, no privilege escalation | `--cap-drop ALL --security-opt no-new-privileges` |
| Default syscall filter | Docker's built-in seccomp profile |
| Memory (no swap) | `--memory` = `--memory-swap`: 256 MB TypeScript, 512 MB Java and C# |
| CPU | `--cpus 1` |
| Processes (fork bombs) | `--pids-limit` 64 (TypeScript) / 128 (Java and C#) |
| Open files, file size | `--ulimit nofile=256 --ulimit fsize=16 MB` |
| Wall-clock time | killed by name after 10 s (TypeScript) / 15 s (Java and C#), including start and compile |
| Output floods | killed after 1 MB of output |
| Nothing persists | `--rm`; a new container per run |
| No image downloads at run time | `--pull never` |
| Host environment | not passed in; the container sees only its own environment |
| Concurrency | at most 2 containers at once; at most 20 waiting, beyond which the API returns 503 |

The images contain only a runtime, a compiler and the harness: no secrets, no credentials, no
expected values. Results are read from one stdout line prefixed with a random per-run marker, so
text printed by the learner's code is never mistaken for the result.

Each control is exercised against real containers in
`packages/code-runner/src/docker-runner.spec.ts`: network access, writing outside `/tmp`, reading
host environment variables, infinite loops, memory bombs, fork bombs, output floods, early
exit, forged result lines, and the equivalent Java cases.

## Languages

| Language | Image | Harness | Notes |
| --- | --- | --- | --- |
| TypeScript | `pracstack-runner-typescript:1` (Node 22, TypeScript 5.9.3) | `docker/typescript/harness.mjs` | Type-checks with the same settings as the editor (strict, ES2022, no DOM), then runs the shared executor |
| Java | `pracstack-runner-java:1` (Temurin 21 JDK) | `docker/java/Harness.java` | Compiles in-process with the JDK compiler API; calls a static method (call tests) or a class (operations tests) by reflection |
| C# | `pracstack-runner-csharp:1` (.NET 10: runtime 10.0.15, SDK 10.0.404; Roslyn 5.0.0, C# 14) | `docker/csharp/Harness.cs` | Compiles in memory with Roslyn, with implicit usings (`System`, `System.Collections.Generic`, `System.Linq`, `System.Text`, `System.Threading`, `System.Threading.Tasks`) and nullable enabled; names also match in PascalCase (`isPangram` finds `IsPangram`, step `insert` finds `Insert`); async `Task`/`ValueTask` methods are awaited |

Java arguments are converted from JSON to the parameter types: primitives and their wrappers,
`String`, `char`, arrays (any depth) and `List<…>` (generic element types included). Return values
are encoded like the TypeScript runner's, so the same grader handles both.

Adding a language means: a Dockerfile and harness that speak the protocol in
`packages/code-runner/src/protocol.ts`, an entry in `RUNNER_IMAGES`, and a `languages` entry
(starter code + entry point) in each challenge.

### C# runner notes

- **W^X is disabled in the image** (`DOTNET_EnableWriteXorExecute=0`). With W^X on, .NET
  double-maps JIT code through a memory file that grows past the container's 16 MB `fsize`
  ulimit. The other container controls are unchanged.
- **Diagnostics IPC is disabled** (`DOTNET_EnableDiagnostics=0`), so the runtime opens no
  debugger or diagnostics socket.
- **Memory:** at the container memory limit .NET usually throws a catchable
  `OutOfMemoryException` (reported as that test's error) rather than being killed by the kernel.
- **On AWS:** a fourth runner function, `CsharpRunner` (`services/runners/docker/csharp.Dockerfile`):
  the same harness built for linux-x64 on the Node.js Lambda base image with the .NET 10
  runtime copied in, supervised like Java (prlimit, 15 s, 768 MB RSS, 384 MiB managed heap cap
  via `DOTNET_GCHeapHardLimit`), 1769 MB (one vCPU). `runner-images.spec.ts` and
  `infra/scripts/verify-runners.ts` attack it like the others. If the API has no C# function
  configured, it reports C# as unavailable ("This language is not available on this server yet.").

**Upgrading the C# runner.** Bump the pinned .NET SDK and runtime image tags in
`docker/csharp/Dockerfile` and the Roslyn package version in `docker/csharp/Harness.csproj`
together, bump the image tag in `RUNNER_IMAGES`, rebuild with `npm run runners:build`, then rerun
the container tests (`packages/code-runner/src/docker-runner.spec.ts`) and the challenge grading
tests (`services/api/src/challenges/challenge-grading.spec.ts`).

## Running locally

```bash
npm run runners:build    # builds the TypeScript, Java and C# images (needs Docker; ~1 GB of base images on first build)
npm start                # the local API uses the runner automatically
```

Without Docker or the images, the app still works: TypeScript visible tests run in the browser,
and Submit / Java runs return a clear "not available" message (HTTP 503).

The container tests fail loudly when Docker is unavailable, so a missing runner can't silently
pass CI. Set `PRACSTACK_SKIP_DOCKER_TESTS=1` to skip them deliberately.

## On AWS: Lambda runner functions (`services/runners`)

Chosen in Phase 7 over a Fargate task per run (strongest isolation, but 30–60 s per run and
about $25/month for VPC endpoints) and an always-on EC2 Docker host (about $14/month, a server
to patch, one shared kernel).

```
API function ──Invoke (IAM, 3 ARNs only)──▶ runner function (container image, x86_64)
  validates the result,                        VPC: isolated subnets, no gateway/NAT/endpoints/routes
  grades it                                    security group: no inbound, no outbound
                                               role: logs + VPC attachment; credentials removed at start
                                               per run: fresh process, prlimit, time/memory/output caps
```

Three functions: TypeScript, Java and SQL. Each image holds the language runtime, the same
harness as the local Docker images (or the PGlite engine), and a small Node.js supervisor
(`src/code-handler.ts`, `src/isolate.ts`, `src/sql-handler.ts`).

| Layer | What it does |
| --- | --- |
| **Firecracker microVM** (Lambda) | Each execution environment is its own microVM; nothing is shared with other functions or accounts |
| **No network** | The VPC has no internet gateway, NAT, endpoints or routes, and the security group allows no traffic; rejected attempts are logged (VPC flow logs). **DNS is disabled in the VPC** (`enableDnsSupport: false`): AWS's resolver otherwise answers even without routes, and lookups could carry data out; `verify-runners.ts` found this on the first deployment |
| **No credentials** | `docker/entrypoint.sh` removes the role's keys from the environment *before* the Lambda runtime starts. Without it, learner code could read them from `/proc/<supervisor>/environ` (it runs as the same OS user); the tests reproduce that and prove the fix |
| **Nothing to steal anyway** | The runner role can write its own logs and attach to the VPC; it can read no data |
| **Per-run process** | Fresh working directory, minimal environment, `prlimit` (256 processes/threads, 256 open files, 16 MB files), time limit (10 s TypeScript, 15 s Java), memory limit on the whole process tree, 1 MB output limit |
| **Clean between runs** | Environments are reused for later runs, so before and after every run the supervisor kills every other process (including ones that detached with `setsid`) and empties `/tmp` |
| **Untrusted answers** | The API validates every runner response (shape, sizes, test count) before grading; a forged response still cannot pass a test, because expected values never leave the API |
| **Cost and capacity** | Per-user limits, global limits across all users (30 code runs and 60 SQL runs per minute), and a budget action that stops runner invocations when actual spend passes the budget |

### Testing

- `services/runners/src/runner-images.spec.ts` builds the real images and attacks them under
  the Lambda Runtime Interface Emulator, run as Lambda runs them (non-root, read-only
  filesystem, writable `/tmp`, credentials in the environment, one warm container across runs):
  credential theft from any process, leftover files, detached and `setsid` processes, infinite
  loops, heap and native memory bombs, fork bombs, output floods, forged result lines, killing the
  supervisor; SQL timeouts and the read-only role.
- `services/api/src/lambda/bundle.spec.ts` sends a submission through the built API bundle, the
  AWS SDK's Lambda client and the real runner image, and checks the graded result.
- `infra/test` asserts that the VPC has no way out, that the security group allows nothing, the
  roles' permissions, and the kill switch.
- **After deploying**, `infra/scripts/verify-runners.ts` runs the same hostile probes against the
  real functions: network (HTTPS to AWS and the internet, a raw IP, DNS) and credentials in any
  process, including Lambda's own init process, which cannot be checked locally.

## Known limits (stated plainly)

- **Locally, containers share the host kernel.** Docker isolation with seccomp, no capabilities,
  no network and a non-root user is strong, but it is not a virtual machine.
- **On AWS, an environment is reused for later runs.** Runs are separated by a fresh process and
  the clean-up above, not by a fresh microVM. The learner's program runs as the same OS user as
  the supervisor, so it can kill the supervisor (that invocation fails and Lambda starts a fresh
  environment) and could, in principle, interfere with the supervisor while its own run is in
  progress. From there it still cannot reach the network or AWS, and cannot make a test pass
  without computing the right answer. What such an escape could do is tamper with *later runs in
  the same environment*: slow them, fail them, or read their code. A fresh microVM per run
  (Fargate) would close this, at the cost described above.
- **The Lambda runtime API is reachable from learner code** (on the loopback interface, as in
  every Lambda function). A program that found the current request ID could post its own
  response for its own run; the API treats it like any runner response: validated, and graded
  against expected values the runner never saw.
- **Account concurrency.** New AWS accounts can run only 10 Lambda functions at once, shared by
  the API and the runners; busy runners can then delay or fail API requests. Request a quota
  increase (free) before real use; see [aws.md](aws.md).
- **Hidden-test inputs are visible to the code under test.** That is inherent: the code must
  receive them to compute answers. They are never shown to the learner, but code could, for
  example, behave differently on specific inputs. Hidden tests detect unhandled cases; they are
  not a secret the code cannot see.
- **One bit per submission.** Each verdict reveals whether hidden tests passed; the per-user rate
  limit (10 runs or submissions per minute) bounds probing.
- **Timing.** Container start, compilation and execution share one wall-clock limit; a heavily
  loaded machine can push a correct but slow solution over it.
- **Java support is for the challenge shapes we have**: static methods and classes with
  constructors and instance methods, with the argument types listed above.
