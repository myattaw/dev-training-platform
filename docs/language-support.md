# Language support

Runtimes used for Skill Mastery snippets and algorithm Coding Challenges. Every runtime is pinned in
a container image and runs with the controls in [runners.md](runners.md).

| Language   | Image                           | Runtime and libraries                                                                                                                                 | Challenges                | Skill Mastery checks                  |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------- |
| TypeScript | `pracstack-runner-typescript:1` | Node 22, TypeScript 5.9                                                                                                                               | yes (also in the browser) | compiled and run in the content build |
| C#         | `pracstack-runner-csharp:1`     | .NET 10, Roslyn (C# 14), ASP.NET Core                                                                                                                 | yes                       | `csharp-snippets.spec.ts`             |
| Java       | `pracstack-runner-java:2`       | Temurin 21; Spring Boot 4.1.3 libraries (web MVC, validation, Data JPA + H2, security, actuator, test: JUnit 5, Mockito, AssertJ, MockMvc); Jackson 3 | yes                       | `program-snippets.spec.ts`            |
| Python     | `pracstack-runner-python:1`     | CPython 3.14.10; Django 5.2.19, DRF 3.16.1                                                                                                            | yes                       | `program-snippets.spec.ts`            |
| Swift      | `pracstack-runner-swift:2`      | Swift 6.4.3 (Linux), Swift 6 language mode, swift-corelibs-foundation                                                                                 | yes                       | `program-snippets.spec.ts`            |

**Swift:** the language only. No SwiftUI, UIKit, Xcode, iOS SDK or simulators; the Swift track and
role say so.

## Skill Mastery tracks added in this milestone

| Track       | Skills | Families | Questions | Snippets run                                                         |
| ----------- | ------ | -------- | --------- | -------------------------------------------------------------------- |
| Python      | 18     | 174      | 430       | 436/436 on Python 3.14                                               |
| Java        | 18     | 165      | 472       | 468/468 on Java 21                                                   |
| Swift       | 15     | 130      | 320       | 374/374 in Swift 6 mode                                              |
| Django      | 15     | 155      | 325       | 295/295 on Django 5.2 / DRF 3.16                                     |
| Spring Boot | 15     | 136      | 274       | 242/242 on Spring Boot 4.1 (JPA and Actuator questions compile-only) |

Counts come from `npm run content:check-programs -- <track>`, which prints them.

## How code in questions is checked

`content/src/checks/program-snippets.ts` (Java, Python, Swift), driven by the builders in
`content/src/skill-mastery/program-builders.ts`:

- predict-output and "which output?": the program runs and must print exactly the answer;
- `fails`: the program must compile and then fail with the named error (debugging questions);
- `compiles` / `whichCompile`: the key must agree with the real compiler;
- fill-in-blank: every accepted answer is substituted and must compile and run;
- other code shown with a question must run (Java without `main`: must compile).

```bash
npm run content:check-programs -- python                 # one track
npm run content:check-programs -- java --skill java-streams
```

The full check is `content/src/checks/program-snippets.spec.ts` (needs Docker).

## Coding challenges in several languages

A challenge is defined once (instructions and tests are shared); each language adds starter code,
an entry point and a reference solution that must pass every visible and hidden test in the real
runner (`services/api/src/challenges/challenge-grading.spec.ts`). Language-specific notes:

- **Python** finds entry points and methods by name or snake_case (`isPangram` → `is_pangram`).
- **Swift** has no runtime reflection: each challenge ships a small, public, read-only adapter
  (`supportCode`) declaring `enum PracStackEntry` that converts JSON arguments and calls the
  learner's code; each test runs in its own process so a crash fails only that test.
- Values cross the boundary as JSON, encoded like the TypeScript runner's (`values.ts`).

Progress is recorded per language (`languagesSolved`), so a challenge solved in Java can be solved
again in Python or Swift; drafts are kept per challenge and language.

## Adding a language

1. A Dockerfile and harness under `packages/code-runner/docker/<language>/` that read `RunnerInput`
   from stdin and print `<nonce><RunnerOutput JSON>` (see `protocol.ts`), including `$program` mode
   for snippets.
2. Add it to `RunnerLanguage`, `RUNNER_IMAGES` and `DEFAULT_LIMITS`; `LanguageId` and labels in
   `content-model`; the editor's language map; validation of starter code in `validate.ts`.
3. Build with `npm run runners:build` and attack it like the others (`docker-runner.spec.ts`).
4. On AWS, a language needs its own runner function before the API offers it (until then it reports
   "not available on this server").
