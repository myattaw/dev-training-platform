import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App, Validations } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { appContentSecurityPolicy, workerContentSecurityPolicy } from '@pracstack/web-security';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  API_THROTTLE,
  normalizeAllowlist,
  PracStackStack,
  type PracStackProps,
  SIGN_UP_GATE_SOURCE,
  SPA_REWRITE_SOURCE,
  spaRewriteSource,
  WEB_RUNNER_SIZES,
  WEB_WORKER,
  webConfig,
} from '../lib/pracstack-stack';
import { CertificateStack } from '../lib/certificate-stack';
import { BRANDING_SETTINGS, brandLogoBase64 } from '../lib/managed-login-branding';
import { isImmutableAsset } from '../scripts/prepare-assets';

const ACCOUNT = '111111111111';
const REGION = 'us-east-2';

function fakeAssets() {
  const root = mkdtempSync(join(tmpdir(), 'pracstack-infra-'));
  const dir = (name: string, file: string) => {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, file), 'x');
    return join(root, name);
  };
  return {
    webImmutable: dir('web-immutable', 'main-ABCDEFGH.js'),
    webRevalidate: dir('web-revalidate', 'index.html'),
    lambda: dir('lambda', 'index.mjs'),
    githubOidc: dir('github-oidc', 'index.mjs'),
    runners: {
      typescript: dir('runner-typescript', 'Dockerfile'),
      java: dir('runner-java', 'Dockerfile'),
      csharp: dir('runner-csharp', 'Dockerfile'),
      sql: dir('runner-sql', 'Dockerfile'),
    },
    webRunners: {
      aspnetcore: dir('runner-web-aspnetcore', 'Dockerfile'),
      'spring-boot': dir('runner-web-spring-boot', 'Dockerfile'),
      django: dir('runner-web-django', 'Dockerfile'),
    },
  };
}

function synth(withNag = false, extra: Partial<PracStackProps> = {}) {
  const app = new App();
  const stack = new PracStackStack(app, 'PracStack-test', {
    env: { account: ACCOUNT, region: REGION },
    stage: 'test',
    alertEmail: 'alerts@example.com',
    monthlyBudgetUsd: 10,
    retainData: false,
    assets: fakeAssets(),
    ...extra,
  });
  if (withNag) Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
  return { app, template: Template.fromStack(stack) };
}

let template: Template;
beforeAll(() => {
  template = synth().template;
});

/** CloudFormation JSON is untyped; tests navigate it freely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
interface Resource {
  readonly Type: string;
  readonly Properties: Json;
  readonly DeletionPolicy?: string;
  readonly DependsOn?: string[];
}
const resources = (): Record<string, Resource> =>
  template.toJSON()['Resources'] as Record<string, Resource>;
const runnerSizes = () =>
  resourcesOf('AWS::Lambda::Function')
    .filter((f) => f.Properties.PackageType === 'Image')
    .map((f) => [f.Properties.MemorySize, f.Properties.Timeout]);
const resourcesOf = (type: string): Resource[] =>
  Object.values(template.findResources(type)) as Resource[];

describe('cost safety', () => {
  it('creates only pay-per-use or free resource types (nothing that bills while idle)', () => {
    const types = new Set(
      Object.values(resources() as Record<string, { Type: string }>).map((r) => r.Type),
    );
    const allowed = new Set([
      'AWS::DynamoDB::GlobalTable',
      'AWS::S3::Bucket',
      'AWS::S3::BucketPolicy',
      'AWS::CloudFront::Distribution',
      'AWS::CloudFront::OriginAccessControl',
      'AWS::CloudFront::Function',
      'AWS::CloudFront::CachePolicy',
      'AWS::CloudFront::ResponseHeadersPolicy',
      'AWS::Cognito::UserPool',
      'AWS::Cognito::UserPoolDomain',
      'AWS::Cognito::UserPoolClient',
      'AWS::Cognito::UserPoolGroup',
      'AWS::Cognito::ManagedLoginBranding',
      'AWS::ApiGatewayV2::Api',
      'AWS::ApiGatewayV2::Stage',
      'AWS::ApiGatewayV2::Route',
      'AWS::ApiGatewayV2::Integration',
      'AWS::ApiGatewayV2::Authorizer',
      'AWS::Lambda::Function',
      'AWS::Lambda::Permission',
      'AWS::Lambda::LayerVersion',
      'AWS::IAM::Role',
      'AWS::IAM::Policy',
      'AWS::Logs::LogGroup',
      'AWS::Budgets::Budget',
      'AWS::Budgets::BudgetsAction',
      // Alarms (first 10 free) and their email topic.
      'AWS::CloudWatch::Alarm',
      'AWS::SNS::Topic',
      'AWS::SNS::TopicPolicy',
      'AWS::SNS::Subscription',
      'AWS::IAM::ManagedPolicy',
      // The runners' isolated VPC (no gateways, endpoints or routes: all free).
      'AWS::EC2::VPC',
      'AWS::EC2::Subnet',
      'AWS::EC2::RouteTable',
      'AWS::EC2::SubnetRouteTableAssociation',
      'AWS::EC2::SecurityGroup',
      'AWS::EC2::FlowLog',
      'Custom::CDKBucketDeployment',
      'Custom::S3AutoDeleteObjects',
    ]);
    expect([...types].filter((t) => !allowed.has(t))).toEqual([]);
  });

  it('uses on-demand DynamoDB, the Cognito Essentials plan, and bounded log retention', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      BillingMode: 'PAY_PER_REQUEST',
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      // Essentials: 10,000 MAU free; the lowest plan with managed login branding.
      UserPoolTier: 'ESSENTIALS',
      MfaConfiguration: 'OPTIONAL',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    });
    for (const group of resourcesOf('AWS::Logs::LogGroup'))
      expect(group.Properties.RetentionInDays).toBe(14);
  });

  it('defines the admins group that grants the ADMIN plan', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 1);
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: 'admins' });
  });

  it('throttles the API overall and alerts on the monthly budget', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: {
        ThrottlingRateLimit: API_THROTTLE.rateLimit,
        ThrottlingBurstLimit: API_THROTTLE.burstLimit,
      },
    });
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 10, Unit: 'USD' }, TimeUnit: 'MONTHLY' },
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: 'FORECASTED', Threshold: 100 }),
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'alerts@example.com' }],
        }),
      ]),
    });
  });

  it('stops the runners automatically when actual spend passes the budget', () => {
    template.hasResourceProperties('AWS::Budgets::BudgetsAction', {
      NotificationType: 'ACTUAL',
      ActionType: 'APPLY_IAM_POLICY',
      ApprovalModel: 'AUTOMATIC',
      ActionThreshold: { Type: 'PERCENTAGE', Value: 100 },
      Definition: {
        IamActionDefinition: {
          PolicyArn: { Ref: Match.stringLikeRegexp('^StopRunnersPolicy') },
          Roles: [{ Ref: Match.stringLikeRegexp('^ApiFunctionRole') }],
        },
      },
    });
    const deny = resourcesOf('AWS::IAM::ManagedPolicy')[0]?.Properties.PolicyDocument.Statement[0];
    expect(deny).toMatchObject({ Effect: 'Deny', Action: 'lambda:InvokeFunction' });
    expect(deny.Resource).toHaveLength(4);
    // The budget service may attach exactly that policy, to exactly that role.
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: ['iam:AttachRolePolicy', 'iam:DetachRolePolicy'],
            Condition: {
              ArnEquals: { 'iam:PolicyARN': { Ref: Match.stringLikeRegexp('^StopRunnersPolicy') } },
            },
          }),
        ],
      },
    });
  });

  it('caps runner sizes, which bound the cost of each run', () => {
    const sizes = runnerSizes();
    expect(sizes).toEqual(
      expect.arrayContaining([
        [1024, 20],
        [1024, 25],
        [1536, 20],
      ]),
    );
  });

  it('emails alarms for failures, within the free alarm allowance', () => {
    const alarms = resourcesOf('AWS::CloudWatch::Alarm');
    expect(alarms.length).toBeGreaterThanOrEqual(6);
    expect(alarms.length).toBeLessThanOrEqual(10);
    for (const a of alarms) {
      expect(a.Properties.AlarmActions).toHaveLength(1);
      expect(a.Properties.AlarmActions[0].Ref).toMatch(/^AlarmTopic/);
    }
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.com',
    });
  });

  it('keeps CloudFront access logs for 30 days in a private bucket', () => {
    const dist = resourcesOf('AWS::CloudFront::Distribution')[0]?.Properties.DistributionConfig;
    expect(dist.Logging).toMatchObject({ Prefix: 'cloudfront/' });
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [Match.objectLike({ ExpirationInDays: 30, Status: 'Enabled' })],
      },
      PublicAccessBlockConfiguration: Match.objectLike({
        BlockPublicAcls: true,
        RestrictPublicBuckets: true,
      }),
    });
  });

  it('can be removed completely by `cdk destroy` when retainData is false', () => {
    const json = resources() as Record<string, { Type: string; DeletionPolicy?: string }>;
    const retained = Object.entries(json).filter(([, r]) => r.DeletionPolicy === 'Retain');
    expect(retained).toEqual([]);
  });
});

describe('security', () => {
  it('passes the AWS Solutions checks (cdk-nag) with only reviewed acknowledgements', () => {
    const { app } = synth(true);
    expect(() => app.synth()).not.toThrow();
  });

  it('protects every API route with the Cognito JWT authorizer', () => {
    const routes = resourcesOf('AWS::ApiGatewayV2::Route');
    expect(routes).toHaveLength(1);
    expect(routes[0]?.Properties).toMatchObject({
      RouteKey: 'ANY /api/{proxy+}',
      AuthorizationType: 'JWT',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: {
        Audience: [Match.anyValue()],
        Issuer: Match.objectLike({
          'Fn::Join': ['', Match.arrayWith([`https://cognito-idp.${REGION}.amazonaws.com/`])],
        }),
      },
    });
  });

  it('gives the API function only its table, its logs and invoking the runners; no wildcards', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      Handler: 'index.handler',
      Environment: {
        Variables: Match.objectLike({
          TABLE_NAME: Match.anyValue(),
          JWT_ISSUER: Match.anyValue(),
          JWT_AUDIENCE: Match.anyValue(),
        }),
      },
    });
    const policies = template.findResources('AWS::IAM::Policy', {
      Properties: { Roles: [{ Ref: Match.stringLikeRegexp('^ApiFunctionRole') }] },
    });
    const statements = (Object.values(policies) as Resource[]).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as { Action: string[]; Resource: unknown }[],
    );
    const actions = statements.flatMap((s) => [s.Action].flat());
    expect(
      actions.every(
        (a) => a.startsWith('dynamodb:') || a.startsWith('logs:') || a === 'lambda:InvokeFunction',
      ),
    ).toBe(true);
    expect(JSON.stringify(statements.map((s) => s.Resource))).not.toContain('"*"');
    expect(actions).not.toContain('dynamodb:DeleteTable');
  });

  it('keeps the web bucket private, reachable only through CloudFront', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: Match.objectLike({ SigningBehavior: 'always' }),
    });
  });

  it('sends the shared CSP: Cognito allowed for pages, eval only for workers', () => {
    const policies = resourcesOf('AWS::CloudFront::ResponseHeadersPolicy').map(
      (p) =>
        p.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy
          .ContentSecurityPolicy as string,
    );
    const cognito = `https://pracstack-test-`;
    const app = policies.find((p) => p.includes(cognito));
    expect(app).toBeDefined();
    const origin = /https:\/\/pracstack-test-[a-f0-9]{8}\.auth\.us-east-2\.amazoncognito\.com/.exec(
      app ?? '',
    )?.[0];
    expect(app).toBe(appContentSecurityPolicy({ connectOrigins: [origin ?? ''], https: true }));
    expect(policies).toContain(workerContentSecurityPolicy());
  });

  it('routes /api/* to the API uncached, forwarding Authorization', () => {
    const dist = resourcesOf('AWS::CloudFront::Distribution')[0]?.Properties.DistributionConfig as {
      CacheBehaviors: { PathPattern: string; CachePolicyId: { Ref: string } }[];
    };
    const api = dist.CacheBehaviors.find((b) => b.PathPattern === '/api/*');
    expect(api).toBeDefined();
    const policy = resources()[api?.CachePolicyId.Ref ?? ''] as {
      Properties: { CachePolicyConfig: Record<string, unknown> };
    };
    expect(policy.Properties.CachePolicyConfig).toMatchObject({
      DefaultTTL: 0,
      MinTTL: 0,
      ParametersInCacheKeyAndForwardedToOrigin: {
        HeadersConfig: { HeaderBehavior: 'whitelist', Headers: ['Authorization'] },
      },
    });
    expect(dist.CacheBehaviors.map((b) => b.PathPattern)).toContain('/worker-*.js');
  });

  it('configures a public sign-in client: code flow with PKCE, no secret, our callback only', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      PreventUserExistenceErrors: 'ENABLED',
      CallbackURLs: [{ 'Fn::Join': ['', ['https://', Match.anyValue(), '/auth/callback']] }],
    });
  });

  it('serves the newer managed login, branded for the web client with the PracStack logo', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', { ManagedLoginVersion: 2 });
    template.resourceCountIs('AWS::Cognito::ManagedLoginBranding', 1);
    const [branding] = resourcesOf('AWS::Cognito::ManagedLoginBranding');
    expect(branding?.Properties.ClientId).toEqual({
      Ref: expect.stringMatching(/^UserPoolWebClient/),
    });
    expect(branding?.Properties.UserPoolId).toEqual({ Ref: expect.stringMatching(/^UserPool/) });
    expect(branding?.Properties.UseCognitoProvidedValues).toBe(false);
    expect(branding?.Properties.Settings).toEqual(BRANDING_SETTINGS);
    expect(branding?.Properties.Settings.components.primaryButton.lightMode.defaults).toEqual({
      backgroundColor: '1769aaff',
      textColor: 'ffffffff',
    });
    expect(branding?.Properties.Assets).toEqual([
      { Category: 'FORM_LOGO', ColorMode: 'LIGHT', Extension: 'SVG', Bytes: brandLogoBase64() },
    ]);
    const svg = Buffer.from(branding?.Properties.Assets[0].Bytes, 'base64').toString('utf8');
    // Cognito rejects a logo whose width:height is outside 1:1 to 4:1 (it reads width/height).
    const width = Number(/^<svg [^>]*\bwidth="([\d.]+)"/.exec(svg)?.[1]);
    const height = Number(/^<svg [^>]*\bheight="([\d.]+)"/.exec(svg)?.[1]);
    expect(width / height).toBeGreaterThanOrEqual(1);
    expect(width / height).toBeLessThan(4);
    const viewBox = /^<svg [^>]*viewBox="([^"]+)"/.exec(svg)?.[1].split(' ').map(Number) ?? [];
    expect(viewBox[2]! / viewBox[3]!).toBeCloseTo(width / height, 2);
    expect(svg).toContain('<title>PracStack</title>');
    // Cognito's limit for one asset (base64 bytes).
    expect(branding?.Properties.Assets[0].Bytes.length).toBeLessThan(1_000_000);
    // Every color is hex with an alpha byte, as Cognito requires.
    const colors = JSON.stringify(BRANDING_SETTINGS).match(/"[0-9a-f]{6,}"/g) ?? [];
    expect(colors.length).toBeGreaterThan(10);
    for (const c of colors) expect(c).toMatch(/^"[0-9a-f]{8}"$/);
    // The style is created after the client and after the domain switches to managed login.
    expect(branding?.DependsOn).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^UserPoolDomain/),
        expect.stringMatching(/^UserPoolWebClient/),
      ]),
    );
  });
});

describe('runners (learner code and SQL)', () => {
  const runnerFunctions = () =>
    resourcesOf('AWS::Lambda::Function').filter((f) => f.Properties.PackageType === 'Image');

  it('gives the runner VPC no way out: no gateways, NAT, endpoints or routes', () => {
    for (const type of [
      'AWS::EC2::InternetGateway',
      'AWS::EC2::VPCGatewayAttachment',
      'AWS::EC2::NatGateway',
      'AWS::EC2::EIP',
      'AWS::EC2::VPCEndpoint',
      'AWS::EC2::Route',
      'AWS::EC2::TransitGatewayAttachment',
      'AWS::EC2::VPCPeeringConnection',
    ])
      expect(resourcesOf(type), type).toEqual([]);
  });

  it('gives the runner VPC no DNS (lookups could carry data out)', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      EnableDnsSupport: false,
      EnableDnsHostnames: false,
    });
  });

  it('allows no traffic in or out of the runners', () => {
    const groups = resourcesOf('AWS::EC2::SecurityGroup');
    expect(groups).toHaveLength(1);
    const props = groups[0]?.Properties;
    expect(props.SecurityGroupIngress).toBeUndefined();
    // CDK's placeholder rule that matches no real traffic.
    expect(props.SecurityGroupEgress).toEqual([
      expect.objectContaining({
        CidrIp: '255.255.255.255/32',
        IpProtocol: 'icmp',
        FromPort: 252,
        ToPort: 86,
      }),
    ]);
    template.hasResourceProperties('AWS::EC2::FlowLog', { TrafficType: 'REJECT' });
  });

  it('runs four container-image functions (TypeScript, Java, C#, SQL) inside that VPC', () => {
    const fns = runnerFunctions();
    expect(fns).toHaveLength(4);
    for (const fn of fns) {
      expect(fn.Properties.VpcConfig.SecurityGroupIds).toHaveLength(1);
      expect(fn.Properties.VpcConfig.SubnetIds).toHaveLength(2);
      expect(fn.Properties.Architectures).toEqual(['x86_64']);
      expect(fn.Properties.Environment).toBeUndefined();
    }
  });

  it('gives runner roles no access to any data (logs and VPC attachment only)', () => {
    const roleIds = Object.keys(template.findResources('AWS::IAM::Role')).filter((id) =>
      /RunnerRole/.test(id),
    );
    expect(roleIds).toHaveLength(4);
    for (const id of roleIds) {
      const policies = Object.values(
        template.findResources('AWS::IAM::Policy', { Properties: { Roles: [{ Ref: id }] } }),
      ) as Resource[];
      const actions = policies.flatMap((p) =>
        (p.Properties.PolicyDocument.Statement as { Action: string | string[] }[]).flatMap((st) =>
          [st.Action].flat(),
        ),
      );
      expect(
        actions.every((a) => a.startsWith('logs:')),
        id,
      ).toBe(true);
    }
  });

  it('lets the API invoke exactly the four runners, and tells it their names', () => {
    const policies = template.findResources('AWS::IAM::Policy', {
      Properties: { Roles: [{ Ref: Match.stringLikeRegexp('^ApiFunctionRole') }] },
    });
    const invoke = (Object.values(policies) as Resource[])
      .flatMap(
        (p) => p.Properties.PolicyDocument.Statement as { Action: unknown; Resource: unknown }[],
      )
      .filter((st) => st.Action === 'lambda:InvokeFunction');
    expect(invoke).toHaveLength(1);
    const targets = invoke[0]?.Resource as { 'Fn::GetAtt': [string, string] }[];
    expect(targets.map((t) => t['Fn::GetAtt'][0]).sort()).toEqual([
      expect.stringMatching(/^CsharpRunner/),
      expect.stringMatching(/^JavaRunner/),
      expect.stringMatching(/^SqlRunner/),
      expect.stringMatching(/^TypescriptRunner/),
    ]);
    expect(targets.every((t) => t['Fn::GetAtt'][1] === 'Arn')).toBe(true);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
      Timeout: 29,
      Environment: {
        Variables: Match.objectLike({
          RUNNER_TYPESCRIPT_FUNCTION: { Ref: Match.stringLikeRegexp('^TypescriptRunner') },
          RUNNER_JAVA_FUNCTION: { Ref: Match.stringLikeRegexp('^JavaRunner') },
          RUNNER_CSHARP_FUNCTION: { Ref: Match.stringLikeRegexp('^CsharpRunner') },
          RUNNER_SQL_FUNCTION: { Ref: Match.stringLikeRegexp('^SqlRunner') },
        }),
      },
    });
  });
});

describe('web execution (web challenges on Lambda)', () => {
  let web: Template;
  beforeAll(() => {
    web = synth(false, { webExecution: true }).template;
  });
  const of = (t: Template, type: string) => Object.values(t.findResources(type)) as Resource[];
  const statementsOf = (t: Template, rolePrefix: string) =>
    (
      Object.values(
        t.findResources('AWS::IAM::Policy', {
          Properties: { Roles: [{ Ref: Match.stringLikeRegexp(`^${rolePrefix}`) }] },
        }),
      ) as Resource[]
    ).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as { Action: unknown; Resource: unknown }[],
    );
  const getAttTargets = (resource: unknown) =>
    [resource]
      .flat()
      .map((r) => (r as { 'Fn::GetAtt': [string, string] })['Fn::GetAtt'][0])
      .sort();
  const webRunners = (t: Template) =>
    of(t, 'AWS::Lambda::Function').filter(
      (f) => f.Properties.PackageType === 'Image' && f.Properties.MemorySize >= 2048,
    );
  const worker = () =>
    of(web, 'AWS::Lambda::Function').find((f) => f.Properties.Handler === 'web-worker.handler');

  it('is off by default: no web functions, and the API stays browse-only', () => {
    expect(webRunners(template)).toEqual([]);
    expect(
      resourcesOf('AWS::Lambda::Function').some(
        (f) => f.Properties.Handler === 'web-worker.handler',
      ),
    ).toBe(false);
    const api = resourcesOf('AWS::Lambda::Function').find(
      (f) => f.Properties.Handler === 'index.handler' && f.Properties.Timeout === 29,
    );
    expect(api?.Properties.Environment.Variables.WEB_WORKER_FUNCTION).toBeUndefined();
  });

  it('refuses to build without the web runner images', () => {
    const assets = { ...fakeAssets(), webRunners: undefined };
    expect(() => synth(false, { webExecution: true, assets })).toThrow(/webRunners/);
  });

  it('adds only free or pay-per-use resource types', () => {
    const types = (t: Template) =>
      new Set(
        Object.values(t.toJSON()['Resources'] as Record<string, Resource>).map((r) => r.Type),
      );
    const before = types(template);
    expect([...types(web)].filter((t) => !before.has(t)).sort()).toEqual([
      // The worker's "no retries" setting and the alarm-line metric filter: both free.
      'AWS::Lambda::EventInvokeConfig',
      'AWS::Logs::MetricFilter',
    ]);
  });

  it('runs three web runner images in the isolated runner VPC, sized as measured', () => {
    const fns = webRunners(web);
    expect(fns).toHaveLength(3);
    const vpcGroups = of(web, 'AWS::EC2::SecurityGroup');
    expect(vpcGroups).toHaveLength(1);
    for (const fn of fns) {
      expect(fn.Properties.VpcConfig.SecurityGroupIds).toHaveLength(1);
      expect(fn.Properties.VpcConfig.SubnetIds).toHaveLength(2);
      expect(fn.Properties.Architectures).toEqual(['x86_64']);
      // Nothing to read, not even a function name.
      expect(fn.Properties.Environment).toBeUndefined();
      expect(fn.Properties.EphemeralStorage).toEqual({ Size: 1024 });
    }
    expect(fns.map((f) => [f.Properties.MemorySize, f.Properties.Timeout]).sort()).toEqual(
      Object.values(WEB_RUNNER_SIZES)
        .map((s) => [s.memoryMb, s.timeoutS])
        .sort(),
    );
  });

  it('gives web runner roles no access to any data (logs and VPC attachment only)', () => {
    const roleIds = Object.keys(web.findResources('AWS::IAM::Role')).filter((id) =>
      /^Web\w+RunnerRole/.test(id),
    );
    expect(roleIds).toHaveLength(3);
    for (const id of roleIds) {
      const actions = statementsOf(web, id).flatMap((st) => [st.Action].flat() as string[]);
      expect(
        actions.every((a) => a.startsWith('logs:')),
        id,
      ).toBe(true);
    }
  });

  it('runs the worker from the API bundle, outside the VPC, without retries', () => {
    const fn = worker();
    expect(fn).toBeDefined();
    expect(fn?.Properties.VpcConfig).toBeUndefined();
    expect(fn?.Properties.Architectures).toEqual(['arm64']);
    // It waits for a slot, then for one runner; both fit, under the 10-minute run lease.
    const longestRunner = Math.max(...Object.values(WEB_RUNNER_SIZES).map((s) => s.timeoutS));
    expect(fn?.Properties.Timeout).toBe(WEB_WORKER.timeoutS);
    expect(WEB_WORKER.timeoutS).toBeGreaterThanOrEqual(WEB_WORKER.queueWaitS + longestRunner + 30);
    expect(WEB_WORKER.timeoutS).toBeLessThan(10 * 60);
    expect(fn?.Properties.Environment.Variables).toMatchObject({
      WEB_CONCURRENT_GLOBAL: '2',
      WEB_QUEUE_WAIT_MS: String(WEB_WORKER.queueWaitS * 1000),
      WEB_RUNNER_ASPNETCORE_FUNCTION: { Ref: expect.stringMatching(/^WebAspnetcoreRunner/) },
      WEB_RUNNER_SPRING_BOOT_FUNCTION: { Ref: expect.stringMatching(/^WebSpringBootRunner/) },
      WEB_RUNNER_DJANGO_FUNCTION: { Ref: expect.stringMatching(/^WebDjangoRunner/) },
    });
    web.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      FunctionName: { Ref: Match.stringLikeRegexp('^WebWorkerFunction') },
      MaximumRetryAttempts: 0,
      MaximumEventAgeInSeconds: 300,
    });
  });

  it('lets the worker invoke exactly the three web runners, and use its table', () => {
    const statements = statementsOf(web, 'WebWorkerRole');
    const invoke = statements.filter((st) => st.Action === 'lambda:InvokeFunction');
    expect(invoke).toHaveLength(1);
    expect(getAttTargets(invoke[0]?.Resource)).toEqual([
      expect.stringMatching(/^WebAspnetcoreRunner/),
      expect.stringMatching(/^WebDjangoRunner/),
      expect.stringMatching(/^WebSpringBootRunner/),
    ]);
    const actions = statements.flatMap((st) => [st.Action].flat() as string[]);
    expect(actions.every((a) => /^(logs|dynamodb):/.test(a) || a === 'lambda:InvokeFunction')).toBe(
      true,
    );
  });

  it('lets the API start the worker, never a web runner directly', () => {
    const invoke = statementsOf(web, 'ApiFunctionRole').filter(
      (st) => st.Action === 'lambda:InvokeFunction',
    );
    expect(invoke).toHaveLength(1);
    const targets = getAttTargets(invoke[0]?.Resource);
    expect(targets).toHaveLength(5);
    expect(targets.some((t) => /^WebWorkerFunction/.test(t))).toBe(true);
    expect(targets.some((t) => /^Web\w+Runner/.test(t))).toBe(false);
    web.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
      Environment: {
        Variables: Match.objectLike({
          WEB_WORKER_FUNCTION: { Ref: Match.stringLikeRegexp('^WebWorkerFunction') },
        }),
      },
    });
  });

  it('stops the worker and the web runners with the budget kill switch', () => {
    const deny = of(web, 'AWS::IAM::ManagedPolicy')[0]?.Properties.PolicyDocument.Statement[0];
    expect(deny).toMatchObject({ Effect: 'Deny', Action: 'lambda:InvokeFunction' });
    expect(deny.Resource).toHaveLength(8);
    web.hasResourceProperties('AWS::Budgets::BudgetsAction', {
      Definition: {
        IamActionDefinition: {
          Roles: [
            { Ref: Match.stringLikeRegexp('^ApiFunctionRole') },
            { Ref: Match.stringLikeRegexp('^WebWorkerRole') },
          ],
        },
      },
    });
  });

  it('alarms on worker failures and on alarm lines (unverified responses), within the free ten', () => {
    const alarms = of(web, 'AWS::CloudWatch::Alarm');
    expect(alarms.length).toBeLessThanOrEqual(10);
    web.hasResourceProperties('AWS::Logs::MetricFilter', {
      LogGroupName: { Ref: Match.stringLikeRegexp('^WebWorkerLogs') },
      FilterPattern: '{ $.level = "alarm" }',
      MetricTransformations: [
        Match.objectLike({ MetricName: 'WebWorkerAlarmLines', MetricValue: '1' }),
      ],
    });
    web.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'WebWorkerAlarmLines',
      Threshold: 1,
    });
    web.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'Errors',
      Dimensions: [{ Name: 'FunctionName', Value: { Ref: Match.stringLikeRegexp('^WebWorker') } }],
    });
    for (const group of of(web, 'AWS::Logs::LogGroup'))
      expect(group.Properties.RetentionInDays).toBe(14);
  });

  it('outputs the worker and web runner names (for verify-runners)', () => {
    for (const name of [
      'WebWorkerName',
      'WebWorkerRoleName',
      'WebAspnetcoreRunnerName',
      'WebSpringBootRunnerName',
      'WebDjangoRunnerName',
    ])
      web.hasOutput(name, {});
  });

  it('passes the AWS Solutions checks (cdk-nag)', () => {
    const { app } = synth(true, { webExecution: true });
    expect(() => app.synth()).not.toThrow();
  });
});

describe('web hosting', () => {
  it('serves HTTP/2, not HTTP/3 (which stalled page loads on some networks)', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ HttpVersion: 'http2' }),
    });
  });

  it('rewrites client-side routes to index.html and leaves files alone', () => {
    const handler = new Function(`${SPA_REWRITE_SOURCE}; return handler;`)() as (e: {
      request: { uri: string };
    }) => { uri: string };
    const uri = (u: string) => handler({ request: { uri: u } }).uri;
    expect(uri('/')).toBe('/index.html');
    expect(uri('/challenges/pangram/workspace')).toBe('/index.html');
    expect(uri('/auth/callback')).toBe('/index.html');
    expect(uri('/main-ABCDEFGH.js')).toBe('/main-ABCDEFGH.js');
    expect(uri('/content/manifest.json')).toBe('/content/manifest.json');
  });

  it('caches only content-hashed files for a year', () => {
    for (const f of [
      'main-4AVHHWKT.js',
      'chunk-237ULAF7.js',
      'styles-VVAZTZ3C.css',
      'worker-UPO43OHT.js',
      'media/codicon-LTRFOK3N.ttf',
      // Angular 22 hash alphabet
      'chunk--3IhnF3m.js',
      'chunk-5r1-tvj6.js',
      'worker-B0vU_33C.js',
    ])
      expect(isImmutableAsset(f), f).toBe(true);
    for (const f of [
      'index.html',
      'config.json',
      'monaco.css',
      'favicon.ico',
      'content/manifest.json',
    ])
      expect(isImmutableAsset(f), f).toBe(false);
  });

  it('writes only public settings to config.json', () => {
    expect(webConfig('https://x.auth.us-east-2.amazoncognito.com', 'client', ['Google'])).toEqual({
      codeLanguages: ['typescript', 'java', 'csharp'],
      auth: {
        mode: 'cognito',
        domain: 'https://x.auth.us-east-2.amazoncognito.com',
        clientId: 'client',
        providers: ['Google'],
      },
    });
    expect(webConfig('https://x.auth.us-east-2.amazoncognito.com', 'client')).toEqual({
      // Only languages with a runner function are offered; Python and Swift are not deployed.
      codeLanguages: ['typescript', 'java', 'csharp'],
      auth: {
        mode: 'cognito',
        domain: 'https://x.auth.us-east-2.amazoncognito.com',
        clientId: 'client',
      },
    });
    // The only value filled in at deploy time is the app client ID.
    const markers = JSON.stringify(
      resourcesOf('Custom::CDKBucketDeployment').map((d) => d.Properties.SourceMarkers),
    );
    expect(markers.match(/"Ref":"[^"]+"/g)).toEqual([
      expect.stringMatching(/^"Ref":"UserPoolWebClient/),
    ]);
  });
});

describe('private staging options', () => {
  /** Runs the inline pre-sign-up trigger the way Lambda would (CommonJS). */
  const gate = (allowlist: string[]) => {
    const module = { exports: {} as { handler?: (event: unknown) => Promise<unknown> } };
    new Function('exports', 'process', SIGN_UP_GATE_SOURCE)(module.exports, {
      env: { ALLOWLIST: JSON.stringify(normalizeAllowlist(allowlist)) },
    });
    const handler = module.exports.handler;
    if (!handler) throw new Error('no handler');
    return (email: string, triggerSource = 'PreSignUp_SignUp', userName = 'a1b2c3') =>
      handler({ triggerSource, userName, request: { userAttributes: { email } } });
  };

  it('leaves sign-up open and creates no trigger by default', () => {
    expect(JSON.stringify(template.findResources('AWS::Cognito::UserPool'))).not.toContain(
      'PreSignUp',
    );
    template.hasOutput('SignUp', { Value: 'open to anyone' });
  });

  it('gates self sign-up with an allowlist trigger that has no permissions beyond its logs', () => {
    const { template: t } = synth(false, { signUpAllowlist: ['Ada@Example.com', '@team.dev'] });
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PreSignUp: Match.anyValue() },
    });
    t.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: { ALLOWLIST: JSON.stringify(['@team.dev', 'ada@example.com']) } },
    });
    t.hasOutput('SignUp', { Value: 'allowlist (invite-only)' });
    const gateRole = Object.entries(t.findResources('AWS::IAM::Policy')).filter(([id]) =>
      id.startsWith('SignUpGateRole'),
    );
    const actions = JSON.stringify(gateRole.map(([, p]) => (p as Json).Properties.PolicyDocument));
    expect(gateRole).toHaveLength(1);
    expect(actions).toMatch(/logs:PutLogEvents/);
    expect(actions).not.toMatch(/dynamodb|lambda:Invoke|cognito-idp|"\*"/);
  });

  it('passes the AWS Solutions checks with the allowlist enabled', () => {
    const { app } = synth(true, { signUpAllowlist: ['@example.com'] });
    expect(() => app.synth()).not.toThrow();
  });

  it('allows only allowlisted emails or domains, case-insensitively', async () => {
    const check = gate(['ada@example.com', '@team.dev']);
    await expect(check('ada@example.com')).resolves.toBeTruthy();
    await expect(check('  ADA@Example.COM ')).resolves.toBeTruthy();
    await expect(check('grace@team.dev')).resolves.toBeTruthy();
    for (const email of [
      'eve@example.com',
      'eve@evilteam.dev',
      'eve@team.dev.evil.com',
      '',
      '@team.dev',
    ])
      await expect(check(email), email).rejects.toThrow(/invite-only/);
    // Accounts an administrator creates are always allowed.
    await expect(check('anyone@else.org', 'PreSignUp_AdminCreateUser')).resolves.toBeTruthy();
  });

  it('allows GitHub accounts by numeric user ID, only through the GitHub provider', async () => {
    const check = gate(['github:39500954', 'ada@example.com']);
    const external = 'PreSignUp_ExternalProvider';
    await expect(check('anything@x.org', external, 'GitHub_39500954')).resolves.toBeTruthy();
    for (const [userName, source] of [
      ['GitHub_63262699', external], // not on the list
      ['GitHub_395009540', external], // a longer ID is a different account
      ['Google_39500954', external], // another provider with the same subject
      ['GitHub_39500954', 'PreSignUp_SignUp'], // a password sign-up cannot claim it
      ['github_39500954', external],
    ])
      await expect(check('eve@x.org', source, userName), `${userName} ${source}`).rejects.toThrow(
        /invite-only/,
      );
    // Email entries still apply to GitHub users.
    await expect(check('ada@example.com', external, 'GitHub_1')).resolves.toBeTruthy();
  });

  it('rejects malformed allowlist entries instead of silently ignoring them', () => {
    expect(normalizeAllowlist(['GitHub:39500954', 'github:63262699'])).toEqual([
      'github:39500954',
      'github:63262699',
    ]);
    for (const bad of ['github:myattaw', 'github:', 'github:0123', 'github:1 2'])
      expect(() => normalizeAllowlist([bad]), bad).toThrow(/numeric user ID/);
    expect(normalizeAllowlist([' Ada@Example.com ', '', '@team.dev', '@team.dev'])).toEqual([
      '@team.dev',
      'ada@example.com',
    ]);
    for (const bad of ['example.com', 'ada@', '@', 'a b@example.com', 'x@localhost'])
      expect(() => normalizeAllowlist([bad]), bad).toThrow(/Invalid sign-up allowlist entry/);
  });

  it('reserves runner concurrency only when asked (the default fits a new account)', () => {
    for (const f of resourcesOf('AWS::Lambda::Function'))
      expect(f.Properties.ReservedConcurrentExecutions).toBeUndefined();
    const { template: t } = synth(false, { runnerConcurrency: 3 });
    const fns = Object.values(t.findResources('AWS::Lambda::Function')) as Resource[];
    const reserved = fns.filter((f) => f.Properties.ReservedConcurrentExecutions === 3);
    expect(reserved).toHaveLength(4);
    expect(reserved.every((f) => f.Properties.PackageType === 'Image')).toBe(true);
  });

  it('offers only email sign-in unless Google is configured', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      SupportedIdentityProviders: ['COGNITO'],
    });
  });

  it('adds Google sign-in with the client secret read from Secrets Manager at deploy time', () => {
    const { app, template: t } = synth(false, {
      google: {
        clientId: '1234-abc.apps.googleusercontent.com',
        clientSecretName: 'pracstack/test/google-client-secret',
      },
    });
    t.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
      ProviderName: 'Google',
      ProviderType: 'Google',
      ProviderDetails: Match.objectLike({
        client_id: '1234-abc.apps.googleusercontent.com',
        authorize_scopes: 'openid email profile',
      }),
      AttributeMapping: Match.objectLike({ email: 'email', email_verified: 'email_verified' }),
    });
    const secret = JSON.stringify(
      Object.values(t.findResources('AWS::Cognito::UserPoolIdentityProvider')).map(
        (r) => (r as Json).Properties.ProviderDetails.client_secret,
      ),
    );
    // A CloudFormation dynamic reference, never the secret itself.
    expect(secret).toContain('{{resolve:secretsmanager:pracstack/test/google-client-secret');
    t.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      SupportedIdentityProviders: Match.arrayWith(['COGNITO', 'Google']),
    });
    // The deployed config.json (an asset file) tells the app to offer Google.
    const configs = readdirSync(app.synth().directory, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('config.json'))
      .map((f) => readFileSync(join(app.synth().directory, f), 'utf8'));
    expect(configs.some((c) => c.includes('"providers":["Google"]'))).toBe(true);
  });

  it('passes the AWS Solutions checks with Google sign-in', () => {
    const { app } = synth(true, {
      google: { clientId: '1-a.apps.googleusercontent.com', clientSecretName: 'x/y' },
    });
    expect(() => app.synth()).not.toThrow();
  });

  describe('GitHub sign-in (OIDC bridge)', () => {
    const github = {
      clientId: 'Ov23liAbCdEfGhIjKlMn',
      clientSecretName: 'pracstack/test/github-client-secret',
      signingKeyParameter: '/pracstack/test/github-oidc-signing-key',
    };
    let withGithub: ReturnType<typeof synth>;
    beforeAll(() => {
      withGithub = synth(false, { github });
    });

    it('adds GitHub as an OIDC provider pointing at the bridge, with the secret as a dynamic reference', () => {
      const t = withGithub.template;
      t.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
        ProviderName: 'GitHub',
        ProviderType: 'OIDC',
        ProviderDetails: Match.objectLike({
          client_id: github.clientId,
          authorize_scopes: 'openid email profile',
          attributes_request_method: 'GET',
        }),
        AttributeMapping: Match.objectLike({
          email: 'email',
          email_verified: 'email_verified',
          preferred_username: 'preferred_username',
        }),
      });
      const details = JSON.stringify(
        Object.values(t.findResources('AWS::Cognito::UserPoolIdentityProvider')).map(
          (r) => (r as Json).Properties.ProviderDetails,
        ),
      );
      expect(details).toContain('{{resolve:secretsmanager:pracstack/test/github-client-secret');
      expect(details).toContain('/oidc/github/authorize');
      expect(details).toContain('/oidc/github/jwks.json');
      // The client lists GitHub by a reference to the provider's name.
      const providers = JSON.stringify(
        Object.values(t.findResources('AWS::Cognito::UserPoolClient')).map(
          (r) => (r as Json).Properties.SupportedIdentityProviders,
        ),
      );
      expect(providers).toContain('COGNITO');
      expect(providers).toContain('GitHubSignIn');
    });

    it('runs the bridge in its own function that can read only its signing key', () => {
      const t = withGithub.template;
      const fns = Object.values(t.findResources('AWS::Lambda::Function')).filter((r) =>
        JSON.stringify((r as Json).Properties.Environment ?? {}).includes('SIGNING_KEY_PARAMETER'),
      ) as Json[];
      expect(fns).toHaveLength(1);
      const env = fns[0]!.Properties.Environment.Variables;
      expect(env.SIGNING_KEY_PARAMETER).toBe(github.signingKeyParameter);
      expect(JSON.stringify(env.OIDC_REDIRECT_URIS)).toContain('/oauth2/idpresponse');
      // Not the API's role, and no table access.
      const roleId = fns[0]!.Properties.Role['Fn::GetAtt'][0];
      const policies = Object.values(t.findResources('AWS::IAM::Policy')).filter((p) =>
        JSON.stringify((p as Json).Properties.Roles).includes(roleId),
      );
      const statements = JSON.stringify(policies.map((p) => (p as Json).Properties.PolicyDocument));
      expect(statements).toContain('ssm:GetParameter');
      expect(statements).toContain('parameter/pracstack/test/github-oidc-signing-key');
      expect(statements).toContain('kms:ViaService');
      expect(statements).not.toContain('dynamodb:');
    });

    it('routes /oidc/github/* to the bridge without an authorizer', () => {
      const t = withGithub.template;
      t.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'GET /oidc/github/{proxy+}',
        AuthorizationType: 'NONE',
      });
      t.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /oidc/github/{proxy+}',
        AuthorizationType: 'NONE',
      });
    });

    it('shows the GitHub mark on the sign-in page button, in light and dark mode', () => {
      const branding = Object.values(
        withGithub.template.findResources('AWS::Cognito::ManagedLoginBranding'),
      )[0] as Json;
      const icons = (branding.Properties.Assets as Json[]).filter(
        (a) => a.Category === 'IDP_BUTTON_ICON',
      );
      expect(icons.map((a) => [a.ResourceId, a.ColorMode, a.Extension])).toEqual([
        ['GitHub', 'LIGHT', 'SVG'],
        ['GitHub', 'DARK', 'SVG'],
      ]);
      const svg = (a: Json) => Buffer.from(a.Bytes as string, 'base64').toString('utf8');
      expect(svg(icons[0]!)).toContain('fill="#181717"');
      expect(svg(icons[1]!)).toContain('fill="#ffffff"');
    });

    it('tells the app to offer GitHub', () => {
      const dir = withGithub.app.synth().directory;
      const configs = readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('config.json'))
        .map((f) => readFileSync(join(dir, f), 'utf8'));
      expect(configs.some((c) => c.includes('"providers":["GitHub"]'))).toBe(true);
    });

    it('passes the AWS Solutions checks with GitHub sign-in', () => {
      const { app } = synth(true, { github });
      expect(() => app.synth()).not.toThrow();
    });
  });

  describe('custom domain', () => {
    const CERT =
      'arn:aws:acm:us-east-1:111111111111:certificate/11111111-2222-3333-4444-555555555555';
    const customDomain = {
      domainName: 'pracstack.com',
      redirectNames: ['www.pracstack.com'],
      certificateArn: CERT,
    };
    const github = {
      clientId: 'Ov23liAbCdEfGhIjKlMn',
      clientSecretName: 'pracstack/test/github-client-secret',
      signingKeyParameter: '/pracstack/test/github-oidc-signing-key',
    };
    let site: ReturnType<typeof synth>;
    let withAuth: ReturnType<typeof synth>;
    beforeAll(() => {
      site = synth(false, { customDomain });
      withAuth = synth(false, {
        customDomain: { ...customDomain, authDomainName: 'auth.pracstack.com' },
        github,
      });
    });

    it('serves the domain and www with the us-east-1 certificate and a TLS 1.2 minimum', () => {
      site.template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Aliases: ['pracstack.com', 'www.pracstack.com'],
          ViewerCertificate: Match.objectLike({
            AcmCertificateArn: CERT,
            MinimumProtocolVersion: 'TLSv1.2_2021',
            SslSupportMethod: 'sni-only',
          }),
        }),
      });
      site.template.hasOutput('SiteUrl', { Value: 'https://pracstack.com' });
      site.template.hasOutput('SiteDnsTarget', {});
    });

    it('sends sign-in back to the canonical domain', () => {
      site.template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        CallbackURLs: ['https://pracstack.com/auth/callback'],
        LogoutURLs: ['https://pracstack.com/'],
      });
    });

    it('redirects other names (www) to the canonical domain, keeping path and query', () => {
      const handler = new Function(`${spaRewriteSource('pracstack.com')}; return handler;`)() as (
        e: unknown,
      ) => {
        statusCode?: number;
        headers?: { location: { value: string } };
        uri?: string;
      };
      const request = (host: string, uri: string, querystring = {}) => ({
        request: { uri, headers: { host: { value: host } }, querystring },
      });
      expect(
        handler(
          request('www.pracstack.com', '/skills/csharp', { a: { value: '1' }, b: { value: '' } }),
        ),
      ).toEqual({
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: { location: { value: 'https://pracstack.com/skills/csharp?a=1&b' } },
      });
      expect(handler(request('pracstack.com', '/skills')).uri).toBe('/index.html');
      expect(handler(request('pracstack.com', '/main-ABCDEFGH.js')).uri).toBe('/main-ABCDEFGH.js');
      expect(() => spaRewriteSource("evil.com'; alert(1)//")).toThrow();
    });

    it('adds sign-in at auth.<domain> when asked, and accepts both Cognito redirect URIs for GitHub', () => {
      const t = withAuth.template;
      t.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: 'auth.pracstack.com',
        CustomDomainConfig: { CertificateArn: CERT },
        ManagedLoginVersion: 2,
      });
      t.hasOutput('SignInDomain', { Value: 'https://auth.pracstack.com' });
      t.hasOutput('AuthDnsTarget', {});
      const bridge = Object.values(t.findResources('AWS::Lambda::Function')).find((r) =>
        JSON.stringify((r as Json).Properties.Environment ?? {}).includes('OIDC_REDIRECT_URIS'),
      ) as Json;
      const uris = JSON.stringify(bridge.Properties.Environment.Variables.OIDC_REDIRECT_URIS);
      expect(uris).toContain('auth.pracstack.com/oauth2/idpresponse');
      expect(uris).toContain('.amazoncognito.com/oauth2/idpresponse');
      // The app's config and CSP use the new sign-in domain.
      const dir = withAuth.app.synth().directory;
      const configs = readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('config.json'))
        .map((f) => readFileSync(join(dir, f), 'utf8'));
      expect(configs.some((c) => c.includes('"domain":"https://auth.pracstack.com"'))).toBe(true);
      const csp = JSON.stringify(t.findResources('AWS::CloudFront::ResponseHeadersPolicy'));
      expect(csp).toContain('https://auth.pracstack.com');
    });

    it('passes the AWS Solutions checks, without the TLS acknowledgment', () => {
      const { app } = synth(true, {
        customDomain: { ...customDomain, authDomainName: 'auth.pracstack.com' },
      });
      expect(() => app.synth()).not.toThrow();
    });
  });

  it('creates the certificate in us-east-1 for the domain, www and auth', () => {
    const app = new App();
    const stack = new CertificateStack(app, 'PracStack-test-certificate', {
      env: { account: ACCOUNT, region: 'us-east-1' },
      domainName: 'pracstack.com',
      alternateNames: ['www.pracstack.com', 'auth.pracstack.com'],
    });
    Template.fromStack(stack).hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'pracstack.com',
      SubjectAlternativeNames: ['www.pracstack.com', 'auth.pracstack.com'],
      ValidationMethod: 'DNS',
    });
  });

  it('outputs what the manual kill switch and smoke tests need', () => {
    for (const name of [
      'SiteUrl',
      'SignInDomain',
      'UserPoolId',
      'UserPoolClientId',
      'DistributionId',
      'ApiFunctionRoleName',
      'StopRunnersPolicyArn',
    ])
      template.hasOutput(name, {});
  });
});
