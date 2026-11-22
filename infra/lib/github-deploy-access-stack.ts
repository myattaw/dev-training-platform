import {
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
  Validations,
  aws_iam as iam,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface GitHubDeployAccessProps extends StackProps {
  /** `owner/repository`, e.g. `octocat/dev-training-platform`. */
  readonly repository: string;
  /** Stages GitHub may deploy, e.g. `['staging']`. Each gets a plan and a deploy role. */
  readonly stages: readonly string[];
  /** An existing GitHub OIDC provider in this account; absent: one is created. */
  readonly existingProviderArn?: string;
  /** CDK bootstrap qualifier (default `hnb659fds`). */
  readonly bootstrapQualifier?: string;
}

export const GITHUB_OIDC_ISSUER = 'token.actions.githubusercontent.com';

/**
 * Lets GitHub Actions deploy PracStack WITHOUT long-lived AWS keys: the
 * workflow exchanges its short-lived OIDC token for one of these roles.
 *
 * Per stage, two roles, each usable only from one GitHub *environment* of one
 * repository (the token's `sub` claim is matched exactly):
 *
 *   pracstack-github-plan-<stage>    environment `<stage>-plan`: `cdk diff` only
 *                                    (assumes the CDK lookup role: read-only)
 *   pracstack-github-deploy-<stage>  environment `<stage>`: `cdk deploy`
 *                                    (assumes the CDK bootstrap roles), reads the
 *                                    stack's outputs and invokes its runners for
 *                                    the post-deployment isolation checks
 *
 * Neither role has any other permission. What a deployment can change is
 * bounded by the CDK bootstrap's CloudFormation execution role (see
 * docs/staging-launch.md). Protect the `<stage>` environment in GitHub with
 * required reviewers: that is the approval gate.
 */
export class GitHubDeployAccessStack extends Stack {
  constructor(scope: Construct, id: string, props: GitHubDeployAccessProps) {
    super(scope, id, props);
    if (!/^[\w.-]+\/[\w.-]+$/.test(props.repository))
      throw new Error(`githubRepo must be owner/repository, got "${props.repository}".`);
    if (props.stages.length === 0) throw new Error('At least one stage is needed.');
    const qualifier = props.bootstrapQualifier ?? 'hnb659fds';

    const providerArn =
      props.existingProviderArn ??
      new iam.CfnOIDCProvider(this, 'GitHubOidcProvider', {
        url: `https://${GITHUB_OIDC_ISSUER}`,
        clientIdList: ['sts.amazonaws.com'],
      }).attrArn;

    const bootstrapRole = (kind: string) =>
      `arn:${this.partition}:iam::${this.account}:role/cdk-${qualifier}-${kind}-role-${this.account}-${this.region}`;

    const githubRole = (
      roleId: string,
      roleName: string,
      environment: string,
      description: string,
    ) =>
      new iam.Role(this, roleId, {
        roleName,
        description,
        maxSessionDuration: Duration.hours(1),
        assumedBy: new iam.WebIdentityPrincipal(providerArn, {
          StringEquals: {
            [`${GITHUB_OIDC_ISSUER}:aud`]: 'sts.amazonaws.com',
            [`${GITHUB_OIDC_ISSUER}:sub`]: `repo:${props.repository}:environment:${environment}`,
          },
        }),
      });

    for (const stage of props.stages) {
      if (!/^[a-z][a-z0-9-]{1,15}$/.test(stage)) throw new Error(`Invalid stage "${stage}".`);
      const Stage = stage[0]?.toUpperCase() + stage.slice(1);
      const stackName = `PracStack-${stage}`;

      const plan = githubRole(
        `${Stage}PlanRole`,
        `pracstack-github-plan-${stage}`,
        `${stage}-plan`,
        `GitHub Actions (${props.repository}, environment ${stage}-plan): cdk diff of ${stackName}. Read-only.`,
      );
      plan.addToPolicy(
        new iam.PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: [bootstrapRole('lookup')],
        }),
      );

      const deploy = githubRole(
        `${Stage}DeployRole`,
        `pracstack-github-deploy-${stage}`,
        stage,
        `GitHub Actions (${props.repository}, environment ${stage}): deploys ${stackName} through the CDK bootstrap roles.`,
      );
      deploy.addToPolicy(
        new iam.PolicyStatement({
          actions: ['sts:AssumeRole', 'sts:TagSession'],
          resources: ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(bootstrapRole),
        }),
      );
      deploy.addToPolicy(
        new iam.PolicyStatement({
          actions: ['cloudformation:DescribeStacks'],
          resources: [
            `arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/${stackName}/*`,
          ],
        }),
      );
      // infra/scripts/verify-runners.ts: hostile probes against the deployed runners.
      deploy.addToPolicy(
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [
            `arn:${this.partition}:lambda:${this.region}:${this.account}:function:${stackName}-*Runner*`,
          ],
        }),
      );
      const arnPrefix = (service: string) =>
        `arn:<AWS::Partition>:${service}:${this.region}:${this.account}`;
      Validations.of(deploy).acknowledge(
        {
          id: `AwsSolutions::AwsSolutions-IAM5[Resource::${arnPrefix('cloudformation')}:stack/${stackName}/*]`,
          reason: 'The stack ARN ends in an id CloudFormation generates; the name is fixed.',
        },
        {
          id: `AwsSolutions::AwsSolutions-IAM5[Resource::${arnPrefix('lambda')}:function:${stackName}-*Runner*]`,
          reason:
            "This stage's runner functions only: CloudFormation generates their names, prefixed with the stack name. Needed by verify-runners.ts.",
        },
      );

      new CfnOutput(this, `${Stage}PlanRoleArn`, { value: plan.roleArn });
      new CfnOutput(this, `${Stage}DeployRoleArn`, { value: deploy.roleArn });
    }
  }
}
