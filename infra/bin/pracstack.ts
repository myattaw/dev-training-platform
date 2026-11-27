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
 *   webExecution       run Web Development Challenges (three web runner functions and the web
 *                      worker; docs/lambda-web-runner.md). Default ON: a deploy that forgot the
 *                      flag deleted production's runners (2026-11-27). "false": browse-only
 *   googleClientId     enables "Continue with Google" (OAuth client ID from Google Cloud)
 *   githubClientId     enables "Continue with GitHub" (GitHub OAuth App client ID; its secret is in
 *                      Secrets Manager, the bridge's signing key in SSM; see docs/accounts-and-auth.md)
 *   googleClientSecretName  Secrets Manager secret holding its client secret
 *                      (default pracstack/<stage>/google-client-secret)
 *   domain             the stage's own domain, e.g. pracstack.com (www.<domain> redirects to it);
 *                      needs certificateArn. DNS is hosted elsewhere: see docs/production.md
 *   certificateArn     us-east-1 ACM certificate for <domain>, www.<domain>, auth.<domain>
 *   authDomain         "true": sign-in pages at auth.<domain> (after <domain> resolves)
 *
 * The certificate for a domain (us-east-1, validated by DNS records at the DNS host):
 *   npx cdk deploy PracStack-<stage>-certificate -c stage=<stage> -c certificateFor=pracstack.com
 *
 * GitHub Actions deployment access (a separate, one-time stack; no assets needed):
 *   npx cdk deploy PracStack-GitHubDeploy -c githubRepo=owner/repo [-c githubStages=staging,production]
 *     [-c githubOidcProviderArn=arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com]
 *
 * See docs/staging-launch.md.
 */
import { join } from 'node:path';
import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { CertificateStack } from '../lib/certificate-stack';
import { GitHubDeployAccessStack } from '../lib/github-deploy-access-stack';
import { PracStackStack } from '../lib/pracstack-stack';
import { BUILD_DIR } from '../scripts/prepare-assets';

const app = new App();
const context = (key: string): string | undefined => {
  const value: unknown = app.node.tryGetContext(key);
  return value === undefined || value === null || value === '' ? undefined : String(value);
};

const account = process.env['CDK_DEFAULT_ACCOUNT'];
const region = process.env['CDK_DEFAULT_REGION'];
if (!account || !region) throw new Error('No AWS account/region: configure the AWS CLI first.');

const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const githubRepo = context('githubRepo');
const certificateFor = context('certificateFor')?.toLowerCase();
if (certificateFor) {
  // Only the certificate stack, in us-east-1 (CloudFront and Cognito custom domains need it there).
  if (!DOMAIN.test(certificateFor))
    throw new Error('certificateFor must be a domain like pracstack.com.');
  const stage = context('stage') ?? 'dev';
  new CertificateStack(app, `PracStack-${stage}-certificate`, {
    env: { account, region: 'us-east-1' },
    domainName: certificateFor,
    alternateNames: [`www.${certificateFor}`, `auth.${certificateFor}`],
    description: `PracStack (${stage}): TLS certificate for ${certificateFor}.`,
  });
  Tags.of(app).add('stage', stage);
} else if (githubRepo) {
  // Only the deployment-access stack: no web or runner assets are needed.
  const providerArn = context('githubOidcProviderArn');
  new GitHubDeployAccessStack(app, 'PracStack-GitHubDeploy', {
    env: { account, region },
    repository: githubRepo,
    stages: (context('githubStages') ?? 'staging').split(',').map((s) => s.trim()),
    ...(providerArn ? { existingProviderArn: providerArn } : {}),
    description: 'PracStack: OIDC roles that let GitHub Actions plan and deploy (no access keys).',
  });
} else {
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

  const githubClientId = context('githubClientId');
  if (githubClientId && !/^[A-Za-z0-9._-]{10,40}$/.test(githubClientId))
    throw new Error('githubClientId must be a GitHub OAuth App client ID (e.g. Ov23li…).');
  const domain = context('domain')?.toLowerCase();
  const certificateArn = context('certificateArn');
  if (domain && !DOMAIN.test(domain)) throw new Error('domain must look like pracstack.com.');
  if (
    domain &&
    !/^arn:aws:acm:us-east-1:\d{12}:certificate\/[0-9a-f-]{36}$/.test(certificateArn ?? '')
  )
    throw new Error(
      'domain needs certificateArn: the us-east-1 ACM certificate (see docs/production.md).',
    );
  const webExecution = context('webExecution') ?? 'true';
  if (webExecution !== 'true' && webExecution !== 'false')
    throw new Error('webExecution must be "true" (the default) or "false" (browse-only).');
  const googleClientId = context('googleClientId');
  if (googleClientId && !/^[0-9]+-[a-z0-9]+.apps.googleusercontent.com$/.test(googleClientId))
    throw new Error('googleClientId must look like 1234-abc.apps.googleusercontent.com.');

  new PracStackStack(app, `PracStack-${stage}`, {
    env: { account, region },
    stage,
    alertEmail,
    monthlyBudgetUsd,
    retainData: context('retainData') === 'true',
    webExecution: webExecution === 'true',
    signUpAllowlist: (context('signUpAllowlist') ?? '').split(','),
    ...(runnerConcurrency !== undefined ? { runnerConcurrency } : {}),
    ...(googleClientId
      ? {
          google: {
            clientId: googleClientId,
            clientSecretName:
              context('googleClientSecretName') ?? `pracstack/${stage}/google-client-secret`,
          },
        }
      : {}),
    ...(githubClientId
      ? {
          github: {
            clientId: githubClientId,
            clientSecretName:
              context('githubClientSecretName') ?? `pracstack/${stage}/github-client-secret`,
            signingKeyParameter:
              context('githubSigningKeyParameter') ?? `/pracstack/${stage}/github-oidc-signing-key`,
          },
        }
      : {}),
    ...(domain && certificateArn
      ? {
          customDomain: {
            domainName: domain,
            redirectNames: [`www.${domain}`],
            certificateArn,
            ...(context('authDomain') === 'true' ? { authDomainName: `auth.${domain}` } : {}),
          },
        }
      : {}),
    assets: {
      webImmutable: join(BUILD_DIR, 'web-immutable'),
      webRevalidate: join(BUILD_DIR, 'web-revalidate'),
      lambda: join(BUILD_DIR, 'lambda'),
      githubOidc: join(BUILD_DIR, 'github-oidc'),
      runners: {
        typescript: join(BUILD_DIR, 'runners', 'typescript'),
        java: join(BUILD_DIR, 'runners', 'java'),
        csharp: join(BUILD_DIR, 'runners', 'csharp'),
        sql: join(BUILD_DIR, 'runners', 'sql'),
      },
      webRunners: {
        aspnetcore: join(BUILD_DIR, 'runners', 'web-aspnetcore'),
        'spring-boot': join(BUILD_DIR, 'runners', 'web-spring-boot'),
        django: join(BUILD_DIR, 'runners', 'web-django'),
      },
    },
    description: `PracStack (${stage}): web app, sign-in, API and progress storage.`,
  });
  Tags.of(app).add('stage', stage);
}

Tags.of(app).add('project', 'pracstack');
// AWS Solutions security checks (cdk-nag); unacknowledged findings fail synthesis.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
