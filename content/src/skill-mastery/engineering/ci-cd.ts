import type { QuestionSource } from '@pracstack/content-model';
import { plain, yaml } from '../helpers';
import { scenarioFamily, selectFamily } from './builders';

/*
 * CI/CD with GitHub Actions: triggers, job ordering, permissions, secrets, OIDC,
 * environments, release strategies, caching and matrices. Workflow YAML and run
 * logs are reviewed by hand.
 */

export const ciCdFamilies: readonly QuestionSource[] = [
  // ---------------------------------------------------------------- Triggers
  ...scenarioFamily(
    'eng-ci-triggers',
    1,
    'Read the `on:` block: each event and its filters decide when the workflow starts.',
    [
      {
        key: 'push-and-pr',
        question: 'When does this workflow run?',
        code: yaml(`name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test`),
        correct:
          'On every push to `main`, and when a pull request targeting `main` is opened or receives new commits',
        wrong: [
          'Only when a pull request into `main` is merged',
          'On pushes to any branch, as long as a pull request exists',
          'Only when someone starts it manually from the Actions tab',
        ],
        why: '`push` with `branches: [main]` fires for commits pushed to `main`. `pull_request` with `branches: [main]` filters on the base branch, so it fires for pull requests that target `main` (by default when opened, reopened or updated with new commits). Running on pull requests is what lets CI report results before the merge.',
      },
      {
        key: 'manual-run',
        difficulty: 2,
        question:
          'Operators want to start a deployment workflow by hand, choosing the target environment from a list. Which trigger provides that?',
        correct: '`workflow_dispatch` with an `inputs` entry of type `choice`',
        wrong: [
          '`schedule` with a cron expression',
          '`workflow_call`, so other workflows can call it',
          '`push` with `branches: [deploy]`',
        ],
        why: '`workflow_dispatch` adds a "Run workflow" option in the Actions UI (and the API and CLI), and its `inputs` can be strings, booleans or a `choice` list. `workflow_call` makes a reusable workflow that other workflows call; it does not give people a manual trigger. Pushing to a special branch works, but it is not a manual run with a chosen environment.',
      },
    ],
  ),
  ...selectFamily(
    'eng-ci-path-filters',
    3,
    'Both the branch filter and the path filter must match for a push to start the workflow.',
    [
      {
        key: 'src-only',
        question: 'Which of these pushes start the workflow?',
        code: yaml(`on:
  push:
    branches: [main]
    paths:
      - 'src/**'`),
        right: [
          'A push to `main` that changes `src/api/users.ts`',
          'A push to `main` that changes `src/app.ts` and `README.md`',
        ],
        wrong: [
          'A push to `main` that changes only `docs/setup.md`',
          'A push to `feature/login` that changes `src/app.ts`',
        ],
        why: 'With `paths`, the workflow runs when at least one changed file matches a pattern, so a commit touching `src/app.ts` and `README.md` still runs it. A docs-only push does not. The `branches` filter applies at the same time, so a push to `feature/login` is excluded even though it changes `src/`. Path filters are a common way to skip CI for documentation changes.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Jobs and ordering
  ...scenarioFamily(
    'eng-ci-jobs-needs',
    2,
    'Jobs run in parallel on separate runners unless `needs` says otherwise.',
    [
      {
        key: 'needs-order',
        question: 'How do these jobs run?',
        code: yaml(`jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  deploy:
    needs: [build, test]
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh`),
        correct:
          '`build` and `test` start in parallel; `deploy` starts only after both have succeeded',
        wrong: [
          'All three run one after another, in the order they are written',
          'All three start at the same time',
          '`deploy` starts as soon as either `build` or `test` succeeds',
        ],
        why: 'Jobs without `needs` start in parallel. `needs: [build, test]` makes `deploy` wait for both, and by default it is skipped if either fails. Order in the file does not matter. Note also that `deploy` has no checkout step: each job gets a fresh runner, so it would not have the repository files either.',
      },
      {
        key: 'artifacts-between-jobs',
        difficulty: 3,
        question:
          'The `build` job runs `npm run build`, which writes `dist/` (listed in `.gitignore`). The `deploy` job has `needs: build` and fails with this log. What is the fix?',
        code: plain(`Run ls dist
ls: cannot access 'dist': No such file or directory
Error: Process completed with exit code 2.`),
        correct:
          'Upload `dist/` with `actions/upload-artifact` in `build` and download it with `actions/download-artifact` in `deploy`',
        wrong: [
          'Add `actions/checkout` to `deploy`, which brings `dist/` along',
          'Give both jobs the same `runs-on` label so they share one machine',
          'Change `needs: build` to `needs: [build]`',
        ],
        why: 'Every job runs on a fresh runner, so files created in one job do not exist in another. Artifacts are the mechanism for passing build output between jobs in a run (and for keeping it afterwards). Checkout only fetches what is committed, and `dist/` is ignored. The same `runs-on` label means the same kind of machine, not the same machine. Both `needs` spellings are equivalent.',
      },
      {
        key: 'always-run',
        difficulty: 4,
        question:
          'When the tests fail, `notify` shows as skipped. The team wants it to run after `test` finishes, whether the tests passed or failed. What change does that?',
        code: yaml(`jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  notify:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: ./notify-team.sh "Test run finished"`),
        correct: 'Add `if: always()` to the `notify` job',
        wrong: [
          'Add `continue-on-error: true` to the `notify` job',
          'Remove `needs: test` from the `notify` job',
          'Add `if: failure()` to the `notify` job',
        ],
        why: 'A job with `needs` gets an implicit `if: success()`, so it is skipped when a needed job fails. `always()` overrides that and runs it after `test` completes either way. `continue-on-error` controls what happens when `notify` itself fails. Removing `needs` makes it start in parallel, before the tests finish. `failure()` runs it only when tests fail.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Permissions and failed runs
  ...scenarioFamily(
    'eng-ci-permissions',
    3,
    'Look at what the token is allowed to do, and compare it with what the failing step attempts.',
    [
      {
        key: 'push-tag-403',
        question:
          'A release job ends with this log. The workflow sets `permissions: contents: read` at the top. What is the right fix?',
        code: plain(`Run git push origin v1.8.0
remote: Permission to example-org/shop-api.git denied to github-actions[bot].
fatal: unable to access 'https://github.com/example-org/shop-api/': The requested URL returned error: 403
Error: Process completed with exit code 128.`),
        correct:
          'Give only the release job `permissions: contents: write`, so its `GITHUB_TOKEN` may push the tag',
        wrong: [
          "Store an administrator's personal access token as a secret and push with it",
          'Set `permissions: write-all` at the top of the workflow',
          'Re-run the job with debug logging enabled',
        ],
        why: 'The 403 comes from the `GITHUB_TOKEN`, which can only do what `permissions` grants, and `contents: read` cannot push. Least privilege means granting `contents: write` just to the job that needs it. `write-all` grants every scope to every job, and a personal token is long-lived, tied to a person and far broader than needed. Debug logging cannot change a permission decision.',
      },
      {
        key: 'oidc-id-token',
        difficulty: 4,
        question:
          'A deploy job should sign in to the cloud with OIDC (no stored keys). It has `permissions: contents: read` and fails at the login step with this error. What is missing?',
        code: plain(`Run cloud-login-action
Error: Unable to get ACTIONS_ID_TOKEN_REQUEST_URL env variable
Error: Process completed with exit code 1.`),
        correct:
          "`id-token: write` in the job's `permissions`, which allows it to request an OIDC token",
        wrong: [
          "`contents: write` in the job's `permissions`",
          'Long-lived cloud access keys stored as repository secrets',
          "A fix to the cloud role's trust policy, which rejected the token",
        ],
        why: 'A job can only request an OIDC token from GitHub when it has `id-token: write`; without it the runner never receives the token request URL, which is exactly this error. The cloud side has not been contacted yet, so the trust policy is not the cause (a policy mismatch shows up later as an error from the cloud provider). Falling back to stored keys would defeat the purpose of OIDC.',
      },
    ],
  ),
  ...selectFamily(
    'eng-ci-least-privilege',
    5,
    'Grant each scope only if a step needs it; everything not listed is denied.',
    [
      {
        key: 'image-and-deploy',
        question:
          'A job checks out the repository, builds a container image and pushes it to GitHub Container Registry, then signs in to the cloud with OIDC and deploys. Which `permissions` should the job have?',
        right: ['`contents: read`', '`packages: write`', '`id-token: write`'],
        wrong: ['`contents: write`', '`pull-requests: write`', '`actions: write`'],
        why: 'Checkout needs `contents: read`; pushing to GitHub Container Registry with `GITHUB_TOKEN` needs `packages: write`; requesting an OIDC token needs `id-token: write`. Nothing in the job changes repository contents, pull requests or workflow runs, so granting those would only widen what a compromised step could do. When you set `permissions`, any scope you leave out is set to none.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Secrets and credentials
  ...scenarioFamily(
    'eng-ci-secrets',
    3,
    'Think about who controls the code that runs, and what can reach the logs.',
    [
      {
        key: 'masking-not-safe',
        question:
          'A developer added `run: echo "Using key ${{ secrets.API_KEY }}"` to debug a step. The log shows `Using key ***`, so they argue printing secrets is fine. What is the best response?',
        correct:
          'Masking only hides exact matches of the value; transformed forms (base64, part of the value, escaped JSON) are not hidden, so never print secrets: pass them to tools through environment variables',
        wrong: [
          'They are right: masking guarantees a secret can never appear in a log',
          'It is fine because workflow logs are only visible to the repository owner',
          'It is fine as long as the secret is defined at organisation level',
        ],
        why: 'Log masking is a safety net, not a control: it replaces the literal value, but a step that prints it encoded, split or reformatted leaks it. Logs are readable by everyone with read access to the repository, which for a public repository is everyone. Treat any printed secret as exposed and rotate it.',
      },
      {
        key: 'fork-pr-secrets',
        question:
          'Integration tests use `secrets.DB_PASSWORD`. For pull requests from the main repository they pass; for a pull request from a fork, the password is empty and the tests fail. Why?',
        correct:
          'For `pull_request` runs from forks, repository secrets are not passed to the runner and `GITHUB_TOKEN` is read-only, because the code being run comes from an untrusted contributor',
        wrong: [
          'The secret name is misspelled in the fork',
          'Secrets are only available to workflows on the default branch',
          'It is a bug; the recommended fix is to switch to `pull_request_target` and check out the pull request code',
        ],
        why: 'A fork pull request runs code written by someone outside the project. If secrets were available, the contributor could change a test to send them anywhere. That is why GitHub withholds them. Switching to `pull_request_target` while checking out the pull request code reintroduces exactly that risk. Run secret-free checks on forks, and secret-dependent tests after a maintainer review.',
      },
      {
        key: 'static-key-to-oidc',
        difficulty: 4,
        question:
          'Deployments use a cloud access key with no expiry, stored as a repository secret. A security review asks for an improvement. What is the best one?',
        correct:
          "Use OIDC federation: the cloud trusts GitHub's token issuer for this repository and environment only, the workflow exchanges a short-lived token per run, and the static key is deleted",
        wrong: [
          'Rotate the key once a year',
          'Move the key from a repository secret to an organisation secret',
          'Store the key base64-encoded so it is not readable',
        ],
        why: 'A long-lived key can be leaked and reused at any time until someone notices. With OIDC there is no stored secret: each run gets short-lived credentials that expire soon after the job, and the cloud role can be restricted to a specific repository, branch or environment. Yearly rotation still leaves a long exposure window; an organisation secret is the same key shared more widely; base64 is encoding, not protection.',
      },
      {
        key: 'pull-request-target',
        difficulty: 5,
        question: 'What is the security problem with this workflow?',
        code: yaml(`on: pull_request_target
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm ci && npm test
        env:
          NPM_TOKEN: \${{ secrets.NPM_TOKEN }}`),
        correct:
          'Anyone can open a pull request from a fork whose code (for example an `npm` install script or a test) runs with `NPM_TOKEN` and a token that can write to the repository',
        wrong: [
          'None: `pull_request_target` always runs with a read-only token and no secrets',
          'Only that builds are slower, because the base branch is built twice',
          'The checkout fails for forks, so the tests never run',
        ],
        why: "`pull_request_target` runs in the context of the base repository, with its secrets and a token that can have write access. That is safe only while the workflow runs trusted code from the base branch. Checking out the pull request head and running `npm ci` and `npm test` executes the contributor's code with those privileges. Use `pull_request` for untrusted code, or keep `pull_request_target` workflows free of untrusted checkouts.",
      },
    ],
  ),

  // ---------------------------------------------------------------- Environments and releases
  ...scenarioFamily(
    'eng-ci-release-strategies',
    3,
    'Compare how many users each approach exposes, and how quickly it can be undone.',
    [
      {
        key: 'required-reviewers',
        difficulty: 2,
        question:
          'The `production` environment is configured with required reviewers. What happens when a run reaches `deploy-prod`?',
        code: yaml(`  deploy-prod:
    needs: deploy-staging
    environment: production
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh production`),
        correct:
          "The job waits until a required reviewer approves the deployment; only then does it start, with access to the environment's secrets",
        wrong: [
          'The job runs immediately and the reviewers are notified afterwards',
          'The job fails, because reviewers must be listed in the workflow file',
          'The job waits for the pull request that triggered the run to be approved',
        ],
        why: 'Environment protection rules are enforced before the job starts: the run pauses until an allowed reviewer approves, and environment secrets are not available until then. This is a deployment gate configured on the environment, not a pull request review, and it does not belong in the YAML.',
      },
      {
        key: 'canary',
        question:
          'A risky change to the payment service must be tried on real traffic while exposing as few users as possible at first. Which strategy fits?',
        correct:
          'A canary release: send a small share of traffic (say 5%) to the new version, watch error rates and latency, then increase gradually or roll back',
        wrong: [
          'A blue-green deployment that switches all traffic to the new version at once',
          'A big-bang deployment late on Friday, when traffic is low',
          'Deploying to staging only, since staging has no real users',
        ],
        why: 'A canary limits the blast radius: if the new version misbehaves, only the canary share of users is affected, and the decision to continue is based on real production metrics. Blue-green gives fast rollback but exposes everyone at the switch. Staging, however close to production, does not see real traffic.',
      },
      {
        key: 'feature-flag',
        question:
          'The team uses trunk-based development. A feature will take three weeks, but the code should be merged to `main` daily. How do they avoid exposing the half-built feature?',
        correct:
          'Put it behind a feature flag that is off in production, turn it on when ready, then remove the flag and the old code path',
        wrong: [
          'Keep the feature on a branch until it is complete, then merge it',
          'Comment out the new code before each merge',
          'Deploy only on days when the feature happens to be in a working state',
        ],
        why: 'Feature flags separate deploying code from releasing a feature: the code ships dark and is switched on (possibly for a few users first) when ready. Removing the flag afterwards matters, because old flags pile up as untested code paths. A long-lived branch is what trunk-based development avoids.',
      },
      {
        key: 'blue-green-schema',
        difficulty: 4,
        question:
          'In a blue-green deployment, a migration run before the switch renamed column `customer_name` to `full_name`. Green showed errors, so traffic was switched back to blue, but blue now fails too. What went wrong, and what prevents it?',
        correct:
          'Both versions share the database, and the rename broke blue; use expand-and-contract migrations (add the new column, support both, remove the old column in a later release)',
        wrong: [
          "Switching back cleared blue's cache; warm the cache before switching",
          'Blue-green deployments cannot be rolled back; use a canary instead',
          'The load balancer health checks were too strict; relax them',
        ],
        why: 'Blue-green rollback only works if the old version still runs against the current state, and the database is usually shared. A destructive schema change breaks the old version immediately. Expand-and-contract keeps every intermediate schema compatible with both the old and new code, so either can serve traffic.',
      },
      {
        key: 'health-check-rollback',
        difficulty: 5,
        question:
          'A production deployment ended with this log. What happened, and what is the next step?',
        code: plain(`[deploy] Deploying shop-api:2026.11.20-3 to production (rolling, 6 instances)
[deploy] instance 1/6 updated, waiting for health check
[health] GET /health -> 503 (attempt 1/5)
[health] GET /health -> 503 (attempt 5/5)
[deploy] ERROR health check failed on instance 1/6
[deploy] Rolling back instance 1/6 to shop-api:2026.11.19-1
[deploy] Rollback complete: 6/6 instances on shop-api:2026.11.19-1
Error: Process completed with exit code 1.

[app instance 1] Unhandled exception: Missing required configuration 'Payments:ApiBaseUrl'`),
        correct:
          'The new version could not start because a required setting is missing in production; the rollout stopped at one instance and rolled back, so all instances run the previous version. Add the setting (and validate configuration earlier in the pipeline), then redeploy',
        wrong: [
          'One of six production instances is now down and must be restarted by hand',
          'The failure is transient; re-run the job until the health check passes',
          'Disable the health check so the deployment can complete',
        ],
        why: 'The rolling deployment did its job: the health check caught a broken instance before the rollout continued, and the automatic rollback restored the previous version everywhere. The app log gives the cause, a missing configuration key, which no retry will fix. Disabling the health check would have sent the broken version to all six instances.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Caching and matrices
  ...scenarioFamily(
    'eng-ci-cache-matrix',
    1,
    'Count every combination, and remember what decides whether a cache entry is reused.',
    [
      {
        key: 'matrix-count',
        question: 'How many jobs does this matrix create?',
        code: yaml(`jobs:
  test:
    strategy:
      matrix:
        node: [20, 22]
        os: [ubuntu-latest, windows-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
      - run: npm ci && npm test`),
        correct: '4, one for each combination of Node version and operating system',
        wrong: ['2', '1, which runs all combinations in sequence', '8'],
        why: 'A matrix creates one job per combination of its values: 2 Node versions times 2 operating systems is 4 jobs, and they run in parallel. Adding a third axis with 2 values would double it to 8.',
      },
      {
        key: 'cache-key',
        difficulty: 3,
        question:
          'This cache was saved once, months ago. Since then it is restored every run but never updated, so most packages are downloaded again each time. What is the fix?',
        code: yaml(`- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-\${{ runner.os }}`),
        correct:
          "Include a hash of the lockfile in the key, such as `npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}`",
        wrong: [
          'Delete the cache step, because caches always go stale',
          'Cache `node_modules` instead of `~/.npm`, keeping the same key',
          'Add `restore-keys: npm-` while keeping the same key',
        ],
        why: 'A cache entry is immutable: when the key hits exactly, the action restores it and does not save a new one. A key that never changes therefore freezes the first cache forever. Keying on the lockfile hash creates a new entry whenever dependencies change, and `restore-keys` can then provide a close older match as a starting point.',
      },
      {
        key: 'fail-fast',
        difficulty: 4,
        question:
          'In a 4-job test matrix, the `windows-latest / node 20` job failed and the other three show as cancelled. The team wants results from every combination. What explains this, and what is the fix?',
        correct:
          'Matrix jobs default to `fail-fast: true`, which cancels the other in-progress jobs when one fails; set `strategy.fail-fast: false`',
        wrong: [
          'The Windows runner crashed and took the other runners with it',
          'The jobs are missing `needs`, so they were cancelled',
          'The account ran out of runner minutes after the first failure',
        ],
        why: 'Fail-fast saves time when any failure means the run is red anyway, but it hides whether the problem is specific to one combination. With `fail-fast: false` every matrix job runs to completion, so you can see, for example, that only Windows on Node 20 fails.',
      },
    ],
  ),
];
