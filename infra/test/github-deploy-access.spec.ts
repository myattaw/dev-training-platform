import { App, Validations } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { GitHubDeployAccessStack } from '../lib/github-deploy-access-stack';

const ACCOUNT = '111111111111';
const REGION = 'us-east-2';
const REPO = 'octocat/dev-training-platform';

function synth(extra: { existingProviderArn?: string; stages?: string[] } = {}, withNag = false) {
  const app = new App();
  const stack = new GitHubDeployAccessStack(app, 'PracStack-GitHubDeploy', {
    env: { account: ACCOUNT, region: REGION },
    repository: REPO,
    stages: extra.stages ?? ['staging'],
    ...(extra.existingProviderArn ? { existingProviderArn: extra.existingProviderArn } : {}),
  });
  if (withNag) Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
  return { app, template: Template.fromStack(stack) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const roles = (t: Template) =>
  Object.values(t.findResources('AWS::IAM::Role')).map((r) => (r as Json).Properties);
const policyOf = (t: Template, rolePrefix: string) =>
  Object.entries(t.findResources('AWS::IAM::Policy'))
    .filter(([id]) => id.startsWith(rolePrefix))
    .flatMap(([, p]) => (p as Json).Properties.PolicyDocument.Statement);

describe('GitHub Actions deployment access (OIDC)', () => {
  it('creates the GitHub OIDC provider for STS, or reuses an existing one', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    const reused = synth({
      existingProviderArn: `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`,
    }).template;
    reused.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  });

  it('trusts only one repository and one GitHub environment per role, for an hour at most', () => {
    const { template } = synth();
    const byName = Object.fromEntries(roles(template).map((r) => [r.RoleName, r]));
    const subjectOf = (name: string) =>
      byName[name].AssumeRolePolicyDocument.Statement[0].Condition.StringEquals[
        'token.actions.githubusercontent.com:sub'
      ];
    expect(subjectOf('pracstack-github-plan-staging')).toBe(
      `repo:${REPO}:environment:staging-plan`,
    );
    expect(subjectOf('pracstack-github-deploy-staging')).toBe(`repo:${REPO}:environment:staging`);
    for (const role of roles(template)) {
      expect(role.MaxSessionDuration).toBe(3600);
      const condition = role.AssumeRolePolicyDocument.Statement[0].Condition;
      expect(Object.keys(condition)).toEqual(['StringEquals']); // never StringLike wildcards
      expect(condition.StringEquals['token.actions.githubusercontent.com:aud']).toBe(
        'sts.amazonaws.com',
      );
    }
  });

  it('lets the plan role assume only the read-only CDK lookup role', () => {
    const statements = policyOf(synth().template, 'StagingPlanRole');
    expect(statements).toHaveLength(1);
    expect(statements[0].Action).toBe('sts:AssumeRole');
    expect(JSON.stringify(statements[0].Resource)).toMatch(/cdk-hnb659fds-lookup-role-/);
  });

  it('lets the deploy role use the CDK bootstrap roles, read its stack, and probe its runners', () => {
    const statements = policyOf(synth().template, 'StagingDeployRole');
    const text = JSON.stringify(statements);
    for (const kind of ['deploy', 'file-publishing', 'image-publishing', 'lookup'])
      expect(text).toContain(`cdk-hnb659fds-${kind}-role-`);
    expect(text).toContain('stack/PracStack-staging/*');
    expect(text).toContain('function:PracStack-staging-*Runner*');
    const actions = statements.flatMap((s: Json) => [s.Action].flat());
    expect(actions.sort()).toEqual(
      [
        'cloudformation:DescribeStacks',
        'lambda:InvokeFunction',
        'sts:AssumeRole',
        'sts:TagSession',
      ].sort(),
    );
    expect(text).not.toMatch(/"Resource":"\*"/);
  });

  it('separates stages: a staging role can never touch production', () => {
    const { template } = synth({ stages: ['staging', 'production'] });
    const staging = JSON.stringify(policyOf(template, 'StagingDeployRole'));
    expect(staging).not.toContain('PracStack-production');
    expect(
      roles(template)
        .map((r) => r.RoleName)
        .sort(),
    ).toEqual([
      'pracstack-github-deploy-production',
      'pracstack-github-deploy-staging',
      'pracstack-github-plan-production',
      'pracstack-github-plan-staging',
    ]);
  });

  it('passes the AWS Solutions checks (cdk-nag)', () => {
    const { app } = synth({}, true);
    expect(() => app.synth()).not.toThrow();
  });

  it('refuses malformed repositories and stages', () => {
    expect(
      () =>
        new GitHubDeployAccessStack(new App(), 'X', {
          env: { account: ACCOUNT, region: REGION },
          repository: 'not a repo',
          stages: ['staging'],
        }),
    ).toThrow(/owner\/repository/);
    expect(() => synth({ stages: ['Staging!'] })).toThrow(/Invalid stage/);
  });
});
