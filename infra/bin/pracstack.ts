/**
 * CDK app. Synthesizing creates nothing in AWS; only `cdk deploy` does.
 *
 *   npm run deploy:prepare                                   # build and stage assets
 *   npx cdk synth  -c alertEmail=you@example.com             # (in infra/) templates only
 *   npx cdk deploy -c alertEmail=you@example.com             # creates resources (costs!)
 *   npx cdk destroy -c alertEmail=you@example.com            # removes them
 *
 * Context (-c key=value):
 *   stage              resource-name part and stack name `PracStack-<stage>` (default "dev")
 *   alertEmail         budget and alarm emails (required)
 *   budgetUsd          monthly budget; the runner kill switch fires above it (default 10)
 *   retainData         "true": keep users and progress on destroy (default false)
 *   signUpAllowlist    comma-separated emails or @domains allowed to sign up (default: anyone)
 *   runnerConcurrency  reserved concurrency per runner (default none; needs a raised quota)
 *
 * See docs/staging-launch.md.
 */
import { join } from 'node:path';
import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PracStackStack } from '../lib/pracstack-stack';
import { BUILD_DIR } from '../scripts/prepare-assets';

const app = new App();
const context = (key: string): string | undefined => {
  const value: unknown = app.node.tryGetContext(key);
  return value === undefined || value === null || value === '' ? undefined : String(value);
};

const stage = context('stage') ?? 'dev';
if (!/^[a-z][a-z0-9-]{1,15}$/.test(stage))
  throw new Error('stage must be 2–16 lower-case letters, digits or hyphens, e.g. "staging".');
const alertEmail = context('alertEmail');
if (!alertEmail || !/^[^@\s]+@[^@\s]+$/.test(alertEmail)) {
  throw new Error('Pass the budget-alert email: -c alertEmail=you@example.com');
}
const monthlyBudgetUsd = Number(context('budgetUsd') ?? 10);
if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd <= 0)
  throw new Error('budgetUsd must be a positive number of US dollars.');
const runnerConcurrencyText = context('runnerConcurrency');
const runnerConcurrency =
  runnerConcurrencyText === undefined ? undefined : Number(runnerConcurrencyText);
if (
  runnerConcurrency !== undefined &&
  (!Number.isInteger(runnerConcurrency) || runnerConcurrency < 1 || runnerConcurrency > 50)
)
  throw new Error('runnerConcurrency must be a whole number from 1 to 50.');

const account = process.env['CDK_DEFAULT_ACCOUNT'];
const region = process.env['CDK_DEFAULT_REGION'];
if (!account || !region) throw new Error('No AWS account/region: configure the AWS CLI first.');

new PracStackStack(app, `PracStack-${stage}`, {
  env: { account, region },
  stage,
  alertEmail,
  monthlyBudgetUsd,
  retainData: context('retainData') === 'true',
  signUpAllowlist: (context('signUpAllowlist') ?? '').split(','),
  ...(runnerConcurrency !== undefined ? { runnerConcurrency } : {}),
  assets: {
    webImmutable: join(BUILD_DIR, 'web-immutable'),
    webRevalidate: join(BUILD_DIR, 'web-revalidate'),
    lambda: join(BUILD_DIR, 'lambda'),
    runners: {
      typescript: join(BUILD_DIR, 'runners', 'typescript'),
      java: join(BUILD_DIR, 'runners', 'java'),
      sql: join(BUILD_DIR, 'runners', 'sql'),
    },
  },
  description: `PracStack (${stage}): web app, sign-in, API and progress storage.`,
});

Tags.of(app).add('project', 'pracstack');
Tags.of(app).add('stage', stage);
// AWS Solutions security checks (cdk-nag); unacknowledged findings fail synthesis.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
