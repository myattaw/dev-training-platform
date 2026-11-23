# Staging launch guide

How to put PracStack on AWS as a **private staging environment**, verify it, watch it, roll it
back and remove it. Architecture and security design: [aws.md](aws.md). Runner isolation:
[runners.md](runners.md). Day-to-day operations: [operations.md](operations.md).

> **Nothing here has been run against AWS yet.** Every command below that talks to AWS creates
> or changes billable resources and needs the account owner's approval. Everything verifiable
> without AWS (unit, infrastructure, security and e2e tests, `cdk synth`) has been run locally.

## 0. Recommended staging configuration

| Setting            | Recommendation                                     | Why                                                                                               |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Stack              | `PracStack-staging` (`-c stage=staging`)           | Separate from `dev` and a future `production`                                                     |
| Region             | `us-east-2` (Ohio)                                 | Already used by this project (`infra/cdk.context.json`); same prices as `us-east-1`               |
| Domain             | none: use the `*.cloudfront.net` URL               | No ACM, Route 53 or registration cost; add a domain later                                         |
| Sign-up            | `-c signUpAllowlist=you@example.com,@yourteam.dev` | Real sign-up and email verification, but strangers can't create accounts and use the code runners |
| Budget             | `-c budgetUsd=10` (default)                        | Emails at $5 / $10 / forecast $10; stops the runners above $10                                    |
| Email              | Cognito's default sender                           | 50 emails/day per account is plenty for a private beta; no SES                                    |
| Data               | `retainData=false` (default)                       | `cdk destroy` removes everything; staging data is disposable                                      |
| Runner concurrency | not set until the Lambda quota is raised           | A new account has 10 concurrent executions, all needed unreserved                                 |

## 1. AWS account prerequisites

1. **An AWS account you control**, with billing set up. Since 15 July 2025, new accounts choose
   a _free plan_ (credits, 6 months) or a _paid plan_ at sign-up, and the old 12-month
   per-service free tier no longer applies to them. **Check your account's plan and credits in
   the Billing console (Free Tier / Credits pages) before relying on any free allowance.** The
   always-free allowances used in the cost estimate (Lambda, CloudFront, DynamoDB storage,
   CloudWatch, Cognito Essentials) apply to all accounts; nothing here assumes credits or the
   GitHub Student Developer Pack.
2. **An administrator identity for the first deployment**, ideally IAM Identity Center (SSO)
   with MFA. Bootstrapping creates IAM roles, so the first run needs broad rights:
   `AdministratorAccess` (or equivalent) for `cdk bootstrap` and the first `cdk deploy`. After
   that, deployments can go through GitHub Actions' narrow roles (section 9).
3. **Lambda concurrency quota.** New accounts can run 10 Lambda functions at once, shared by
   the API and the runners: a few slow submissions can then throttle the API. Check and request
   an increase (free; usually approved within a day):

   ```bash
   aws lambda get-account-settings --query 'AccountLimit.ConcurrentExecutions'
   # Service Quotas console → AWS Lambda → "Concurrent executions" → request e.g. 100
   ```

4. **Docker** running on the deploying machine (the runner images are built during
   `cdk deploy`), **Node.js 22.23.5** (`.nvmrc`), and `npm ci` done.

### AWS CLI configuration (no long-lived keys)

```bash
aws configure sso --profile pracstack-admin     # SSO start URL, region us-east-2, admin role
aws sso login --profile pracstack-admin
export AWS_PROFILE=pracstack-admin              # PowerShell: $env:AWS_PROFILE = 'pracstack-admin'
aws sts get-caller-identity                     # confirm the account before going further
```

The CDK CLI reads the account and region from this profile (`CDK_DEFAULT_ACCOUNT` /
`CDK_DEFAULT_REGION`); `infra/bin/pracstack.ts` refuses to synthesize without them.

## 2. Region, domain and DNS

- **Region**: everything is regional except CloudFront. `us-east-2` is the default here. If
  you choose another region, the first `cdk diff` looks up its availability zones (read-only)
  and records them in `infra/cdk.context.json`; commit that file.
- **Domain (optional, later)**: the stack serves `https://<id>.cloudfront.net`. A custom domain
  needs a registered domain (~$12–15/year for a `.com`), a Route 53 hosted zone ($0.50/month)
  or another DNS host, and an ACM certificate **in us-east-1** (CloudFront only uses
  certificates from us-east-1, whatever the stack's region). The stack doesn't support one yet;
  it would also let CloudFront enforce TLS 1.2 (cdk-nag finding CFR4, acknowledged for now).
  Cognito callback URLs follow the site URL automatically.

## 3. What gets created

One CloudFormation stack, `PracStack-staging`:

| Resource                                                                                | Notes                                                            | Bills while idle?                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| S3 web bucket + access-log bucket                                                       | Private, encrypted, TLS-only, Origin Access Control              | Storage only (cents)                  |
| CloudFront distribution, function, cache/headers policies                               | SPA rewrite, strict CSP, HSTS                                    | No                                    |
| Cognito user pool (Essentials), domain, web client, `admins` group, managed login style | Email sign-in, PKCE, no secret; branded managed login            | No (10,000 MAU free, then $0.015/MAU) |
| Pre-sign-up Lambda + log group                                                          | Only with `signUpAllowlist`                                      | No                                    |
| API Gateway HTTP API + JWT authorizer, stage                                            | 10 req/s, burst 20                                               | No                                    |
| API Lambda (Node 22, arm64, 512 MB)                                                     |                                                                  | No                                    |
| 3 runner Lambdas (container images, x86) in an isolated VPC                             | No NAT, no endpoints, no routes                                  | No (ECR storage ≈ $0.06/month)        |
| DynamoDB table (on-demand, PITR)                                                        |                                                                  | Storage only                          |
| Budget + budget action + stop-runners policy                                            |                                                                  | No (first two action budgets free)    |
| 6 CloudWatch alarms, SNS topic + email subscription                                     |                                                                  | No (first 10 alarms free)             |
| Log groups (14 days)                                                                    | API, access, runners, VPC flow logs (rejects only), sign-up gate | Storage only                          |

**None of the expensive kinds**: no NAT gateways, VPC endpoints, load balancers, EC2, ECS/Fargate,
RDS, provisioned capacity or WAF. `infra/test/pracstack-stack.spec.ts` fails if one is added.
Existing AWS resources are **not** modified, except the account-wide CDK bootstrap stack
(`CDKToolkit`), created once if missing.

## 4. Configuration (CDK context)

| Context             | Required | Default            | Example                                         |
| ------------------- | -------- | ------------------ | ----------------------------------------------- |
| `stage`             |          | `dev`              | `staging`                                       |
| `alertEmail`        | yes      |                    | `you@example.com` (budget, alarms, kill switch) |
| `budgetUsd`         |          | `10`               | `10`                                            |
| `signUpAllowlist`   |          | anyone may sign up | `ada@example.com,@yourteam.dev`                 |
| `runnerConcurrency` |          | none               | `3` (only after the quota increase)             |
| `retainData`        |          | `false`            | `true` for production                           |

There are **no secrets** to configure: Cognito is a public PKCE client, the API uses its IAM
role, and `config.json` holds public values only (checked by the smoke test).

## 5. Cognito and email

The stack creates the user pool and everything around it; there is nothing to click in the
console. Sign-up, email verification, sign-in and password reset all use Cognito's managed
login pages. Accounts sign in with email; passwords need 12+ characters with upper and lower
case, digits and symbols; authenticator-app MFA is optional.

**Email (verification codes, password resets)** uses Cognito's default sender,
`no-reply@verificationemail.com`:

- **50 emails per day per AWS account**, not adjustable, reset daily at 09:00 UTC. Every
  sign-up and every password reset uses one. Enough for a private beta.
- Messages come from a generic AWS address and may land in spam: tell testers.
- **Move to Amazon SES** before a public beta, or as soon as more than ~30 emails/day are
  likely. SES needs a verified domain or address, starts in the _sandbox_ (only verified
  recipients) until you request production access, and costs $0.10 per 1,000 emails.
  Not configured in this stack yet.

**Administrators** (ADMIN plan) after the first deploy:

```bash
aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username <email> --group-name admins
```

Sign out and in again to get a token with the group.

**Invite-only staging**: with `signUpAllowlist`, anyone else who tries to sign up sees "PracStack
is invite-only for now". To admit someone, add them to the list and deploy, or create their
account directly (Cognito emails an invitation; this counts toward the 50/day):

```bash
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true
```

## 6. Deploying from your machine (first deployment)

From the repository root, with Docker running and `AWS_PROFILE` set:

```bash
npm ci
npm run verify                     # everything, including the Docker security suites (25–40 min)
npm run deploy:prepare             # web build + leak check, API bundle, runner build contexts → infra/.build

cd infra
# Once per account and region (creates the CDKToolkit stack: an S3 bucket, an ECR repository, IAM roles):
npx cdk bootstrap aws://<account-id>/us-east-2 -c stage=staging -c alertEmail=you@example.com

# Review: every resource and IAM change. Read it.
npx cdk diff PracStack-staging -c stage=staging -c alertEmail=you@example.com \
  -c signUpAllowlist=you@example.com

# Deploy (asks you to confirm the IAM changes). Takes ~10–20 minutes, mostly CloudFront.
npx cdk deploy PracStack-staging -c stage=staging -c alertEmail=you@example.com \
  -c signUpAllowlist=you@example.com --outputs-file ../cdk-outputs.json
```

Then, before anyone else uses it:

1. **Confirm the two AWS emails** (SNS alarm subscription, and the budget is already active).
2. **Runner isolation on AWS** (must pass; it's the only test of the VPC and of Lambda's own
   processes):

   ```bash
   npx tsx scripts/verify-runners.ts PracStack-staging
   ```

3. **Smoke test** (no credentials needed with a URL; `--stack` reads the URL from the stack):

   ```bash
   npx tsx scripts/smoke-test.ts --stack PracStack-staging
   ```

4. Make yourself an administrator (section 5) if you want the ADMIN plan.
5. Run the manual test plan (section 11).

Outputs (`cdk-outputs.json`): `SiteUrl`, `SignInDomain`, `UserPoolId`, `UserPoolClientId`,
`TableName`, `DistributionId`, `ApiFunctionRoleName`, `StopRunnersPolicyArn`, `SignUp`, and the
three runner names.

**Frontend-only changes** go through the same `npm run deploy:prepare` + `cdk deploy`: the
stack uploads the new files and invalidates `index.html`, `config.json` and `content/*` in
CloudFront. Hashed files never need invalidation; old ones are kept so open pages keep working.

## 7. Required IAM permissions

| Who                                        | Needs                                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| You, first time (bootstrap + first deploy) | `AdministratorAccess` via SSO. Bootstrap creates IAM roles; the stack creates roles, a VPC, Lambda, Cognito, etc.                                              |
| `cdk deploy` afterwards                    | `sts:AssumeRole` on the four `cdk-hnb659fds-*` bootstrap roles. CloudFormation then acts with the bootstrap execution role (by default `AdministratorAccess`). |
| `verify-runners.ts`                        | `cloudformation:DescribeStacks` on the stack, `lambda:InvokeFunction` on its runners                                                                           |
| `smoke-test.ts`                            | nothing with a URL; `cloudformation:DescribeStacks` with `--stack`                                                                                             |
| GitHub Actions                             | the roles in section 9                                                                                                                                         |

To narrow what any deployment can do, bootstrap with a custom execution policy
(`npx cdk bootstrap --cloudformation-execution-policies <policy-arn>`) covering only the
services in section 3. That is optional hardening; the default is AdministratorAccess.

## 8. Monitoring

| What                               | Where                                          | Expect                                                                     |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Alarms (6)                         | Email via SNS; CloudWatch → Alarms             | All `OK`. Meanings and first checks: [operations.md](operations.md#alarms) |
| API errors                         | CloudWatch Logs → the API function's log group | Only structured `{"level":"error",…}` lines, never request bodies or code  |
| API traffic                        | the API access log group                       | One JSON line per request: route, status, latency, user id                 |
| Runners                            | each runner's log group                        | Supervisor errors only                                                     |
| Network attempts from learner code | the VPC flow-log group                         | Rejected connections (expected when someone probes)                        |
| Cost                               | Billing → Budgets, Cost Explorer (by service)  | Pennies; budget emails at 50 %/100 %                                       |
| Sign-ups                           | Cognito → user pool → Users                    | Only allowlisted emails                                                    |

CloudWatch Logs Insights, API function errors in the last day:

```text
fields @timestamp, message | filter level = "error" | sort @timestamp desc | limit 50
```

## 9. GitHub Actions (manual, approved deployments)

`.github/workflows/deploy.yml` runs **only when started by hand** (Actions → Deploy → Run
workflow → stage). It never runs on push. Jobs:

1. **verify**: lint, formatting, typecheck, unit tests, production dependency audit.
2. **plan**: `npm run deploy:prepare` (with the leak check), then a read-only `cdk diff`. The
   diff appears in the run summary, with the alert email and allowlist redacted. The built
   assets are saved as an artifact.
3. **deploy**: waits for a **required reviewer** to approve the `staging` environment, deploys
   the **same assets** that were diffed, runs `verify-runners.ts`, then the smoke test.

No AWS keys are stored anywhere: each job exchanges GitHub's OIDC token for a role that only
this repository's given environment can assume.

### One-time setup

1. **AWS roles** (after bootstrapping; from `infra/`, as administrator):

   ```bash
   npx cdk deploy PracStack-GitHubDeploy -c githubRepo=<owner>/<repo> -c githubStages=staging
   # If the account already has a GitHub OIDC provider, add:
   #   -c githubOidcProviderArn=arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com
   ```

   It outputs `StagingPlanRoleArn` (only `cdk diff`, from environment `staging-plan`) and
   `StagingDeployRoleArn` (CDK bootstrap roles, stack outputs, runner probes; from environment
   `staging` only). Defined in `infra/lib/github-deploy-access-stack.ts`.

2. **GitHub environments** (Settings → Environments):
   - `staging-plan`: no reviewers. Variables `AWS_REGION` (`us-east-2`), `AWS_PLAN_ROLE_ARN`,
     optional `BUDGET_USD`, `RUNNER_CONCURRENCY`. Secrets `ALERT_EMAIL`, optional
     `SIGN_UP_ALLOWLIST`.
   - `staging`: **Required reviewers: you.** Deployment branches: `main` only. Same variables
     and secrets, but `AWS_DEPLOY_ROLE_ARN` instead of the plan role.

   The plan and deploy jobs must get the **same** `BUDGET_USD`, `RUNNER_CONCURRENCY`,
   `ALERT_EMAIL` and `SIGN_UP_ALLOWLIST`, or the deployment won't match the diff you approved.

3. **Production** later: run step 1 with `-c githubStages=staging,production` and create
   `production-plan` / `production` the same way. The workflow adds `retainData=true` for
   production.

Nothing in the repository creates GitHub secrets or environments; do it in GitHub's settings.

## 10. Rollback

- **A failed deployment** rolls back automatically (CloudFormation).
- **A bad release**: deploy the previous commit:

  ```bash
  git checkout <last-good-commit>
  npm ci && npm run deploy:prepare
  cd infra && npx cdk deploy PracStack-staging -c stage=staging -c alertEmail=you@example.com -c signUpAllowlist=…
  ```

  Or run the Deploy workflow from that commit. Data (users, progress) is not rolled back. The
  table has point-in-time recovery (35 days); restoring creates a _new_ table (console:
  DynamoDB → Backups → Restore), so plan it before needing it.

- **Stop the runners immediately** (code and SQL return "busy"; everything else works):

  ```bash
  ROLE=$(aws cloudformation describe-stacks --stack-name PracStack-staging \
    --query "Stacks[0].Outputs[?OutputKey=='ApiFunctionRoleName'].OutputValue" --output text)
  POLICY=$(aws cloudformation describe-stacks --stack-name PracStack-staging \
    --query "Stacks[0].Outputs[?OutputKey=='StopRunnersPolicyArn'].OutputValue" --output text)
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$POLICY"    # stop
  aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$POLICY"    # resume
  ```

- **Take the whole site offline** without deleting data: CloudFront console → the distribution
  → Disable.

## 11. Staging test plan (manual, after deployment)

Use two browsers (or a normal and a private window). "Expected" is what must happen; anything
else is a bug to file before inviting testers.

### Accounts

| #   | Step                                                                      | Expected                                                                                                                  |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A1  | Open `SiteUrl`; click **Sign in** → **Sign up** with an allowlisted email | Cognito sign-up page on `pracstack-staging-….auth.us-east-2.amazoncognito.com`                                            |
| A2  | Sign up with an email **not** on the allowlist                            | "PracStack is invite-only for now"; no account in Cognito → Users                                                         |
| A3  | Check email                                                               | Code from `no-reply@verificationemail.com` within a minute (check spam)                                                   |
| A4  | Enter the code                                                            | Back in PracStack, signed in, on the page you started from; name or email in the header                                   |
| A5  | **Sign out**                                                              | Signed out in the app; Cognito's logout page returns you to `/`; going to a protected page asks you to sign in again      |
| A6  | **Forgot password** on the sign-in page                                   | Reset code by email; new password works; old one doesn't                                                                  |
| A7  | Sign in in a second browser                                               | Same account; progress from the first browser is there (after A8)                                                         |
| A8  | Close the tab, open a new one                                             | One redirect through Cognito signs you in again without a password while Cognito's session lasts; otherwise sign in again |

### Skill Mastery (PostgreSQL)

| #   | Step                                               | Expected                                                                                            |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| S1  | Skills → PostgreSQL → a skill → Practice           | A question loads; tier shown                                                                        |
| S2  | Run a correct SQL query                            | Result rows from the **sample** data only                                                           |
| S3  | Submit it                                          | "Correct"; mastery score rises                                                                      |
| S4  | Submit an incorrect query (e.g. missing a `WHERE`) | "Incorrect" with a hint; no hidden rows revealed; score drops or holds per [scoring.md](scoring.md) |
| S5  | Reload; then open in the second browser            | Same score and history in both                                                                      |
| S6  | Oracle track                                       | Only concept/predict-output questions appear (no Oracle database on AWS)                            |

### Coding Challenges

| #   | Step                                                                     | Expected                                                                                                                    |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| C1  | Challenges → any challenge → workspace                                   | Monaco editor with starter code                                                                                             |
| C2  | **Run tests**                                                            | Visible tests run in the browser; results in a few seconds                                                                  |
| C3  | **Submit** a correct solution                                            | Graded on AWS: visible and hidden tests pass (hidden shown as counts only). First submission may take ~5–10 s (cold runner) |
| C4  | Submit a wrong solution                                                  | Failing tests; hidden failures as counts, no hidden inputs shown                                                            |
| C5  | Submit Java                                                              | Graded (cold start up to ~15 s)                                                                                             |
| C6  | Submit an infinite loop; then output spam (`while(true) console.log(1)`) | "Time limit" and "too much output" respectively; the next submission works normally                                         |
| C7  | Reload; second browser                                                   | Solved status and draft kept                                                                                                |

### Company Interview Prep

| #   | Step                                 | Expected                                                                                 |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| P1  | Companies → search "Liberty Mutual"  | Company appears                                                                          |
| P2  | Open it; view "Design a Text Editor" | Reported-question entry with source information                                          |
| P3  | Open the original LeetCode link      | Opens leetcode.com in a new tab (external link; no content copied)                       |
| P4  | Start a timed practice session       | Timer counts down                                                                        |
| P5  | Reload the page                      | Timer continues from the server's start time (no reset, no drift beyond a second or two) |
| P6  | Submit before the deadline           | Session results with per-question outcomes                                               |
| P7  | Start another and let it expire      | Session ends as expired; late answers refused                                            |

### Accounts and entitlements

| #   | Step                                                                                                                          | Expected                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| E1  | As a normal user, view Pro recommendations                                                                                    | Locked, "Coming soon"; no link or start button                                                |
| E2  | Try to self-upgrade: in DevTools, replay `GET /api/me/entitlements` with `?plan=pro`, or add `"plan":"pro"` to a request body | Still `free`. The plan only comes from the `admins` group or a server-side entitlement record |
| E3  | Data isolation: as user A, note an API URL with an id (e.g. a session); as user B, request it                                 | 404/403; never A's data                                                                       |
| E4  | Local drafts: in local mode or before signing in, write a draft; sign in; Account → import                                    | Draft imported; repeating the import changes nothing; conflicts are explained                 |
| E5  | Second device                                                                                                                 | Imported drafts and progress present                                                          |
| E6  | Admin: add yourself to `admins` (section 5), sign out and in                                                                  | Account page shows ADMIN                                                                      |

### Operations

| #   | Check                                                 | Expected                                                                                                                     |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| O1  | CloudWatch → Alarms                                   | All `OK` after the tests above                                                                                               |
| O2  | API function log group                                | No error lines from the tests (or only explained ones)                                                                       |
| O3  | Lambda → each runner → Monitor                        | Invocations match your submissions; errors 0                                                                                 |
| O4  | DynamoDB → table → Explore items                      | Items keyed by your user id; no code bodies in logs                                                                          |
| O5  | VPC flow-log group                                    | Only rejected traffic, if any                                                                                                |
| O6  | Billing → Budgets                                     | `pracstack-staging-monthly` exists; spend in cents                                                                           |
| O7  | Kill switch                                           | Attach the stop-runners policy (section 10): submissions say "busy", practice browsing works; detach; submissions work again |
| O8  | `npx tsx scripts/verify-runners.ts PracStack-staging` | All checks `ok`                                                                                                              |

## 12. Removing everything

```bash
cd infra
npx cdk destroy PracStack-staging -c stage=staging -c alertEmail=you@example.com
npx cdk destroy PracStack-GitHubDeploy -c githubRepo=<owner>/<repo>    # if created
```

With `retainData=false` this deletes users and progress. Left behind (negligible, delete by
hand for a clean account): CDK helper log groups (`/aws/lambda/PracStack-staging-Custom…`),
runner images in the `cdk-hnb659fds-container-assets-…` ECR repository, and the `CDKToolkit`
stack with its bucket (details in [aws.md](aws.md#removing-everything)). Also delete the GitHub
environments if you created them.

## 13. Costs

List prices for us-east-2 as of late 2026, **without** free-plan credits. Check the
[AWS Pricing Calculator](https://calculator.aws/) for current numbers.

### Fixed monthly costs (charged even with no traffic)

| Item                                                                            | Cost              |
| ------------------------------------------------------------------------------- | ----------------- |
| Runner images in ECR (~0.6 GB)                                                  | ≈ $0.06           |
| S3 (web build, logs), DynamoDB storage, log storage                             | < $0.05           |
| Everything else (CloudFront, Cognito, API Gateway, Lambda, VPC, alarms, budget) | $0 idle           |
| **Idle total**                                                                  | **≈ $0.10/month** |

### Usage-based scenarios

|                                                                 | Idle                | Private beta                                                | Modest public beta                                        |
| --------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Assumptions                                                     | no users            | 10 testers, ~20k API requests, ~1,000 code/SQL runs a month | 500 monthly users, ~1M API requests, ~20,000 runs a month |
| API Gateway ($1.00 / M requests)                                | $0                  | $0.02                                                       | $1.00                                                     |
| Lambda API + runners (always free: 1M requests, 400k GB-s)      | $0                  | $0 (~3,000 GB-s)                                            | ≈ $0 (~140k GB-s, ~1M requests)                           |
| DynamoDB on-demand (rate-limit counters write on every request) | $0                  | $0.05                                                       | ≈ $2–3                                                    |
| CloudFront (always free: 1 TB, 10M requests)                    | $0                  | $0                                                          | $0                                                        |
| Cognito Essentials (10,000 MAU free, then $0.015/MAU)           | $0                  | $0                                                          | $0                                                        |
| CloudWatch Logs (5 GB free)                                     | $0                  | $0                                                          | ≈ $0                                                      |
| Email                                                           | $0 (default sender) | $0 (default sender)                                         | SES needed: ≈ $0.10 per 1,000 emails                      |
| **Monthly total**                                               | **≈ $0.10**         | **< $1**                                                    | **≈ $3–6**                                                |

Domain (optional): ~$12–15/year registration plus $0.50/month for a Route 53 hosted zone.
Monitoring: within free allowances (6 of 10 free alarms; 1,000 free SNS emails).

### The expensive possibilities

- **Runner abuse.** Runners bill per GB-second. Global caps (30 code runs and 60 SQL runs per
  minute, all users together) bound the rate at roughly **$1/hour (~$25/day)** if someone kept
  them saturated with the slowest possible runs. The sign-up allowlist keeps strangers out of
  staging entirely; per-user limits (10 runs/minute) slow down any single account.
- **API floods** by a signed-in user: capped by the 10 req/s API throttle at roughly **$90/month**
  if sustained for a whole month (details in [aws.md](aws.md#cost-estimate-us-east-2)).
- **Adding paid services** later: SES dedicated IPs, WAF (~$8–10/month), RDS for Oracle
  (~$60–80/month), a NAT gateway (~$33/month): none are in this stack.

### What the budget and kill switch do and don't do

- **AWS Budgets is not a spending cap.** It emails you; it never stops AWS from billing. Billing
  data lags usage by several hours (up to about a day).
- **The kill switch** (budget action at 100 % of actual spend) attaches a deny policy so the API
  can no longer invoke the runners. It **does not** stop API Gateway, Lambda (API), DynamoDB,
  CloudFront or logging costs, and because of the lag, up to roughly a day of runner spend can
  happen before it fires.
- **The budget covers the whole AWS account** (it has no service or tag filter). If the account
  runs other workloads, their spend counts too and can trip the kill switch. Use a dedicated
  account for PracStack, or decide to filter the budget by the `project=pracstack` tag (which
  then has to be activated as a cost allocation tag in Billing first).
- After it fires, review Cost Explorer, then detach the policy (section 10) to resume.

## 14. Readiness and known limitations

Ready for a **private, invite-only** staging deployment once `verify-runners.ts` passes on
AWS. Before a public beta:

- **Runner isolation**: runs are separated by a fresh process and clean-up inside a reused
  Lambda environment, not a fresh microVM. A hostile program could in principle interfere with
  _later runs in the same warm environment_ (slow, fail or read their code); it still can't
  reach the network, AWS, or expected answers. Acceptable with invited testers; reassess before
  opening sign-up ([runners.md](runners.md#known-limits-stated-plainly)).
- **Lambda concurrency quota** raised, then `runnerConcurrency` set (e.g. 3–5).
- **SES** for email volume and deliverability.
- **Custom domain** with a TLS 1.2 minimum.
- **Oracle** questions that need a database are not served on AWS.
- **Privacy policy and terms** before collecting emails from the public.
