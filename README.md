# PracStack

A developer learning platform with two product areas:

- **Coding Challenges**: complete programming problems solved in a Monaco editor, with tests. _(Available.)_
- **Skill Mastery**: adaptive practice for individual concepts (PostgreSQL, Oracle SQL,
  TypeScript, Angular) with a 0–100 mastery score. _(Planned; see the roadmap below.)_

## Getting started

Requires Node 22+.

```bash
npm install
npx playwright install chromium   # once, for end-to-end tests

npm start              # dev server at http://localhost:4200
npm test               # unit tests (Vitest)
npm run lint           # ESLint (TypeScript + Angular templates + accessibility rules)
npm run format         # Prettier
npm run build          # production build → dist/pracstack/browser
npm run e2e            # Playwright against the production build (port 4317)
npm run verify         # everything above, in CI order
```

## Current status (Phase 1: frontend foundation)

| Works today                                                              | Not built yet                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Dashboard, challenge catalog (filters in the URL), detail page, workspace | Skill Mastery, accounts, My Progress, Profile                  |
| Monaco TypeScript editor with type checking                               | Java, server-side submissions, hidden tests                    |
| Visible tests run **in your browser** in a Web Worker                     | Any backend or AWS infrastructure                              |
| Drafts and last-run status saved in `localStorage`                        | Progress that syncs across devices                             |

Items that are not built are left out of the UI rather than shown as placeholders.

**Security note:** the in-browser runner gives fast feedback on _visible_ tests for code the
learner wrote in their own browser. It is **not** a security boundary and never a source of
truth for progress. Official grading will run in isolated server-side runners (Phase 5).

## Project structure

```
src/
  styles/                    Design tokens, element defaults, global control classes
  app/
    core/                    App-wide infrastructure
      browser/               Safe localStorage wrapper, media-query signal
      layout/                Top bar, side nav, layout state (docked vs overlay nav)
      not-found/             404 / missing-resource view
      title-strategy.ts      "Page · PracStack" document titles
    shared/
      ui/                    Design-system primitives (see below)
      content/               Structured instruction blocks (no innerHTML)
      editor/                Monaco loader, workers, <app-code-editor>
      format/                Formatting helpers
    features/
      dashboard/
      challenges/
        models/              Challenge, TestCase, defineTests()
        data/                Bundled sample challenges (moving to a content package in Phase 2)
        data-access/         ChallengeCatalogService, ChallengeProgressService (local)
        runner/              In-browser visible-test runner (Web Worker)
        pages/               catalog, detail, workspace
        ui/                  Difficulty badge, status indicator
e2e/                         Playwright tests (desktop + phone)
```

### Routes

| Path                         | Page                                                 |
| ---------------------------- | ---------------------------------------------------- |
| `/`                          | Dashboard                                            |
| `/challenges`                | Catalog (`?q=&difficulty=&category=`)                |
| `/challenges/:id`            | Challenge details                                    |
| `/challenges/:id/workspace`  | Coding workspace (full-bleed; nav becomes a drawer)  |
| `/exercises`, `/exercises/:id` | Redirects from the old URLs                        |

## Design system

Light, dense, enterprise-tool styling. All values come from `src/styles/tokens.css`;
components must not hard-code colors.

- **Tokens:** surfaces, text, borders, primary blue `#1769AA`, status colors, 4px spacing
  scale, 14px base font, 4px/8px radii, 32px control height.
- **Global classes** (`src/styles/controls.css`): `.btn`, `.btn--primary`, `.btn--sm`,
  `.btn--link`, `.btn--icon`, `.input`, `.select`, `.table`, `.kv-list`, `.divided-list`.
- **Components** (`src/app/shared/ui`): `app-panel`, `app-page-header`, `app-breadcrumbs`,
  `app-badge`, `app-status-indicator`, `app-icon`, `app-tabs` (WAI-ARIA tabs),
  `app-split-pane` (WAI-ARIA window splitter, keyboard resizable, remembers size),
  `app-confirm-dialog` (native `<dialog>`), `app-empty-state`.
- Icons are small original inline SVGs in `shared/ui/icon/icon.ts`; add one there rather than
  adding an icon library.

## How "Run tests" works

1. `CodeEditor.compile()` asks Monaco's TypeScript worker for diagnostics. Type errors block the
   run, exactly like `tsc` would.
2. The same worker emits CommonJS JavaScript.
3. `LocalRunnerService` starts a fresh Web Worker, sends it the JS plus the visible tests, and
   terminates it after 5 s (infinite loops).
4. `sandbox-runtime.ts` loads the module, calls the exported entry point for each test, and
   compares results with `deepEqual`.

Monaco's CSS is built as a separate non-injected bundle (`angular.json` → `styles` →
`monaco`) and linked by `monaco-loader.ts` on first use. The production builder does not load
CSS imported from lazy JavaScript, so without this the editor is unstyled in production.

## Adding a challenge

1. Create `src/app/features/challenges/data/<slug>.ts` exporting a `Challenge`. Use
   `defineTests<(arg: T) => R>([...])` so test inputs and outputs are type-checked.
2. Add it to `CHALLENGES` in `data/index.ts`.
3. Add a reference solution to `REFERENCE_SOLUTIONS` in `runner/sandbox-runtime.spec.ts`.
   `npm test` then proves the test data is correct.

Challenges currently support function-style tests (call the entry point with arguments,
compare the return value). Class-style problems (LRU cache, text editor) need operation-sequence
tests; that is planned with the Phase 2 content model.

## Local storage

All keys use the `pracstack:` prefix: drafts (`challenge:<id>:<lang>:draft`), last visible-test
run (`challenge:<id>:<lang>:last-run`), and layout preferences (`layout:*`). Drafts saved by the
old `typexercise:solution:<id>` keys are migrated automatically on first load.

## Roadmap

1. **Frontend foundation** ✅ design system, shell, Coding Challenges UI, lint, e2e
2. Content model and scoring engine; npm-workspaces monorepo
3. Skill Mastery vertical slice (TypeScript track, local API)
4. PostgreSQL practice (PGlite)
5. Server-side challenge evaluation (TypeScript, Java) in local containers
6. AWS foundation (CDK) _(requires cost estimate and approval)_
7. Isolated runners on AWS _(approval)_
8. Oracle SQL track _(deferred)_
9. CI/CD and production hardening
