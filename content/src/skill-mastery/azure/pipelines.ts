import type { QuestionSource } from '@pracstack/content-model';
import { yaml } from '../helpers';
import { configBlankFamily, scenarioFamily } from './builders';

/*
 * Azure DevOps Pipelines: YAML structure, triggers and PR validation, dependsOn
 * and conditions, variables and secrets, artifacts, environments and approvals,
 * deployment strategies, and service connections. Includes YAML debugging.
 */

export const pipelinesFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'az-pipe-structure',
    1,
    'A pipeline is stages, which contain jobs, which contain steps; each job gets its own agent.',
    [
      {
        key: 'job-is-agent-unit',
        question:
          'In this pipeline, which unit runs on one agent, with its steps sharing the same working directory?',
        code: yaml(`stages:
- stage: Build
  jobs:
  - job: Compile
    pool:
      vmImage: ubuntu-latest
    steps:
    - script: dotnet build -c Release
    - script: dotnet test -c Release --no-build`),
        correct: 'The job `Compile`',
        wrong: ['The stage `Build`', 'Each individual script step', 'The whole pipeline'],
        why: 'A job is the unit of work that runs on one agent; its steps run in sequence in the same workspace, which is why `--no-build` can reuse the build output. Separate jobs may run on different agents and do not share files.',
      },
      {
        key: 'branch-trigger',
        question:
          'With this trigger, a developer pushes to `feature/login`. Does the pipeline run?',
        code: yaml(`trigger:
  branches:
    include:
    - main
    - release/*

pool:
  vmImage: ubuntu-latest

steps:
- script: npm ci && npm test`),
        correct: 'No: CI runs only for pushes to `main` and branches matching `release/*`',
        wrong: [
          'Yes: every push runs the pipeline; the list only sets priority',
          'Yes, because `*` matches every branch',
          'Only if the commit message mentions `main`',
        ],
        why: 'The include list is a filter: only pushes to matching branches trigger CI. `release/*` matches branches under `release/`, not every branch. Without a `trigger` section at all, pushes to any branch would trigger it.',
      },
      {
        key: 'artifact-between-stages',
        difficulty: 2,
        question:
          'The Deploy stage fails with “no such file or directory” for the build output produced in the Build stage. What is missing?',
        code: yaml(`stages:
- stage: Build
  jobs:
  - job: Build
    steps:
    - script: dotnet publish src/Api -c Release -o $(Build.ArtifactStagingDirectory)/api
- stage: Deploy
  jobs:
  - job: Deploy
    steps:
    - script: ls $(Pipeline.Workspace)/api`),
        correct:
          'Publish the output as a pipeline artifact in Build and download it in Deploy, because each job may run on a fresh agent',
        wrong: [
          'A `dependsOn: Build` on the Deploy stage, which copies files between stages',
          'A larger agent, because the build output ran out of disk',
          'A `checkout: self` step in Deploy, which brings the build output',
        ],
        why: 'Jobs do not share disks; the Deploy job may run on another agent with an empty workspace. Pipeline artifacts carry files between jobs and stages. Stages already run in order here, and checkout brings source code, not build output.',
      },
    ],
  ),
  ...configBlankFamily(
    'az-pipe-keywords',
    2,
    'One keyword orders stages; the other is the status function that is the default condition.',
    [
      {
        key: 'deploy-after-build',
        prompt:
          'Complete the Deploy stage so that it waits for Build and only runs when everything before it succeeded and the branch is `main`.',
        template: yaml(`stages:
- stage: Build
  jobs:
  - job: Build
    steps:
    - script: dotnet build
- stage: Deploy
  {{blank:dep}}: Build
  condition: and({{blank:fn}}(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
  jobs:
  - job: Deploy
    steps:
    - script: ./deploy.sh`),
        blanks: { dep: ['dependsOn'], fn: ['succeeded'] },
        why: '`dependsOn` names the stages that must finish first. `succeeded()` is true when all dependencies succeeded; because a custom condition replaces the default one, it must be included explicitly next to the branch check.',
      },
      {
        key: 'job-order',
        prompt:
          'Two jobs are in the same stage. Make `Migrate` run first, and `DeployApi` start only after it finishes.',
        template: yaml(`jobs:
- job: Migrate
  steps:
  - script: ./migrate-database.sh
- job: DeployApi
  {{blank:dep}}: Migrate
  steps:
  - script: ./deploy-api.sh`),
        blanks: { dep: ['dependsOn'] },
        why: 'Jobs in a stage run in parallel by default (subject to available agents). `dependsOn` creates the order, so the API is not deployed against an unmigrated database.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-pipe-pr-validation',
    2,
    'Where PR validation is configured depends on where the repository is hosted; and fork builds run untrusted code.',
    [
      {
        key: 'azure-repos-pr-keyword',
        question:
          'The repository is in Azure Repos Git. The YAML below has a `pr` section, but pull requests to `main` never start a validation build. What is the fix?',
        code: yaml(`trigger:
- main

pr:
  branches:
    include:
    - main

steps:
- script: dotnet test`),
        correct:
          'Add a build validation branch policy on `main` that uses this pipeline; the `pr` keyword applies to GitHub and Bitbucket repositories',
        wrong: [
          'Indent `pr` under `trigger`',
          'Change `include` to `includes`',
          'Rename the file to azure-pipelines.pr.yml',
        ],
        why: 'For Azure Repos, PR validation is configured with branch policies, which can also make the build a required check before merging. The YAML `pr` trigger is ignored for Azure Repos. The YAML itself is valid.',
      },
      {
        key: 'fork-secrets',
        difficulty: 3,
        question:
          'An open-source project on GitHub builds pull requests with Azure Pipelines. For PRs from forks, the scan step fails because `$(SonarToken)`, a secret variable, is empty. Why?',
        correct:
          'By default, secrets are not made available to builds of pull requests from forks, because a fork can change the pipeline code to exfiltrate them',
        wrong: [
          'Secret variables are only available in scheduled builds',
          'Fork PR builds run in a different Azure DevOps organisation',
          'The secret is masked, which replaces its value with an empty string',
        ],
        why: 'A pull request from a fork runs code chosen by someone outside the project. Exposing secrets to it would let anyone steal them by opening a PR. Masking only hides values in logs; the value is still present for steps in trusted builds.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-pipe-yaml-debug',
    3,
    'Read the indentation and the expression syntax carefully: YAML nesting decides what belongs to what.',
    [
      {
        key: 'steps-at-root',
        question: 'Why is this pipeline rejected?',
        code: yaml(`trigger:
- main

jobs:
- job: Build
  pool:
    vmImage: ubuntu-latest
steps:
- script: dotnet build
- script: dotnet test`),
        correct:
          '`steps` is at the root, next to `jobs`, instead of indented inside the `Build` job; a pipeline root cannot mix `jobs` and `steps`',
        wrong: [
          '`pool` must come after `steps`',
          'A pipeline with `jobs` must also declare `stages`',
          '`trigger` must list `refs/heads/main`',
        ],
        why: 'YAML nesting is meaningful: at column zero `steps` is a property of the pipeline, not of the job, and the root can contain stages, jobs or steps but not a mix. Indent `steps` to the same level as `pool` inside the job. Stages are optional for single-stage pipelines.',
      },
      {
        key: 'condition-operators',
        question: 'This condition makes the pipeline invalid. What is the correct form?',
        code: yaml(`- stage: Deploy
  dependsOn: Build
  condition: succeeded() && eq(variables['Build.SourceBranch'], 'refs/heads/main')`),
        correct:
          "`condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))`",
        wrong: [
          "`condition: succeeded() and eq(variables['Build.SourceBranch'], 'refs/heads/main')`",
          "`condition: succeeded() & eq(variables['Build.SourceBranch'], 'refs/heads/main')`",
          "`condition: if succeeded() then eq(variables['Build.SourceBranch'], 'refs/heads/main')`",
        ],
        why: 'Pipeline expressions use functions, not infix operators: `and()`, `or()`, `not()`, `eq()`, `ne()` and so on. Writing them like C# or Bash expressions is the common mistake.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-pipe-deploy-gates',
    3,
    'Controls that pipeline authors must not be able to remove belong on protected resources, not in the YAML.',
    [
      {
        key: 'where-approvals-live',
        question:
          'Production deployments must be approved by the operations lead, and developers who edit the YAML must not be able to bypass that. Where is the approval configured?',
        correct:
          'As an approval check on the `production` environment that the deployment job targets',
        wrong: [
          'As a `manualApproval: true` property on the stage in the YAML',
          'As a variable `RequireApproval` in a variable group',
          'In the pipeline’s trigger settings',
        ],
        why: 'Approvals and checks are set on resources such as environments and service connections by the people who administer them. Any pipeline that deploys to the environment must pass them, and the YAML cannot turn them off. A YAML flag would be removable by anyone who can edit the file.',
      },
      {
        key: 'blue-green-slots',
        question:
          'An App Service deployment goes to a staging slot, which is warmed up and smoke-tested, then swapped with production; rollback is swapping back. Which deployment strategy is this?',
        correct: 'Blue-green',
        wrong: ['Rolling', 'Canary', 'Recreate'],
        why: 'Blue-green keeps two complete environments and switches all traffic at once, with an immediate way back. Rolling replaces instances in batches; canary sends a small share of traffic to the new version first; recreate stops the old version before starting the new one.',
      },
      {
        key: 'canary',
        question:
          'A team wants a new version to receive a small share of users first, watch error rates, then widen it step by step. Which strategy describes this?',
        correct: 'Canary',
        wrong: ['Blue-green', 'Run once', 'Rolling restart of all instances at once'],
        why: 'A canary release exposes the new version to a small slice of traffic, checks health, and expands in increments, limiting the blast radius of a bad release. Blue-green switches everything at once.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-pipe-dependencies',
    4,
    'Without dependsOn, jobs in a stage run in parallel; and a custom condition replaces the default “previous succeeded”.',
    [
      {
        key: 'parallel-jobs',
        question:
          'Sometimes the API is deployed and starts failing because the database migration has not run yet. Why?',
        code: yaml(`- stage: Deploy
  jobs:
  - job: MigrateDatabase
    steps:
    - script: ./migrate.sh
  - job: DeployApi
    steps:
    - script: ./deploy-api.sh`),
        correct:
          'Jobs in a stage run in parallel unless `dependsOn` says otherwise; add `dependsOn: MigrateDatabase` to `DeployApi`',
        wrong: [
          'Jobs run in alphabetical order, so `DeployApi` always runs first',
          '`migrate.sh` must be listed before `deploy-api.sh` in the same step',
          'The stage needs `strategy: runOnce` to run jobs in order',
        ],
        why: 'Listing order does not create dependencies between jobs. With enough agents, both start together, and the outcome depends on which finishes first. Stages, in contrast, depend on the previous stage by default.',
      },
      {
        key: 'deploy-skips-tests',
        question: 'Production was deployed although the Test stage failed. Why?',
        code: yaml(`stages:
- stage: Build
  jobs: [ ... ]
- stage: Test
  dependsOn: Build
  jobs: [ ... ]
- stage: Deploy
  dependsOn: Build
  jobs: [ ... ]`),
        correct:
          'Deploy depends only on Build, so it runs in parallel with Test and ignores its result; it should be `dependsOn: [Build, Test]`',
        wrong: [
          'Stages always run in parallel unless a condition is set',
          'A failed stage only blocks stages in other pipelines',
          'Test failures only fail the pipeline after Deploy finishes',
        ],
        why: 'An explicit `dependsOn` replaces the default dependency on the previous stage. Both Test and Deploy wait only for Build, so they fan out in parallel, and Deploy does not care how Test ends.',
      },
      {
        key: 'condition-without-succeeded',
        question:
          'On the `main` branch, the Build stage failed, but this Deploy stage still ran. Why?',
        code: yaml(`- stage: Deploy
  dependsOn: Build
  condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')`),
        correct:
          'A custom condition replaces the default `succeeded()`, so only the branch is checked; use `and(succeeded(), eq(...))`',
        wrong: [
          '`dependsOn` is ignored whenever a condition is present',
          'The condition is evaluated before Build starts, when it has not failed yet',
          '`eq` returns true for any branch name that contains `main`',
        ],
        why: 'Without a condition, a stage runs only if its dependencies succeeded. Once you write a condition, that implicit check is gone unless you include it. `dependsOn` still makes Deploy wait for Build; it just no longer requires success.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-pipe-secrets',
    4,
    'Secrets are deliberately harder to reach than ordinary variables, and Key Vault access needs the service connection’s permissions.',
    [
      {
        key: 'secret-not-in-env',
        question:
          '`DbPassword` is a secret pipeline variable. The script fails because `DB_PASSWORD` is empty. What fixes it?',
        code: yaml(`steps:
- script: ./migrate.sh --password "$DB_PASSWORD"
  displayName: Migrate`),
        correct:
          'Map the secret explicitly with `env:` on the step, for example `DB_PASSWORD: $(DbPassword)`',
        wrong: [
          'Rename the variable to `DB_PASSWORD`; secret variables become environment variables automatically',
          'Print the variable first with `echo $(DbPassword)` so it is loaded',
          'Mark the step `continueOnError: true`',
        ],
        why: 'Non-secret variables are exposed to scripts as environment variables, but secrets are not, to reduce accidental leaks. Map them per step with `env`. Even then the value is masked in logs; echoing secrets is the leak masking tries to contain.',
      },
      {
        key: 'key-vault-variable-group',
        question:
          'A variable group is linked to a key vault. The pipeline fails while loading it with an error saying the service connection’s identity lacks permission to get and list secrets. What is the fix?',
        code: yaml(`variables:
- group: shop-prod-secrets   # linked to kv-shop-prod

steps:
- script: ./deploy.sh
  env:
    SQL_PASSWORD: $(SqlPassword)`),
        correct:
          'Grant the identity behind the variable group’s service connection permission to read (get and list) secrets on `kv-shop-prod`',
        wrong: [
          'Grant the developer who queued the pipeline access to the key vault',
          'Copy the secrets into the variable group as plain values',
          'Add a `checkout: self` step before the variable group loads',
        ],
        why: 'The pipeline fetches Key Vault secrets with the service connection, not with the requesting user’s identity, so that identity needs data-plane read access to secrets. Copying secret values into plain variables defeats the purpose of the Key Vault link.',
      },
      {
        key: 'workload-identity-federation',
        question:
          'Deployments break every year when the client secret of the Azure service connection expires. What does workload identity federation change?',
        correct:
          'The service connection gets short-lived tokens by presenting a token issued by Azure DevOps, which Entra ID trusts through a federated credential, so there is no secret to store or rotate',
        wrong: [
          'The secret is stored in Key Vault and rotated automatically every year',
          'The pipeline signs in as the user who created the service connection',
          'The secret never expires, because it is renewed on each run',
        ],
        why: 'With federation, the app registration or managed identity has a federated credential that trusts tokens Azure DevOps issues for that specific service connection. Entra ID exchanges them for short-lived access tokens, so no long-lived secret exists to leak or expire.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-pipe-runtime-values',
    5,
    'Know when each piece of YAML is evaluated: template expressions at compile time, macros and runtime expressions while the run is going.',
    [
      {
        key: 'template-expression-too-early',
        question:
          'The first step computes a version and sets it as a variable. The second step prints an empty value for the first echo. Why?',
        code: yaml(`variables:
  version: ''

steps:
- script: echo "##vso[task.setvariable variable=version]1.4.$(Build.BuildId)"
  displayName: Compute version
- script: |
    echo "template: \${{ variables.version }}"
    echo "macro: $(version)"`),
        correct:
          '`${{ }}` is evaluated when the YAML is compiled, before any step runs, so it sees the empty initial value; `$(version)` is read at runtime and prints the new value',
        wrong: [
          '`task.setvariable` only affects steps in other jobs',
          'Both echoes print empty, because variables are read-only once defined in YAML',
          '`${{ }}` reads environment variables, and the variable is not exported',
        ],
        why: 'Template expressions are resolved once, when the pipeline is expanded, so they only see values known at queue time. Values set by a logging command during the run are visible to later steps through macro syntax or runtime expressions.',
      },
      {
        key: 'output-variable-between-jobs',
        question:
          'Job B prints an empty `tag`. Which change makes it receive the value set in job A?',
        code: yaml(`jobs:
- job: A
  steps:
  - script: echo "##vso[task.setvariable variable=imageTag]api-$(Build.BuildId)"
    name: setTag
- job: B
  dependsOn: A
  variables:
    tag: $[ dependencies.A.outputs['setTag.imageTag'] ]
  steps:
  - script: echo "$(tag)"`),
        correct:
          'Mark the variable as an output variable: add `;isOutput=true` to the `task.setvariable` command',
        wrong: [
          'Remove `dependsOn: A`, because dependencies are not needed for outputs',
          'Replace `$[ ]` with `${{ }}` so the value is read at compile time',
          'Rename the step from `setTag` to `A`',
        ],
        why: "A variable set with `task.setvariable` is local to its job unless it is declared an output with `isOutput=true`; only then can other jobs read it as `dependencies.<job>.outputs['<step>.<name>']`. That also requires the `dependsOn` and the step `name`, which are already correct. A compile-time expression cannot see values produced while the run is going.",
      },
      {
        key: 'deployment-job-no-checkout',
        question:
          'This deployment job fails with `./scripts/smoke-test.sh: No such file or directory`, although the script is in the repository. Why?',
        code: yaml(`- stage: Deploy
  jobs:
  - deployment: DeployWeb
    environment: production
    strategy:
      runOnce:
        deploy:
          steps:
          - script: ./scripts/smoke-test.sh`),
        correct:
          'Deployment jobs do not check out the repository automatically; add `- checkout: self` or publish the scripts as part of the artifact',
        wrong: [
          'Scripts cannot run in deployment jobs, only tasks',
          'The `production` environment blocks access to files',
          '`runOnce` deletes the workspace before the deploy hook',
        ],
        why: 'Regular jobs check out the source by default, but deployment jobs are meant to deploy artifacts, so they skip checkout unless you ask for it (they download pipeline artifacts instead). Either check out the repo or ship the script inside the build artifact.',
      },
    ],
  ),
];
