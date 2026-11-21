# typexercise.com

Interactive TypeScript exercises in the browser, inspired by Exercism.

```bash
npm start          # dev server at http://localhost:4200
npm test           # unit tests (Vitest)
npm run build      # production build → dist/typexercise/browser
```

## Architecture

```
src/app/
  models/exercise.ts          Exercise data model + typed `defineTests()` helper
  data/exercises/             One file per exercise; index.ts is the catalog
  services/                   ExerciseService (catalog access), SolutionStorageService (drafts)
  editor/                     Monaco: lazy loader, workers, <app-code-editor>
  test-runner/                Runs the compiled JS against the tests in a Web Worker
  components/                 Reusable UI: header, exercise card, difficulty badge
  pages/                      Routed pages: home, catalog, exercise, not-found
```

**How "Run Tests" works**

1. `CodeEditor.compile()` asks Monaco's TypeScript worker for diagnostics. Type errors block the run,
   exactly like `tsc` would.
2. The same worker emits CommonJS JavaScript.
3. `TestRunnerService` starts a fresh Web Worker (`sandbox.worker.ts`), sends it the JS plus the
   exercise's test cases, and kills it after 5 s (infinite loops).
4. `sandbox-runtime.ts` loads the module, calls the exported entry point for each test case, and
   compares results with `deepEqual`.

All learner code runs **in the learner's own browser**, never on a server.

## Adding an exercise

1. Create `src/app/data/exercises/<slug>.ts` exporting an `Exercise`. Use
   `defineTests<(arg: T) => R>([...])` so test inputs and outputs are type-checked.
2. Add it to `EXERCISES` in `data/exercises/index.ts`.
3. Add a reference solution to `REFERENCE_SOLUTIONS` in `test-runner/sandbox-runtime.spec.ts`.
   `npm test` then proves the test data is correct.

## Deploying to AWS (low cost)

The app is fully static, so S3 + CloudFront is enough:

- Upload `dist/typexercise/browser/` to a private S3 bucket and serve it through CloudFront (OAC).
- SPA routing: add CloudFront custom error responses mapping 403/404 → `/index.html` (200).
- Caching: hashed `*.js`/`*.css` → `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` → `no-cache`.
- If you add a Content-Security-Policy, the sandbox needs `'unsafe-eval'` in `script-src`
  (it uses `new Function`) and `worker-src 'self'`.
