import type { QuestionSource } from '@pracstack/content-model';
import { json, plain, yaml } from '../helpers';
import { configBlankFamily, scenarioFamily } from './builders';

/*
 * Infrastructure as code and delivery: CloudFormation stacks, change sets,
 * drift and rollback; AWS CDK v2 workflow, constructs, logical ids and removal
 * policies; deploying from GitHub Actions with OIDC; safe Lambda releases with
 * aliases and CodeDeploy; cost guardrails. CDK code is TypeScript shown as text
 * (aws-cdk-lib is not available to the content checker).
 */

const ACCOUNT = '123456789012';

export const iacDeliveryFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'aws-cfn-lifecycle',
    2,
    'CloudFormation compares the template with what it deployed last time. What tells you the difference before, and after, the fact?',
    [
      {
        key: 'drift',
        difficulty: 1,
        question:
          'Someone changed a security group rule in the console during an incident. The security group belongs to a CloudFormation stack. How can the team find resources that no longer match what the stack deployed?',
        correct: 'Run drift detection on the stack',
        wrong: [
          'Create a change set from the same template',
          'Look at the stack’s Outputs tab',
          'Delete and recreate the stack, then compare',
        ],
        why: 'Drift detection compares the live configuration of each supported resource with what CloudFormation expects and lists the differences. A change set compares a new template with the stack’s previous template, so it does not see console edits. Fix drift by putting the change in the template (or reverting it); otherwise the next update may silently undo it or fail.',
      },
      {
        key: 'change-set',
        question:
          'Before updating a production stack with a new template, the team wants to see which resources will be added, modified, or replaced. What should they use?',
        correct:
          'A change set: create it from the new template, review the proposed changes (including replacements), then execute it',
        wrong: [
          'Drift detection on the stack',
          'Stack termination protection',
          'Deploying to production and reading the stack events afterwards',
        ],
        why: 'A change set is CloudFormation’s preview: it lists each resource action and whether a modification requires replacement, which is what can destroy data. Nothing changes until you execute it. `cdk diff` gives a similar preview for CDK apps. Termination protection only prevents deleting the stack.',
      },
      {
        key: 'failed-update',
        difficulty: 3,
        question:
          'A stack update adds ten resources. Creating the seventh fails because of an invalid property. What does CloudFormation do by default?',
        correct:
          'It rolls the stack back to its previous state, removing what this update created, and ends in UPDATE_ROLLBACK_COMPLETE',
        wrong: [
          'It keeps the six created resources and skips the remaining four',
          'It deletes the whole stack, including resources from earlier deployments',
          'It retries the seventh resource until the property becomes valid',
        ],
        why: 'Stack operations are all-or-nothing by default: on failure, CloudFormation returns the stack to the last working configuration. The stack events show the first failure (the root cause); later events are the rollback. The stack is usable and can be updated again with a fixed template.',
      },
      {
        key: 'update-rollback-failed',
        difficulty: 5,
        question:
          'An update failed, and during the rollback a resource that someone had deleted by hand outside CloudFormation could not be restored. The stack is now in UPDATE_ROLLBACK_FAILED, and new updates are refused. What is the recovery path?',
        correct:
          'Fix the cause if possible, then continue the rollback (ContinueUpdateRollback), skipping resources that cannot be rolled back; the stack reaches UPDATE_ROLLBACK_COMPLETE and can be updated again',
        wrong: [
          'Submit a corrected template as a normal update; CloudFormation applies it on top',
          'Delete the stack and recreate it, which is the only option once rollback fails',
          'Wait: CloudFormation retries the rollback every hour until it succeeds',
        ],
        why: 'In UPDATE_ROLLBACK_FAILED the stack is stuck between versions, so normal updates are not allowed. Continue-update-rollback retries the rollback; for resources that can never be restored you can tell it to skip them, after which CloudFormation treats them as rolled back (and you reconcile them by hand). Deleting the stack would destroy everything else in it, including data stores.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-cdk-workflow',
    2,
    'CDK synthesises CloudFormation and deploys it through stacks, using resources created once per account and Region.',
    [
      {
        key: 'diff',
        difficulty: 1,
        question:
          'A developer changed a CDK stack and wants to see how the deployed stack would change before deploying. Which command does that?',
        correct: '`cdk diff`',
        wrong: ['`cdk bootstrap`', '`cdk init`', '`cdk destroy --dry-run`'],
        why: '`cdk diff` synthesises the app and compares the result with the deployed stack, showing added, changed and removed resources and IAM or security group changes. Bootstrap prepares an environment; init creates a new project.',
      },
      {
        key: 'bootstrap',
        question:
          'The first `cdk deploy` into a new account and Region fails with the message below. What should the team do?',
        code: plain(
          "SSM parameter /cdk-bootstrap/hnb659fds/version not found. Has the environment been bootstrapped? Please run 'cdk bootstrap'",
        ),
        correct: `Run \`cdk bootstrap aws://${ACCOUNT}/eu-west-1\` once for that account and Region; it creates the CDKToolkit stack with the asset storage and deployment roles CDK uses`,
        wrong: [
          'Create the SSM parameter by hand with any value',
          'Reinstall the CDK CLI, because the parameter ships with it',
          'Switch the stack to raw CloudFormation, which CDK does not support in new accounts',
        ],
        why: 'CDK v2 deployments rely on resources in each target environment (account plus Region): an S3 bucket and ECR repository for assets and IAM roles for deployment. `cdk bootstrap` creates them in the CDKToolkit stack and records a version in that SSM parameter. Faking the parameter would only move the failure to the missing resources.',
      },
      {
        key: 'escape-hatch',
        difficulty: 4,
        question:
          'A CloudFormation property was recently added to a resource, but the CDK L2 construct the team uses does not expose it yet. What is the supported way to set it?',
        code: plain(`// TypeScript (AWS CDK v2)
const table = new dynamodb.Table(this, 'Orders', {
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
});`),
        correct:
          'Use an escape hatch: get the underlying L1 resource with `table.node.defaultChild as dynamodb.CfnTable` and set the property there (or with `addPropertyOverride`)',
        wrong: [
          'Edit the synthesised template in `cdk.out` before each deploy',
          'Wait for a CDK release; there is no way to set properties the L2 construct does not expose',
          'Set the property in the AWS console after deploying',
        ],
        why: 'L2 constructs wrap L1 `Cfn*` resources, which map one-to-one to CloudFormation and expose every property. The escape hatch reaches the L1 resource so your code still owns the setting. Editing `cdk.out` is overwritten by the next synth, and a console change is drift that the next deployment may revert.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-cdk-replacement',
    4,
    'CloudFormation identifies a resource by its logical id, which CDK derives from the construct path. What happens when the id changes, or a property that forces a new resource changes?',
    [
      {
        key: 'rename-construct',
        question:
          'A developer renames a construct for readability. `cdk diff` then shows the output below. What will deploying do?',
        code: plain(`// TypeScript (AWS CDK v2): before
new dynamodb.Table(this, 'Orders', { partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING } });
// after
new dynamodb.Table(this, 'OrdersTable', { partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING } });

$ cdk diff
Resources
[-] AWS::DynamoDB::Table Orders Orders1A2B3C4D
[+] AWS::DynamoDB::Table OrdersTable OrdersTable5E6F7A8B`),
        correct:
          'Create a new, empty table and remove the old one from the stack (CDK retains tables by default, so the old one is orphaned rather than deleted); the app now uses the empty table',
        wrong: [
          'Rename the existing table in place, keeping its data',
          'Nothing: construct ids are only labels in the code',
          'Copy the items from the old table into the new one automatically',
        ],
        why: 'The construct id is part of the logical id, so a new id is a new resource to CloudFormation. Because the L2 Table defaults to `RemovalPolicy.RETAIN`, the data is not destroyed, but the application switches to a new empty table. Treat logical ids of stateful resources as permanent; if a rename is needed, keep the old logical id (for example with `overrideLogicalId`) or plan a migration.',
      },
      {
        key: 'removal-policy',
        question:
          'To make tearing down test environments easier, a developer sets `removalPolicy: RemovalPolicy.DESTROY` on the shared table construct used by every stage, including production. What is the risk, and what is the better setup?',
        correct:
          'Deleting the production stack or replacing the table would delete the data; keep RETAIN (with deletion protection and point-in-time recovery) for production and use DESTROY only for disposable stages',
        wrong: [
          'No risk: DESTROY only applies when the table is empty',
          'DESTROY makes CloudFormation back up the table before deleting it, so nothing can be lost',
          'The setting is ignored for DynamoDB tables',
        ],
        why: 'The removal policy decides what happens to the physical resource when it leaves the stack: DESTROY deletes it, data included, with no backup. Making the policy depend on the stage (and enabling deletion protection and backups in production) keeps test clean-up easy without putting production data at risk.',
      },
      {
        key: 'custom-name-replacement',
        difficulty: 5,
        question:
          'A developer changes the partition key of a table that has an explicit `tableName: "orders"`. The deployment fails with the message below. What does it tell you?',
        code: plain(
          'CloudFormation cannot update a stack when a custom-named resource requires replacing. Rename orders and update the stack again.',
        ),
        correct:
          'Changing the key schema requires a brand-new table, and CloudFormation cannot create the replacement while the old one holds the same name; any replacement would be an empty table, so the data needs a planned migration',
        wrong: [
          'The partition key can be changed in place once the table is renamed',
          'Table names are global across all AWS accounts, so another customer already uses `orders`',
          'The deploy role lacks permission to rename tables',
        ],
        why: 'Some properties (like a DynamoDB key schema) cannot be updated, so CloudFormation replaces the resource: create new, switch references, delete old. With a fixed physical name the new resource would collide with the old one, so CloudFormation refuses. The deeper lesson is that replacing a stateful resource never moves its data; create a new table alongside, migrate, then switch.',
      },
    ],
  ),
  ...configBlankFamily(
    'aws-gha-oidc-permissions',
    2,
    'The job needs to ask GitHub for an OIDC token, and that is a permission of the job’s GITHUB_TOKEN.',
    [
      {
        key: 'id-token',
        prompt:
          'Complete the workflow so the job can request an OIDC token and assume the deploy role. Fill in the permission value.',
        template: yaml(`permissions:
  id-token: {{blank:id-token}}
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${ACCOUNT}:role/github-deploy-prod
          aws-region: eu-west-1
      - run: npx cdk deploy --require-approval never`),
        blanks: { 'id-token': ['write'] },
        why: '`id-token: write` lets the job request an OIDC token from GitHub, which `configure-aws-credentials` exchanges with STS for temporary credentials. Without it the action cannot get a token and fails to load credentials. Once you set any permission explicitly, the others default to none, so `contents: read` is needed for checkout.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-deploy-access',
    3,
    'Who needs which permissions, in which account, for how long?',
    [
      {
        key: 'separate-accounts',
        difficulty: 2,
        question:
          'Why do AWS teams commonly put development, staging and production in separate AWS accounts rather than one account with naming conventions?',
        correct:
          'Accounts are strong isolation boundaries: credentials, mistakes or runaway costs in development cannot touch production resources unless access is explicitly granted',
        wrong: [
          'Some AWS services can only be used once per account',
          'An account can only run one CloudFormation stack per Region',
          'Separate accounts make deployments faster because they run on different hardware',
        ],
        why: 'By default nothing in one account can access another, so a dev role with broad rights or a test script gone wrong cannot reach production data. Separate accounts also give per-environment billing, quotas and guardrails (SCPs). An account can hold many stacks, so per-environment stacks are possible in one account; the reason to split is isolation.',
      },
      {
        key: 'missing-id-token',
        question:
          'A workflow step using `aws-actions/configure-aws-credentials` with `role-to-assume` fails with “Could not load credentials from any providers”. The role’s trust policy is correct. What is the most likely cause?',
        correct:
          'The workflow or job does not grant `id-token: write`, so it cannot request the OIDC token the action needs',
        wrong: [
          'The role’s permissions policy does not allow `cloudformation:*`',
          'The runner must be self-hosted to use OIDC',
          'The `aws-region` input must be `us-east-1` for OIDC',
        ],
        why: 'Without `id-token: write` there is no web identity token, so the action falls back to looking for other credentials and finds none. A trust-policy problem fails differently (not authorized to perform AssumeRoleWithWebIdentity), and missing deploy permissions only show up later, when the deployment calls AWS.',
      },
      {
        key: 'cdk-deploy-role',
        difficulty: 4,
        question:
          'A GitHub Actions role runs `cdk deploy` into an account bootstrapped with CDK v2 defaults. Which permissions policy for that role is closest to least privilege?',
        code: json(`{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "arn:aws:iam::${ACCOUNT}:role/cdk-hnb659fds-*"
}`),
        correct:
          'This one: the CLI only needs to assume the bootstrap roles (deploy, file and image publishing, lookup), which carry the deployment permissions',
        wrong: [
          'The AdministratorAccess managed policy, because CloudFormation creates IAM roles',
          'An IAM user with `cloudformation:*` and long-lived access keys stored in GitHub',
          'No policy at all: the OIDC provider grants deployment rights by itself',
        ],
        why: 'Modern CDK deployments go through roles created by `cdk bootstrap`: the CLI assumes them to upload assets and start the CloudFormation deployment, and CloudFormation uses its own execution role to create resources. The CI role therefore only needs to assume those roles. What CloudFormation may create is then controlled by the execution policies chosen at bootstrap, which is worth narrowing too.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-safe-release',
    4,
    'Versions are immutable; aliases are movable pointers that can split traffic. What does rolling back change, and what does it not?',
    [
      {
        key: 'alias-not-latest',
        difficulty: 3,
        question:
          'Why should API Gateway invoke a Lambda alias such as `live` rather than the function’s `$LATEST`?',
        correct:
          'An alias points at a published, immutable version, so releases and rollbacks are just moving the alias (optionally splitting traffic between two versions)',
        wrong: [
          '`$LATEST` cannot be invoked by API Gateway',
          'Aliases run faster because they skip cold starts',
          'Aliases give the function a separate execution role per stage',
        ],
        why: '`$LATEST` changes whenever code is updated, so callers get whatever was uploaded last. Published versions never change, and an alias can be moved back in one step, or weighted to send a small share of traffic to a new version for a canary release.',
      },
      {
        key: 'canary-alarm',
        question:
          'A SAM deployment uses CodeDeploy with `Canary10Percent10Minutes` on alias `live` (version 7 to version 8) and a CloudWatch alarm on the function’s errors. Five minutes in, the alarm goes into ALARM. What happens?',
        correct:
          'CodeDeploy stops the deployment and moves all traffic on `live` back to version 7',
        wrong: [
          'The deployment continues, and after 10 minutes all traffic moves to version 8',
          'Version 8 is deleted and the function is redeployed from source',
          'Traffic stays split 90/10 until someone acts',
        ],
        why: 'In a canary deployment, 10% of traffic goes to the new version first; CodeDeploy watches the configured alarms and rolls back automatically if any fires, so only a fraction of requests saw the bad version for a few minutes. Without alarms, the shift would continue on schedule.',
      },
      {
        key: 'data-not-rolled-back',
        difficulty: 5,
        question:
          'Version 8 of a function starts writing order items with `total` as an object `{ amount, currency }` instead of a number. A canary rollback moves traffic back to version 7, which then fails on every order version 8 wrote. What was the design mistake?',
        correct:
          'The data change was not backward compatible: rollbacks revert code, not data, so version 8 should first have written a format version 7 can still read (expand and contract)',
        wrong: [
          'The canary percentage was too small; 50% would have avoided the failures',
          'CodeDeploy should have rolled back the DynamoDB items too',
          'Version 7 should have been deleted so it could not be rolled back to',
        ],
        why: 'Traffic shifting makes code changes reversible, but anything the new version writes stays. Changes to stored formats need to be made in steps: add the new field while keeping the old one readable, deploy readers that understand both, and only then stop writing the old form. A bigger canary just corrupts more data faster.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-cost-guardrails',
    2,
    'Separate knowing about spend (alerts, attribution) from stopping it (actions you set up yourself).',
    [
      {
        key: 'budget-alert',
        difficulty: 1,
        question:
          'A team wants an email when this month’s AWS spend is forecast to exceed the amount they agreed with finance. What should they set up?',
        correct: 'An AWS Budgets budget with an alert on forecasted cost',
        wrong: [
          'An AWS CloudTrail trail filtered on billing events',
          'A Lambda function that runs every hour and estimates cost from the CloudFormation templates',
          'AWS Config rules on every resource',
        ],
        why: 'AWS Budgets tracks actual and forecasted cost against an amount you choose and notifies by email or SNS when thresholds are crossed, so a forecast alert warns before the money is spent. CloudTrail and Config record activity and configuration, not spend.',
      },
      {
        key: 'cost-allocation-tags',
        question:
          'Several teams share one account. Finance wants cost broken down by team. What makes that possible?',
        code: plain(`// TypeScript (AWS CDK v2)
const app = new cdk.App();
const stack = new PaymentsStack(app, 'Payments');
cdk.Tags.of(stack).add('team', 'payments');`),
        correct:
          'Tag resources consistently (as in this CDK code) and activate `team` as a cost allocation tag, so billing reports can group by it',
        wrong: [
          'Nothing more: CloudFormation stacks are listed per team in the bill automatically',
          'Give each team a different Region and split the bill by Region',
          'Tags only help in the console search; cost cannot be split within an account',
        ],
        why: 'Applying tags at the stack or app level in CDK propagates them to taggable resources. Once a tag key is activated as a cost allocation tag, Cost Explorer and billing reports can group costs by it (from activation onwards). Separate accounts per team give even cleaner separation, but tagging is what splits a shared account.',
      },
      {
        key: 'alert-does-not-stop',
        difficulty: 3,
        question:
          'A budget alert emailed the team at 80% of the monthly amount on a Friday night. By Monday the spend was far over budget. Why didn’t the budget stop it?',
        correct:
          'Budget alerts only notify; nothing is stopped unless budget actions or your own automation are configured to respond',
        wrong: [
          'Budgets stop all resources at 100% by default, but only on weekdays',
          'The alert should have been set at 100%, which shuts the account down',
          'Budgets only cover EC2, so other services kept running',
        ],
        why: 'A budget is a monitoring tool. Stopping spend takes an explicit response: budget actions (for example applying a restrictive policy or SCP), automation subscribed to the SNS notification, or a person on call. Decide in advance what should happen, because shutting things down automatically can be worse than the bill.',
      },
    ],
  ),
];
