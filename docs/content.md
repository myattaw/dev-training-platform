# Content: authoring, validation and the public/private split

All learning content lives in the `content/` workspace as type-checked TypeScript.
`npm run content:build` validates it and generates JSON:

```
content/dist/public/    served to browsers (copied into the web build under /content/)
  manifest.json                     PublicManifest: challenge summaries, technologies, contentVersion
  challenges/<id>@<version>.json    Challenge (public): instructions, starter code, visible tests
  skill-mastery/<technology>.json   TrackCatalog: technologies, topics, skills (no questions)

content/dist/private/   for the API and code runners; never served
  challenges/<id>@<version>.grading.json          hidden tests + resource limits
  skill-mastery/<technology>/<skill>.questions.json  questions with answers, hints, explanations
```

Both directories are generated and git-ignored. `npm start` and `npm run build` regenerate them.

## What is public and what is private

| Public (shipped to the browser)                         | Private (server only)                                  |
| ------------------------------------------------------- | ------------------------------------------------------ |
| Challenge instructions, starter code, **visible** tests | **Hidden** tests, execution limits, reference solutions |
| Technology / topic / skill names and descriptions       | **All questions**: prompts, options, answers, hints, explanations |

Questions are private in full, not just their answers: the API serves them one at a time, so
learners cannot browse the bank and pick easy questions.

The split is a **whitelist** (`packages/content-model/src/split.ts`): public objects are rebuilt
field by field. A new authoring field stays private until someone deliberately adds it there.

## Guarantees enforced by the build

`npm run content:build` exits with an error, and so `npm run build` stops, if any of these fail:

- **Structure** (`validate.ts`): kebab-case ids, unique ids (challenges, topics, skills, and
  questions across all tracks), positive versions, non-empty instructions, balanced backticks,
  no Markdown syntax (only `` `code` `` is supported in text), starter code exports the entry
  point, at least one hidden test, one test kind per challenge, at least 3 questions per skill,
  multiple-choice answer keys that match the options, fill-in-blank answers that match the
  template's `{{blank:id}}` markers.
- **Reference solutions** (`checks/reference-solutions.ts`): each challenge's
  `reference.ts` must pass **every visible and hidden test**. This proves the expected values are right.
- **Executed snippets** (`checks/typescript-snippets.ts`), with the same compiler settings as the
  learner's editor (strict, ES2022, no DOM):
  - predict-output code must type-check, and running it must print exactly the stored answer;
  - each accepted fill-in-blank answer, substituted into the template, must type-check.

Warnings (reported, not fatal): skills missing some difficulty levels, hidden tests that duplicate
visible ones.

After the web build, `npm run content:check-leaks` scans every bundle file for private strings
(hidden-test descriptions, prompts, hints, explanations…) and fails the build if any appear as a
string value. It is unit-tested with planted leaks (`content/src/leak-check.spec.ts`).

## Adding a coding challenge

1. Create `content/src/challenges/<id>/challenge.ts` exporting `source: ChallengeSource`:
   the public `challenge` plus `hiddenTests` (and optional `limits`).
2. Create `content/src/challenges/<id>/reference.ts` with a working solution that exports the
   entry point (a function, or a class for operations tests).
3. Register both in `content/src/challenges/index.ts`.
4. Run `npm run content:build`.

Tests come in two kinds:

```ts
// Function-style: call the entry point and compare the return value.
callTests<(s: string) => boolean>([{ description: 'empty', input: [''], expected: false }]);

// Class-style: construct, then call methods in order; `expected` is checked when present.
operationTests<typeof LRUCache>([
  {
    description: 'evicts the least recently used key',
    constructorArgs: [2],
    steps: [{ call: 'put', args: [1, 1] }, { call: 'get', args: [1], expected: 1 }],
  },
]);
```

Both helpers type-check inputs, method names and expected values against the signature or the
reference class.

## Adding Skill Mastery questions

Questions live next to their track, e.g. `content/src/skill-mastery/typescript/union-types.ts`.
Supported formats:

| Format            | Learner sees                          | Private answer                                 |
| ----------------- | ------------------------------------- | ---------------------------------------------- |
| `multiple-choice` | prompt, optional code, options        | `correct` option ids (`selection: single/multiple`) |
| `predict-output`  | prompt and code                       | exact `output` (trailing whitespace ignored)   |
| `fill-in-blank`   | code with `{{blank:id}}` markers      | `accepted` answers per blank                   |

Every question also has `difficulty` (1–5), `hints` (revealed one at a time, reducing the
mastery gain) and an `explanation` (shown after answering). Aim for questions at every
difficulty level in each skill; practice offers the band's target difficulty (see
[scoring.md](scoring.md)) and falls back to the nearest level.

SQL-query questions (PostgreSQL) arrive in Phase 4 with the PGlite engine.

## Versioning

- `id`s are permanent. Never rename or reuse one: attempts and progress reference them.
- Increment `version` when instructions, tests or answers change meaningfully. Challenge files
  are named `<id>@<version>.json`, so browsers can cache them forever; the manifest is always
  revalidated.
- `contentVersion` in the manifest is a hash of all generated content and changes with any edit.
- `SCHEMA_VERSION` (in `content-model/src/manifest.ts`) changes only when the generated file
  shapes change incompatibly; the web app refuses content with a different schema.
