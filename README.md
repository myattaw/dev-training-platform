# PracStack

A developer learning platform with two product areas:

- **Coding Challenges**: complete programming problems solved in a Monaco editor, with tests.
- **Skill Mastery**: adaptive practice for individual concepts (TypeScript today; PostgreSQL,
  Oracle SQL and Angular later) with a 0–100 mastery score computed by the server.

## Getting started

Requires Node 22+.

```bash
npm install
npx playwright install chromium   # once, for end-to-end tests

npm start              # content build, then API (:3100) + web dev server (http://localhost:4200)
npm run api            # API only (local developer user; see docs/api.md)
npm test               # unit tests: packages (Vitest) + web app (Angular/Vitest)
npm run typecheck      # tsc for every workspace package
npm run lint           # ESLint (TypeScript, Angular templates, accessibility rules)
npm run format         # Prettier
npm run build          # content build → web build → private-content leak check
npm run e2e            # Playwright: production build served by the local API (port 4317)
npm run verify         # everything above, in CI order
```

After editing content while `npm start` is running, run `npm run content:build` to regenerate it.
Local Skill Mastery progress lives in `.local/progress.json`; delete it to start over.

## Repository layout

npm workspaces, with the Angular workspace (`angular.json`) at the root.

```
apps/web/                    Angular 21 app (standalone, signals, zoneless, lazy routes)
  src/app/core/              Shell layout, content repository, title strategy, storage helpers
  src/app/shared/            Design-system UI, async state, Monaco editor, formatting
  src/app/features/          dashboard/, challenges/ (catalog, detail, workspace, local runner),
                             skill-mastery/ (technologies, skills, practice, results)
  src/testing/               In-memory content and fake API for unit tests
packages/
  api-contracts/             HTTP request/response types shared by web and API
  content-model/             Content types, validation, public/private split, manifest layout
  challenge-runtime/         Runs challenge tests (call + operations); shared by browser, build, runners
  scoring/                   Skill Mastery engine: pure, configurable, deterministic
services/
  api/                       API logic (Lambda-ready), local server, grading, file/in-memory stores
content/                     Authored challenges and Skill Mastery tracks + the content build
e2e/                         Playwright tests (desktop + phone)
docs/                        api.md, content.md, scoring.md
```

Dependencies point one way: `web → (api-contracts, challenge-runtime, content-model)`,
`api → (api-contracts, content-model, scoring)`, `content → (content-model, challenge-runtime)`;
`scoring` stands alone. The `content` package is Node-only (it compiles and
runs code); the browser only ever loads its generated **public** JSON.

## Current status (end of Phase 3)

| Works today                                                                     | Not built yet                                       |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Skill Mastery**: technologies, topics, skills, practice, results/history      | Accounts and sign-in (Phase 6); one local user now  |
| Server-side scoring, question selection, hints, idempotent answers              | My Progress, Profile pages                          |
| Local API with validation, rate limiting, file-backed progress                  | Server-side grading of coding challenges (Phase 5)  |
| Coding Challenges: catalog, detail, workspace, 5 challenges, browser test runs  | PostgreSQL (Phase 4), Java, Oracle SQL (deferred)   |
| Content build with execution checks and private-content leak check              | Any AWS infrastructure (Phase 6+)                   |

**Security notes:** the local API has no authentication; it serves a single "Local
developer" user and listens on `127.0.0.1` only (see [docs/api.md](docs/api.md)). The in-browser runner gives fast feedback on _visible_ tests for code the
learner wrote in their own browser. It is **not** a security boundary and never a source of
truth for progress. Hidden tests exist only in `content/dist/private/` and will be run by
isolated server-side runners.

## Design system

Light, dense, enterprise-tool styling. All values come from `apps/web/src/styles/tokens.css`;
components must not hard-code colors.

- **Global classes** (`styles/controls.css`): `.btn`, `.btn--primary`, `.btn--sm`, `.btn--link`,
  `.btn--icon`, `.input`, `.select`, `.table`, `.kv-list`, `.divided-list`.
- **Components** (`shared/ui`): `app-panel`, `app-page-header`, `app-breadcrumbs`, `app-badge`,
  `app-status-indicator`, `app-icon`, `app-alert`, `app-loading-state`, `app-empty-state`,
  `app-tabs` (WAI-ARIA tabs), `app-split-pane` (keyboard-resizable splitter),
  `app-confirm-dialog` (native `<dialog>`).

## How "Run tests" works

1. `CodeEditor.compile()` type-checks with Monaco's TypeScript worker; errors block the run.
2. The worker emits CommonJS, which `LocalRunnerService` sends to a fresh Web Worker together
   with the visible tests. The worker is terminated after 5 s.
3. The worker calls `runInSandbox` from `@pracstack/challenge-runtime`: the same code the
   content build uses to verify reference solutions.

Monaco's CSS is built as a separate non-injected bundle (`angular.json` → `styles` → `monaco`)
and linked on first use; the production builder does not load CSS imported from lazy chunks.

## More documentation

- [docs/api.md](docs/api.md): endpoints, the rules that keep scores honest, limits, storage.
- [docs/content.md](docs/content.md): adding challenges and questions, what is public vs
  private, and every check the content build enforces.
- [docs/scoring.md](docs/scoring.md): the mastery algorithm, with simulated learner journeys.

## Roadmap

1. **Frontend foundation** ✅
2. **Content model, scoring engine, monorepo** ✅
3. **Skill Mastery vertical slice** ✅
4. PostgreSQL practice (PGlite)
5. Server-side challenge evaluation (TypeScript, Java) in local containers
6. AWS foundation (CDK) _(requires cost estimate and approval)_
7. Isolated runners on AWS _(approval)_
8. Oracle SQL track _(deferred)_
9. CI/CD and production hardening
