import type { ScenarioSource } from '@pracstack/content-model';
import { plain, text, yaml } from '../skill-mastery/helpers';
import { blanks, multiple, questionTask, single } from './builders';

const ID = 'cicd-pipeline-failure';

export const cicdPipelineFailure: ScenarioSource = {
  id: ID,
  version: 1,
  title: 'CI/CD Pipeline Failure',
  summary:
    'A failing test suite still reached production, Azure login broke and a secret ended up in a log: diagnose the workflow and make deployments safe.',
  difficulty: 'medium',
  estimatedMinutes: 45,
  technologies: ['GitHub Actions', 'Azure DevOps', 'Azure App Service', 'OIDC'],
  relatedSkillIds: [
    'eng-ci-cd',
    'az-devops-pipelines',
    'az-identity-security',
    'eng-secure-coding',
  ],
  context: text(
    'Ledgerly (a fictional bookkeeping SaaS for freelancers) deploys its .NET API to Azure App Service from GitHub Actions. On Monday morning three things happened: a change with failing tests was deployed to production, the next deployment failed at the Azure login step after the team removed the long-lived service principal secret, and a security engineer found the production database connection string in a public run log.',
    'You are on the Platform team. The workflow, the run log and the repository settings are below. The team also maintains an Azure DevOps pipeline for an older product and wants the same rules there.',
  ),
  requirements: [
    {
      kind: 'list',
      items: [
        'Deployment runs only after the tests pass, and only from main.',
        'Azure login uses OpenID Connect (workload identity federation), with no stored client secret.',
        'Secrets never appear in logs, and the leaked secret is contained.',
        'Production deployments need an approval and can be rolled back in minutes.',
      ],
    },
  ],
  acceptanceCriteria: [
    'The deploy job depends on the test job.',
    'The deploy job has exactly the token permissions it needs (`id-token: write`, `contents: read`).',
    'The federated credential matches the subject the workflow actually presents.',
    'The leaked connection string is rotated and the logging step removed; fork pull requests run without secrets.',
    'Production uses a protected environment and a slot swap, so a bad release can be swapped back.',
  ],
  artifacts: [
    {
      id: 'workflow',
      title: '.github/workflows/build-and-deploy.yml',
      description: 'The workflow as it ran on Monday.',
      snippet: yaml(`name: build-and-deploy
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'
      - name: Test
        run: dotnet test --configuration Release
        env:
          ConnectionStrings__TestDb: \${{ secrets.TEST_DB_CONNECTION }}

  deploy:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Log in to Azure
        uses: azure/login@v2
        with:
          client-id: \${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: \${{ secrets.AZURE_TENANT_ID }}
          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - name: Debug connection
        run: echo "\${{ secrets.SQL_CONNECTION_STRING }}" | base64
      - run: dotnet publish src/Api -c Release -o out
      - uses: azure/webapps-deploy@v3
        with:
          app-name: ledgerly-api-prod
          package: out`),
    },
    {
      id: 'run-log',
      title: 'Run logs',
      description: 'Excerpts from three runs of the workflow.',
      snippet: plain(`Run #812 (push to main, 08:14)
  test    08:14:05 started   08:16:40 failed   "Failed: 3, Passed: 212, Skipped: 0"
  deploy  08:14:05 started   08:15:58 succeeded   (deployed to ledgerly-api-prod)

Run #815 (push to main, 09:30) - after AZURE_CLIENT_SECRET was deleted
  deploy  Log in to Azure
    Error: Unable to get ACTIONS_ID_TOKEN_REQUEST_URL env variable.
    Error: Please make sure to give write permissions to id-token in the workflow.

Run #816 (push to main, 09:52) - after adding the missing permission
  deploy  Log in to Azure
    Error: AADSTS700213: No matching federated identity record found for presented assertion
           subject 'repo:ledgerly/api:environment:production'.
  deploy  Debug connection
    U2VydmVyPXRjcDpsZWRnZXJseS1wcm9kLmRhdGFiYXNlLndpbmRvd3MubmV0O1VzZXIgSUQ9...

Run #817 (pull_request from fork contributor/api, 10:05)
  test    "System.InvalidOperationException: The ConnectionString property has not been initialized."`),
    },
    {
      id: 'azure-federated-credential',
      title: 'Federated credential on the Entra ID app registration',
      description: 'The only credential configured for the deployment identity.',
      snippet: plain(`Name:      github-main
Issuer:    https://token.actions.githubusercontent.com
Subject:   repo:ledgerly/api:ref:refs/heads/main
Audience:  api://AzureADTokenExchange`),
    },
  ],
  tasks: [
    questionTask(
      'why-deploy-ran',
      'Diagnose why failing code was deployed',
      single({
        id: `${ID}-why-deploy-ran`,
        difficulty: 2,
        prompt: 'In run #812 the tests failed but the deployment succeeded. Why?',
        correct:
          'Jobs in a workflow run in parallel unless a job declares `needs`; `deploy` has no `needs: test`, so it started at the same time as the tests and did not wait for their result',
        wrong: [
          "The `if: github.ref == 'refs/heads/main'` condition overrides the result of the test job",
          'GitHub Actions runs jobs in the order they appear in the file, and a failed job does not stop later jobs',
          '`dotnet test` returns exit code 0 when tests fail, unless `--blame` is set',
        ],
        hint: 'Compare the start times of the two jobs in the log.',
        why: 'Both jobs started at 08:14:05: without `needs`, GitHub Actions treats jobs as independent and runs them in parallel. `needs: test` makes `deploy` wait for `test` and skip when it fails (the implicit `success()` condition). `dotnet test` does exit non-zero on failures, which is why the test job is marked failed.',
      }),
    ),
    questionTask(
      'fix-the-deploy-job',
      'Fix the deploy job',
      blanks({
        id: `${ID}-fix-deploy-job`,
        difficulty: 3,
        prompt:
          'Complete the deploy job so that it waits for the tests and can request an OIDC token for `azure/login`.',
        template: yaml(`  deploy:
    runs-on: ubuntu-latest
    {{blank:dependency}}: test
    if: github.ref == 'refs/heads/main'
    environment: production
    permissions:
      contents: read
      {{blank:permission}}: write`),
        accepted: { dependency: ['needs'], permission: ['id-token'] },
        caseSensitive: true,
        hint: 'Run #815’s error message names the permission.',
        why: '`needs: test` orders the jobs and skips the deployment when the tests fail. OIDC login needs the job to request a token from GitHub’s token service, which requires `id-token: write`; without it the runner does not get `ACTIONS_ID_TOKEN_REQUEST_URL`. Setting `permissions` on the job replaces the workflow-level defaults, so `contents: read` must be listed again for checkout.',
      }),
    ),
    questionTask(
      'federated-subject',
      'Fix the federated credential',
      single({
        id: `${ID}-federated-subject`,
        difficulty: 4,
        prompt:
          'Run #816 now gets a token but Entra ID rejects it (AADSTS700213). What is the fix?',
        correct:
          'Add a federated credential whose subject is `repo:ledgerly/api:environment:production`: a job that uses an environment presents an environment-based subject, not the branch',
        wrong: [
          'Recreate a client secret and pass it as `client-secret`, because OIDC does not work with environments',
          'Change the audience to `https://token.actions.githubusercontent.com`',
          'Remove `environment: production` from the job so the subject matches the branch again',
        ],
        hint: 'Compare the subject in the error with the subject in the federated credential.',
        why: 'The subject claim of a GitHub OIDC token depends on the job: for a job that references an environment it is `repo:<owner>/<repo>:environment:<name>`; otherwise it reflects the branch or pull request. Entra ID only accepts tokens whose issuer, subject and audience match a federated credential exactly. Adding the environment subject keeps both OIDC and the environment’s protection rules; removing the environment would throw away the approval gate, and a client secret is exactly what the team wanted to get rid of.',
      }),
    ),
    questionTask(
      'protect-secrets',
      'Contain the secret leak',
      multiple({
        id: `${ID}-protect-secrets`,
        difficulty: 4,
        prompt: 'Which statements about the secrets in these runs are true? Select all that apply.',
        options: [
          {
            text: 'GitHub masks exact secret values in logs, but not transformed ones: the base64 output in run #816 reveals the connection string',
            correct: true,
          },
          {
            text: 'The connection string must be rotated now; deleting the run log does not undo the exposure',
            correct: true,
          },
          {
            text: 'Run #817 failed because secrets are not passed to workflows triggered by `pull_request` from a fork',
            correct: true,
          },
          {
            text: 'Switch the trigger to `pull_request_target` and check out the pull request’s code, so fork PRs get the secrets they need',
            correct: false,
          },
          {
            text: 'Secrets are encrypted at rest, so printing them in a public repository’s log is harmless',
            correct: false,
          },
        ],
        hint: 'Masking is a text replacement of known values. And who controls the code in a fork’s pull request?',
        why: 'Masking replaces known secret strings in the log; any transformation (base64, splitting, URL-encoding) defeats it, so never print secrets, even for debugging. Once exposed, a secret must be rotated, as copies of public logs cannot be recalled. GitHub withholds secrets from `pull_request` runs from forks because the code is untrusted; `pull_request_target` runs with secrets, and checking out the fork’s code there hands those secrets to whoever opened the PR. Fork PRs should run tests that need no secrets (for example a database in a service container).',
      }),
    ),
    questionTask(
      'safe-deployments',
      'Make production deployments safe',
      single({
        id: `${ID}-safe-deployments`,
        difficulty: 3,
        prompt:
          'The team wants a human gate before production and a rollback measured in minutes. Which setup gives both?',
        correct:
          'Protect the `production` environment with required reviewers and a deployment branch rule for `main`; deploy to a staging slot, run smoke tests against it, then swap slots, so rollback is swapping back',
        wrong: [
          'Keep deploying straight to production and roll back by reverting the commit and waiting for the pipeline',
          'Remove branch protection on `main` so that fixes can be pushed faster when something breaks',
          'Let the on-call engineer deploy from their laptop with `az webapp deploy` when the pipeline is red',
        ],
        hint: 'One feature of GitHub gates the job; one feature of App Service keeps the previous version warm.',
        why: 'Environment protection rules pause the job until a reviewer approves and refuse deployments from other branches. App Service deployment slots let you deploy and warm up the new version in staging, verify it, and swap it into production; the previous version is then in the staging slot, so rolling back is another swap rather than a rebuild. Reverting and redeploying works but takes a full pipeline run, and bypassing the pipeline removes every control the team just added.',
      }),
    ),
    questionTask(
      'azure-devops-equivalent',
      'Apply the same rule in Azure DevOps',
      blanks({
        id: `${ID}-azure-devops-equivalent`,
        difficulty: 3,
        prompt:
          'The older product uses an Azure DevOps YAML pipeline. Complete the Deploy stage so it runs after the Test stage, only when it succeeded and only for main.',
        template: yaml(`stages:
- stage: Test
  jobs:
  - job: UnitTests
    steps:
    - script: dotnet test --configuration Release

- stage: Deploy
  {{blank:dependency}}: Test
  condition: and({{blank:status}}(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
  jobs:
  - deployment: DeployApi
    environment: production
    strategy:
      runOnce:
        deploy:
          steps:
          - script: echo deploying`),
        accepted: { dependency: ['dependsOn'], status: ['succeeded'] },
        caseSensitive: true,
        hint: 'Azure DevOps uses a different keyword than GitHub’s `needs`; a custom condition replaces the default one, so the success check must be written out.',
        why: '`dependsOn` orders stages (and jobs). When you write a custom `condition`, it replaces the default `succeeded()` condition, so you must include `succeeded()` yourself; otherwise the stage could run after a failed Test stage. Approvals in Azure DevOps are configured on the `production` environment (Approvals and checks), the counterpart of GitHub’s required reviewers.',
      }),
    ),
  ],
  limitations:
    'Structured assessment only: no workflow or pipeline is executed, so YAML answers are checked against the expected keywords and the diagnoses through questions, not by running GitHub Actions, Azure DevOps or Azure.',
};
