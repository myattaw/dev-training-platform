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
  webConfig,
} from '../lib/pracstack-stack';
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
    runners: {
      typescript: dir('runner-typescript', 'Dockerfile'),
      java: dir('runner-java', 'Dockerfile'),
      csharp: dir('runner-csharp', 'Dockerfile'),
      sql: dir('runner-sql', 'Dockerfile'),
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
      auth: {
        mode: 'cognito',
        domain: 'https://x.auth.us-east-2.amazoncognito.com',
        clientId: 'client',
        providers: ['Google'],
      },
    });
    expect(webConfig('https://x.auth.us-east-2.amazoncognito.com', 'client')).toEqual({
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
    return (email: string, triggerSource = 'PreSignUp_SignUp') =>
      handler({ triggerSource, request: { userAttributes: { email } } });
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

  it('rejects malformed allowlist entries instead of silently ignoring them', () => {
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
