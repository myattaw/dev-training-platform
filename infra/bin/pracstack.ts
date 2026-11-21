/**
 * CDK app. Synthesizing creates nothing in AWS; only `cdk deploy` does.
 *
 *   npm run deploy:prepare                                   # build and stage assets
 *   npx cdk synth  -c alertEmail=you@example.com             # (in infra/) templates only
 *   npx cdk deploy -c alertEmail=you@example.com             # creates resources (costs!)
 *   npx cdk destroy                                          # removes them
 *
 * Context: stage (default "dev"), alertEmail (required), budgetUsd (default 10),
 * retainData (default false: destroy removes users and progress too).
 */
import { join } from 'node:path';
import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PracStackStack } from '../lib/pracstack-stack';
import { BUILD_DIR } from '../scripts/prepare-assets';

const app = new App();
const stage = String(app.node.tryGetContext('stage') ?? 'dev');
const alertEmail = app.node.tryGetContext('alertEmail') as string | undefined;
if (!alertEmail || !/^[^@\s]+@[^@\s]+$/.test(alertEmail)) {
  throw new Error('Pass the budget-alert email: -c alertEmail=you@example.com');
}
const account = process.env['CDK_DEFAULT_ACCOUNT'];
const region = process.env['CDK_DEFAULT_REGION'];
if (!account || !region) throw new Error('No AWS account/region: configure the AWS CLI first.');

new PracStackStack(app, `PracStack-${stage}`, {
  env: { account, region },
  stage,
  alertEmail,
  monthlyBudgetUsd: Number(app.node.tryGetContext('budgetUsd') ?? 10),
  retainData: String(app.node.tryGetContext('retainData') ?? 'false') === 'true',
  assets: {
    webImmutable: join(BUILD_DIR, 'web-immutable'),
    webRevalidate: join(BUILD_DIR, 'web-revalidate'),
    lambda: join(BUILD_DIR, 'lambda'),
  },
  description: `PracStack (${stage}): web app, sign-in, API and progress storage.`,
});

Tags.of(app).add('project', 'pracstack');
Tags.of(app).add('stage', stage);
// AWS Solutions security checks (cdk-nag); unacknowledged findings fail synthesis.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
