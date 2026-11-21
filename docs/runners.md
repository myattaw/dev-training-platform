# Code runners (coding-challenge submissions)

Submissions are graded on the server, in throwaway Docker containers, against the visible tests
and the hidden tests. TypeScript also runs in the learner's browser for instant feedback on
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
| Memory (no swap) | `--memory` = `--memory-swap`: 256 MB TypeScript, 512 MB Java |
| CPU | `--cpus 1` |
| Processes (fork bombs) | `--pids-limit` 64 / 128 |
| Open files, file size | `--ulimit nofile=256 --ulimit fsize=16 MB` |
| Wall-clock time | killed by name after 10 s (TypeScript) / 15 s (Java), including start and compile |
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

Java arguments are converted from JSON to the parameter types: primitives and their wrappers,
`String`, `char`, arrays (any depth) and `List<…>` (generic element types included). Return values
are encoded like the TypeScript runner's, so the same grader handles both.

Adding a language means: a Dockerfile and harness that speak the protocol in
`packages/code-runner/src/protocol.ts`, an entry in `RUNNER_IMAGES`, and a `languages` entry
(starter code + entry point) in each challenge.

## Running locally

```bash
npm run runners:build    # builds both images (needs Docker; ~1 GB of base images on first build)
npm start                # the local API uses the runner automatically
```

Without Docker or the images, the app still works: TypeScript visible tests run in the browser,
and Submit / Java runs return a clear "not available" message (HTTP 503).

The container tests fail loudly when Docker is unavailable, so a missing runner can't silently
pass CI. Set `PRACSTACK_SKIP_DOCKER_TESTS=1` to skip them deliberately.

## Known limits (stated plainly)

- **Containers share the host kernel.** Docker isolation with seccomp, no capabilities, no
  network and a non-root user is strong, but it is not a virtual machine. A kernel exploit could
  escape a container. For the public service (Phase 7) this is the decision we deferred in
  Phase 0: AWS Lambda container functions (Firecracker microVMs, but warm containers are reused
  across invocations) versus per-run microVMs at higher cost. The protocol does not change.
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
