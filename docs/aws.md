# PracStack on AWS (Phase 6: foundation)

Everything is defined with the AWS CDK in [`infra/`](../infra) as one CloudFormation stack,
`PracStack-<stage>`. **Nothing in this repository creates AWS resources on its own:** tests and
`cdk synth` only produce templates locally. Resources exist only after an explicit `cdk deploy`.

## Architecture

```
Browser ──HTTPS──▶ CloudFront ─┬─ /*            → S3 bucket (private, Origin Access Control)
                               ├─ /worker-*.js  → S3 (separate CSP for worker scripts)
                               └─ /api/*        → API Gateway HTTP API
                                                    │ JWT authorizer (Cognito ID token)
                                                    ▼
                                                  Lambda (Node.js 22, arm64) ──▶ DynamoDB (on-demand)
Browser ──redirect──▶ Cognito managed login (sign-up, sign-in, PKCE)
AWS Budgets ──email──▶ you
```

| Piece | What it does | Configuration |
| --- | --- | --- |
| **CloudFront** | Serves the web app and proxies `/api/*`; same origin, so no CORS | Price class 100; HTTP/2+3; security headers from `@pracstack/web-security` (strict CSP, HSTS, frame-deny); SPA routes rewritten by a CloudFront Function |
| **S3** | Web build output | Private, encrypted, TLS-only; hashed files cached 1 year, pages/content revalidated |
| **Cognito** | Accounts and sign-in | Lite plan (free); email sign-in; 12+ character passwords; optional authenticator-app MFA; public client (no secret), authorization code + PKCE; 1 h ID tokens |
| **API Gateway** | HTTP API in front of the function | Every route requires a valid Cognito ID token (signature, expiry, issuer, audience checked by API Gateway); overall throttle 10 req/s (burst 20); JSON access logs without query strings or bodies |
| **Lambda** | The API (`services/api`, bundled to one file) | 512 MB, 10 s timeout; its own role can only use its table and its log group; re-checks token claims (fails closed) |
| **DynamoDB** | Progress, tokens, submissions, rate-limit counters | One table, on-demand, TTL, point-in-time recovery; layout in `services/api/src/store/dynamo-store.ts` |
| **AWS Budgets** | Cost alerts | Monthly budget (default $10) with emails at 50 %, 100 % actual and 100 % forecast |
| **CloudWatch Logs** | Function and API access logs | 14-day retention |

### Not on AWS yet (Phase 7)

Learner code and SQL are **not** executed here: an ordinary API Lambda must never run untrusted
code. On AWS:

- Coding challenges: "Run tests" for **TypeScript** works (in the browser); **Submit** and
  **Java** runs return "not available" (HTTP 503).
- PostgreSQL skills serve their multiple-choice and other non-SQL questions; questions that ask
  you to **write SQL** are skipped until the SQL runner exists on AWS.

Everything else works: browsing, sign-up and sign-in, TypeScript Skill Mastery with server-side
scoring, XP, and progress.

## Cost estimate (us-east-2)

Prices are AWS list prices at the time of writing; check the
[AWS Pricing Calculator](https://calculator.aws/) for current numbers. "Free tier" below means
the always-free tiers unless marked *12 months* (only for accounts less than a year old).

| Service | Idle | Light use (≈ 50 learners, ≈ 50 k API requests/month) | Free allowance that applies |
| --- | --- | --- | --- |
| CloudFront | $0 | $0 | 1 TB transfer, 10 M requests, 2 M function runs per month |
| S3 (≈ 15 MB) | < $0.01 | < $0.01 | — |
| Cognito (Lite) | $0 | $0 | 10,000 monthly active users |
| API Gateway (HTTP API) | $0 | ≈ $0.05 | 1 M requests/month (*12 months*) |
| Lambda (arm64) | $0 | $0 | 1 M requests + 400,000 GB-s per month |
| DynamoDB (on-demand + PITR) | ≈ $0 | ≈ $0.05 | 25 GB storage |
| CloudWatch Logs | $0 | ≈ $0 | 5 GB ingestion |
| AWS Budgets | $0 | $0 | Budgets without actions are free |
| CDK bootstrap (staging bucket, roles) | < $0.01 | < $0.01 | — |
| **Total** | **≈ $0/month** | **well under $1/month** | |

No NAT gateways, load balancers, VPCs, databases, WAF, or anything else that bills by the hour
(a test fails if one is added: `infra/test/pracstack-stack.spec.ts`).

**Worst case (abuse).** Costs scale with requests. A signed-in attacker holding the API at its
10 req/s throttle for a whole month (≈ 26 M requests) would cost roughly: API Gateway $26,
Lambda $20, DynamoDB $25, CloudFront requests $12, logs $4: **≈ $90/month**. Per-user rate
limits (120/min) make that require many accounts. The budget emails you at $5 actual, $10
actual and when the forecast exceeds $10, so it would be noticed within a day. Static files on
CloudFront are not throttled; AWS WAF rate limiting (≈ $6/month) is planned for production
hardening.

## Deploying (requires approval; creates billable resources)

Prerequisites: AWS CLI configured for the target account and region, Docker not needed.

```bash
npm run deploy:prepare                 # build web + Lambda bundle, stage assets in infra/.build
cd infra
npx cdk bootstrap                      # once per account/region: creates the CDKToolkit stack
npx cdk diff    -c alertEmail=you@example.com
npx cdk deploy  -c alertEmail=you@example.com    # review the IAM changes it shows, then confirm
```

Outputs: `SiteUrl` (the app), `SignInDomain`, `UserPoolId`, `TableName`.

Context options: `stage` (default `dev`), `alertEmail` (required), `budgetUsd` (default `10`),
`retainData` (default `false`).

## Removing everything

```bash
cd infra
npx cdk destroy -c alertEmail=you@example.com
```

With `retainData=false` (the default) this deletes **everything in the stack, including all
user accounts and progress**: bucket and its files, distribution, user pool, table, function,
API, log groups and the budget. CloudFront distributions take a few minutes to disable and
delete.

Left behind afterwards (all negligible cost):

- Log groups that Lambda created for CDK's helper functions (`/aws/lambda/PracStack-dev-Custom…`),
  with no expiry. Delete them in the CloudWatch console if you want a clean account.
- The **CDKToolkit** bootstrap stack and its staging bucket (shared by every CDK app in the
  account/region). To remove it: empty the `cdk-hnb659fds-assets-<account>-<region>` bucket, then
  delete the `CDKToolkit` stack in the CloudFormation console. Its staging bucket is retained by
  design and must then be deleted by hand.

## Security notes

- **Authentication** is enforced by API Gateway before any code runs; the function re-checks
  issuer, audience, token use and expiry and fails closed. Requests can't forge claims: they
  come only from API Gateway's verified request context.
- **Tokens** live in `sessionStorage` (dropped when the tab closes). Any script in the page could
  read them, so the app ships a strict CSP: no inline or third-party scripts, `connect-src`
  limited to the site and the Cognito domain. Workers get eval (needed by the in-browser test
  runner) but no network access. The e2e tests run under this exact policy.
- **Private content** (answers, hidden tests) is bundled only into the Lambda function; the web
  bucket receives public content only (the staging script and the leak check both refuse
  otherwise).
- **Least privilege**: the function's role can read and write only its own table and log
  group. Accepted findings of the AWS Solutions checks (cdk-nag), each with its reason, are in
  `PracStackStack.acknowledgeReviewedFindings`; any new finding fails synthesis.
- **Deploying credentials**: use short-lived credentials (IAM Identity Center or an MFA-protected
  role) rather than long-lived access keys of an administrator user.

## Verifying without AWS

```bash
npm test -w @pracstack/infra           # CDK assertions + cdk-nag, no AWS calls
npm test -w @pracstack/api             # includes DynamoDB Local and a smoke test of the built bundle
npx playwright test e2e/auth.e2e.ts    # sign-in flow against a fake Cognito, under the real CSP
```
