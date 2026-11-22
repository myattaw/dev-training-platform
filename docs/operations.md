# Operations: CI, deployment and running PracStack

## Continuous integration (GitHub Actions)

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | Steps |
| --- | --- |
| **Lint, test, build, e2e** | `npm ci`, lint, formatting, typecheck, unit tests, build with the private-content leak check, dev-server check, Playwright end-to-end tests (report uploaded on failure) |
| **Dependency audit** | `npm audit --omit=dev --audit-level=high` |

**CI does not run the Docker-based suites** (`PRACSTACK_SKIP_DOCKER_TESTS=1`): the code-runner and
Lambda-runner security tests, DynamoDB Local, Oracle, and the Docker submission e2e tests. They
need about 3 GB of images and 25–40 minutes, so they run only in a local `npm run verify`, with
Docker running. The pull-request template asks for that before merging. Skipped suites are
listed as skipped, never reported as passed.

Hardening of the workflow itself: a read-only `GITHUB_TOKEN`, credentials not persisted after
checkout, every action pinned to a full commit SHA, and Dependabot (`.github/dependabot.yml`)
proposing weekly updates for npm packages, the actions, and the local runner base images.

Recommended repository settings (made in GitHub, not in code): protect `main`, require the
**CI** checks to pass and a pull request before merging.

## Before merging

```bash
npm run verify        # with Docker running: everything, including the Docker security suites
```

It starts the local Oracle (`npm run oracle:start`) before the e2e tests; stop it afterwards
with `npm run oracle:stop` if you need the memory (about 2.5 GB).

## Deploying

Deployment is always manual: from a developer machine, or with the **Deploy** workflow
(`.github/workflows/deploy.yml`), which is started by hand, diffs with a read-only role, waits
for a reviewer to approve the environment, and uses short-lived OIDC credentials (no access
keys). CI never deploys. Step-by-step guide, test plan and costs:
[staging-launch.md](staging-launch.md); architecture: [aws.md](aws.md). After every deployment
that changes the runners, run `npx tsx scripts/verify-runners.ts <stack>` in `infra/` and do not
open the site until it passes; `npx tsx scripts/smoke-test.ts --stack <stack>` checks the rest.

## Alarms

Six CloudWatch alarms (free: the first 10 are) email the budget-alert address through an SNS
topic. **Confirm the subscription** from the email AWS sends after the first deployment, or no
alarm will arrive.

| Alarm | Fires when | First things to check |
| --- | --- | --- |
| `ApiErrorsAlarm` | the API function fails 5+ times in 5 minutes | the function's log group (structured JSON errors) |
| `Api5xxAlarm` | the API returns 10+ server errors in 5 minutes | API access logs (status, route, latency) and the function logs |
| `LambdaThrottlesAlarm` | any Lambda request is throttled | the account concurrency limit (10 on new accounts; request more) |
| `…RunnerErrorsAlarm` (3) | a runner's supervisor fails 5+ times | the runner's log group; a learner program killing its supervisor also counts |

Budget emails arrive at 50 % and 100 % of the monthly budget (actual) and when the forecast
passes it.

## Kill switch

When actual spend passes the budget, AWS Budgets attaches `StopRunnersPolicy` to the API
function's role: code submissions, Java runs and SQL execution return "busy"; everything else
keeps working. After reviewing the costs (Cost Explorer, by service):

```bash
aws iam detach-role-policy --role-name <ApiFunctionRole name> --policy-arn <StopRunnersPolicy ARN>
```

To stop the runners immediately by hand, attach the same policy.

## Logs

| Log | Where | Kept | Contains |
| --- | --- | --- | --- |
| API function | CloudWatch Logs | 14 days | errors only; never request bodies or code |
| API access | CloudWatch Logs | 14 days | request ID, route, status, latency, user ID (no query strings, headers or bodies) |
| Runners | CloudWatch Logs | 14 days | supervisor errors only; never learner output |
| VPC flow logs | CloudWatch Logs | 14 days | rejected connection attempts from the runners |
| CloudFront access | S3 (private bucket) | 30 days | IP address, path, status, user agent per request |

## Rolling back

Deployments are CloudFormation updates: a failed deployment rolls back by itself. To return to an
earlier version on purpose, check out its commit and deploy it again (`npm run deploy:prepare`,
then `npx cdk deploy`). Web files are versioned by content hash and old ones are kept, so pages
already open keep working during a deployment.

## Secrets and credentials

- No secrets are stored in the repository or in the web app; `config.json` holds public values
  only (tested).
- The deployed stack has **no secrets at all**: the API authenticates users with Cognito tokens
  verified by API Gateway, and uses its IAM role for DynamoDB and the runners.
- Locally, `.local/` (git-ignored) holds the Oracle admin password and local progress.
- Deploy with short-lived AWS credentials (IAM Identity Center or an MFA-protected role), not
  long-lived access keys of an administrator user.
