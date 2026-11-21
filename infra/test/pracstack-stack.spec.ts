import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App, Validations } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { appContentSecurityPolicy, workerContentSecurityPolicy } from '@pracstack/web-security';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  API_THROTTLE,
  PracStackStack,
  SPA_REWRITE_SOURCE,
  webConfig,
} from '../lib/pracstack-stack';
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
  };
}

function synth(withNag = false) {
  const app = new App();
  const stack = new PracStackStack(app, 'PracStack-test', {
    env: { account: ACCOUNT, region: REGION },
    stage: 'test',
    alertEmail: 'alerts@example.com',
    monthlyBudgetUsd: 10,
    retainData: false,
    assets: fakeAssets(),
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
}
const resources = (): Record<string, Resource> =>
  template.toJSON()['Resources'] as Record<string, Resource>;
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
      'Custom::CDKBucketDeployment',
      'Custom::S3AutoDeleteObjects',
    ]);
    expect([...types].filter((t) => !allowed.has(t))).toEqual([]);
  });

  it('uses on-demand DynamoDB, the free Cognito plan, and bounded log retention', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      BillingMode: 'PAY_PER_REQUEST',
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'LITE',
      MfaConfiguration: 'OPTIONAL',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    });
    for (const group of resourcesOf('AWS::Logs::LogGroup'))
      expect(group.Properties.RetentionInDays).toBe(14);
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

  it('gives the API function only its table and its logs; no runners, no wildcards', () => {
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
    expect(actions.every((a) => a.startsWith('dynamodb:') || a.startsWith('logs:'))).toBe(true);
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
});

describe('web hosting', () => {
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
