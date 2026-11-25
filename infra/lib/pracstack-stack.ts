import { createHash } from 'node:crypto';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
  Token,
  Validations,
  aws_budgets as budgets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_cognito as cognito,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_ec2 as ec2,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cwActions,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
} from 'aws-cdk-lib';
import {
  HttpApi,
  HttpMethod,
  HttpStage,
  LogGroupLogDestination,
} from 'aws-cdk-lib/aws-apigatewayv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import type { Construct } from 'constructs';
import {
  appContentSecurityPolicy,
  WORKER_PATH_PATTERN,
  workerContentSecurityPolicy,
} from '@pracstack/web-security';
import { addManagedLoginBranding } from './managed-login-branding';

export interface PracStackAssets {
  /** Content-hashed web files: cached for a year. */
  readonly webImmutable: string;
  /** index.html, content/, etc.: revalidated on every load. */
  readonly webRevalidate: string;
  /** The bundled API function (services/api/dist/lambda). */
  readonly lambda: string;
  /** The GitHub sign-in bridge bundle (services/api/dist/github-oidc). */
  readonly githubOidc?: string;
  /** Docker build contexts of the runner functions (services/runners/dist/*). */
  readonly runners: Readonly<Record<RunnerName, string>>;
}

export type RunnerName = 'typescript' | 'java' | 'csharp' | 'sql';

/** Coding-challenge languages with a runner function in the stack (see services/runners). */
export const CODE_RUNNER_LANGUAGES = ['typescript', 'java', 'csharp'] as const;

/**
 * Construct id prefixes. Existing ids never change (renaming would replace the
 * functions); `Csharp` keeps the same pattern.
 */
const RUNNER_IDS: Readonly<Record<RunnerName, string>> = {
  typescript: 'Typescript',
  java: 'Java',
  csharp: 'Csharp',
  sql: 'Sql',
};

/** Memory (MB) and timeout (s) per runner function. Timeouts include a cold start. */
export const RUNNER_SIZES: Readonly<Record<RunnerName, { memoryMb: number; timeoutS: number }>> = {
  typescript: { memoryMb: 1024, timeoutS: 20 },
  java: { memoryMb: 1024, timeoutS: 25 },
  // 1769 MB is one full vCPU: Roslyn compiles faster, and ASP.NET Core exercises
  // start one small app per test. Billed per use like the others.
  csharp: { memoryMb: 1769, timeoutS: 25 },
  // 20 s: a cold start (container + PGlite) took ~10 s on AWS. Each query is still capped at 3 s.
  sql: { memoryMb: 1536, timeoutS: 20 },
};

export interface PracStackProps extends StackProps {
  /** e.g. `dev`. Part of resource names; lets several copies coexist. */
  readonly stage: string;
  readonly assets: PracStackAssets;
  /** Receives AWS Budgets alerts. */
  readonly alertEmail: string;
  /** Monthly cost budget for the whole AWS account, in USD. */
  readonly monthlyBudgetUsd: number;
  /**
   * Keep the user pool and table when the stack is deleted (production).
   * When false (default for dev), `cdk destroy` removes everything, including data.
   */
  readonly retainData: boolean;
  /**
   * Private beta: only these may create an account. Entries are full email
   * addresses (`ada@example.com`) or whole domains (`@example.com`). Empty or
   * absent: anyone can sign up. Enforced by a Cognito pre-sign-up trigger;
   * accounts created by an administrator (`admin-create-user`) are always allowed.
   */
  readonly signUpAllowlist?: readonly string[];
  /**
   * Reserved concurrency for EACH runner function: at most this many runs of
   * that language at once, and never more than this taken from the API's share.
   * Absent: no reservation (required while the account's Lambda concurrency
   * quota is the new-account 10, because AWS keeps 10 unreserved at all times).
   */
  readonly runnerConcurrency?: number;
  /**
   * "Continue with Google". The client ID is public; the client secret is read at
   * deploy time from AWS Secrets Manager (plain-text secret named `clientSecretName`)
   * and never appears in the repository or the template. Absent: email sign-in only.
   */
  readonly google?: { readonly clientId: string; readonly clientSecretName: string };
  /**
   * "Continue with GitHub", through a small OIDC bridge (services/api/src/github-oidc).
   * The GitHub OAuth App's secret is read at deploy time from Secrets Manager
   * (`clientSecretName`) and stored only in Cognito, which sends it to the bridge's
   * token endpoint; the bridge signs ID tokens with the RSA key in the SSM
   * SecureString parameter `signingKeyParameter`.
   */
  readonly github?: {
    readonly clientId: string;
    readonly clientSecretName: string;
    readonly signingKeyParameter: string;
  };
  /**
   * The stage's own domain instead of *.cloudfront.net (see infra/lib/certificate-stack.ts).
   * DNS is hosted elsewhere (Cloudflare): the stack outputs the targets for the records.
   */
  readonly customDomain?: CustomDomain;
}

export interface CustomDomain {
  /** The canonical site name, e.g. `pracstack.com`. */
  readonly domainName: string;
  /** Names that redirect (301) to the canonical one, e.g. `www.pracstack.com`. */
  readonly redirectNames: readonly string[];
  /** ACM certificate in us-east-1 covering every name above (and `authDomainName`). */
  readonly certificateArn: string;
  /**
   * Sign-in pages on this name (e.g. `auth.pracstack.com`) instead of the Cognito
   * address. Cognito requires the parent domain to resolve before it can be created,
   * so add it once the site's DNS records exist.
   */
  readonly authDomainName?: string;
}

/** Overall request rate for the API (all users together). A cost ceiling, not a per-user limit. */
export const API_THROTTLE = { rateLimit: 10, burstLimit: 20 } as const;

/**
 * PracStack on AWS, one stack:
 *
 *   CloudFront ─┬─ /*        → S3 (private; Origin Access Control)
 *               └─ /api/*    → API Gateway HTTP API ─ JWT authorizer (Cognito) → Lambda → DynamoDB
 *   Cognito user pool + managed login (sign-in)
 *   AWS Budgets alert
 *
 * Serverless and pay-per-request throughout: no NAT gateways, load
 * balancers, databases or anything else that costs money while idle.
 * Learner code and SQL are NOT run here (Phase 7); those API routes return 503.
 */
export class PracStackStack extends Stack {
  constructor(scope: Construct, id: string, props: PracStackProps) {
    super(scope, id, props);
    const removalPolicy = props.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    // ---------------------------------------------------------------- data
    const table = new dynamodb.TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: props.retainData,
      removalPolicy,
    });

    // ---------------------------------------------------------------- web hosting
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Only web build output lives here; it is recreated by every deployment.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------------------------------------------------------------- sign-in
    const userPool = new cognito.UserPool(this, 'UserPool', {
      // Essentials (first 10,000 MAU free): the lowest plan with managed login branding.
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      // Authenticator apps only: SMS costs money per message.
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: props.retainData,
      removalPolicy,
    });
    // Members of this group get the ADMIN plan (services/api/src/account/entitlements.ts).
    // Cognito puts group names in the ID token's `cognito:groups` claim; add users with
    // `aws cognito-idp admin-add-user-to-group`. Groups are free.
    new cognito.CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admins',
      description: 'PracStack administrators (ADMIN plan).',
    });
    const signUpGate = this.signUpAllowlistTrigger(userPool, props.signUpAllowlist ?? []);
    const domainPrefix = `pracstack-${props.stage}-${stableSuffix(this.account, this.region)}`;
    const domain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    const prefixOrigin = `https://${domainPrefix}.auth.${this.region}.amazoncognito.com`;
    const custom = props.customDomain;
    const certificate = custom
      ? acm.Certificate.fromCertificateArn(this, 'SiteCertificate', custom.certificateArn)
      : undefined;
    // Sign-in on the stage's own domain (the Cognito address keeps working too).
    const authDomain =
      custom?.authDomainName && certificate
        ? userPool.addDomain('CustomDomain', {
            customDomain: { domainName: custom.authDomainName, certificate },
            managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
          })
        : undefined;
    const cognitoOrigin = authDomain ? `https://${custom?.authDomainName}` : prefixOrigin;
    /** Cognito's redirect URIs for external providers, on every sign-in domain. */
    const idpResponseUris = [
      `${prefixOrigin}/oauth2/idpresponse`,
      ...(authDomain ? [`${cognitoOrigin}/oauth2/idpresponse`] : []),
    ];

    // ---------------------------------------------------------------- API function
    const functionLogs = new logs.LogGroup(this, 'ApiFunctionLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // A role with exactly what the function needs (no broad managed policies).
    const functionRole = new iam.Role(this, 'ApiFunctionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'PracStack API function: its log group and its DynamoDB table only.',
    });
    functionLogs.grantWrite(functionRole);
    table.grantReadWriteData(functionRole);

    // ---------------------------------------------------------------- distribution
    // The API origin and the user-pool client are created below; the
    // distribution only needs the API's ID, so there is no dependency cycle.
    const httpApi = new HttpApi(this, 'HttpApi', {
      description: 'PracStack API (reached through CloudFront at /api/*).',
      createDefaultStage: false,
    });

    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Serve index.html for client-side routes (paths without a file extension).',
      code: cloudfront.FunctionCode.fromInline(spaRewriteSource(custom?.domainName)),
    });

    const appHeaders = this.securityHeaders(
      'AppHeaders',
      appContentSecurityPolicy({
        connectOrigins: [...new Set([cognitoOrigin, prefixOrigin])],
        https: true,
      }),
    );
    const workerHeaders = this.securityHeaders('WorkerHeaders', workerContentSecurityPolicy());

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(webBucket);
    const apiOrigin = new origins.HttpOrigin(
      `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`,
      { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY },
    );
    // CloudFront forwards Authorization only if it is part of the cache key.
    // TTLs are zero (and the API sends no-store), so nothing is actually cached.
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'ApiCachePolicy', {
      comment: 'PracStack API: never cached; forwards Authorization and query strings.',
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(1),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
    });

    // CloudFront access logs (standard logging needs object ACLs on its bucket).
    // Kept 30 days. They contain IP addresses and paths, never request bodies or tokens.
    const accessLogs = new s3.Bucket(this, 'AccessLogBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      lifecycleRules: [{ expiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `PracStack ${props.stage}`,
      enableLogging: true,
      logBucket: accessLogs,
      logFilePrefix: 'cloudfront/',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      ...(custom && certificate
        ? {
            domainNames: [custom.domainName, ...custom.redirectNames],
            certificate,
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
          }
        : {}),
      // HTTP/2 only. With HTTP/3 offered, Chromium on a network that half-breaks QUIC
      // never finished loading the app's scripts (0.24 s with HTTP/3 off, no load in 20 s on).
      httpVersion: cloudfront.HttpVersion.HTTP2,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: appHeaders,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        [WORKER_PATH_PATTERN]: {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: workerHeaders,
        },
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: appHeaders,
        },
      },
    });
    const siteUrl = custom
      ? `https://${custom.domainName}`
      : `https://${distribution.distributionDomainName}`;

    // Optional social sign-in. Google accounts become their own Cognito users (not merged
    // with an email account by address; the Account page links identities with proof from
    // both). The sign-up allowlist trigger applies to them too.
    const google = props.google
      ? new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleSignIn', {
          userPool,
          clientId: props.google.clientId,
          clientSecretValue: SecretValue.secretsManager(props.google.clientSecretName),
          scopes: ['openid', 'email', 'profile'],
          attributeMapping: {
            email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            emailVerified: cognito.ProviderAttribute.GOOGLE_EMAIL_VERIFIED,
            fullname: cognito.ProviderAttribute.GOOGLE_NAME,
          },
        })
      : undefined;

    // GitHub through the OIDC bridge: a function of its own (internet access to
    // GitHub, nothing else), routed at /oidc/github/* without an authorizer.
    const githubBridgeIssuer = `https://${httpApi.apiId}.execute-api.${this.region}.amazonaws.com/oidc/github`;
    const github = props.github
      ? this.githubSignIn(
          userPool,
          httpApi,
          idpResponseUris,
          githubBridgeIssuer,
          props.github,
          props.assets,
        )
      : undefined;
    const signInProviders = [...(google ? ['Google'] : []), ...(github ? ['GitHub'] : [])];

    const client = userPool.addClient('WebClient', {
      // A browser app: public client, PKCE, no secret.
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${siteUrl}/auth/callback`],
        logoutUrls: [`${siteUrl}/`],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        ...(google ? [cognito.UserPoolClientIdentityProvider.GOOGLE] : []),
        ...(github ? [cognito.UserPoolClientIdentityProvider.custom(github.providerName)] : []),
      ],
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
    });
    if (google) client.node.addDependency(google);
    if (github) client.node.addDependency(github);
    // PracStack colors and logo on the managed login pages. The Google button comes from the
    // client's supported identity providers; the style needs nothing extra for it.
    const branding = addManagedLoginBranding(
      this,
      'WebClientBranding',
      userPool,
      client,
      github ? ['GitHub'] : [],
    );
    branding.node.addDependency(domain);
    if (authDomain) branding.node.addDependency(authDomain);
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;

    // ---------------------------------------------------------------- runners (learner code + SQL)
    // An isolated VPC: no internet gateway, no NAT, no endpoints, no routes out.
    const runnerVpc = new ec2.Vpc(this, 'RunnerVpc', {
      natGateways: 0,
      // No DNS either. AWS's resolver answers inside a VPC even without routes, so
      // learner code could leak data in lookups (e.g. <data>.attacker.example); seen by
      // verify-runners.ts on the first deployment. Runners need no DNS: they reach the
      // Lambda runtime API by IP address and nothing else.
      enableDnsSupport: false,
      enableDnsHostnames: false,
      maxAzs: 2,
      subnetConfiguration: [
        { name: 'runners', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    const flowLogs = new logs.LogGroup(this, 'RunnerVpcFlowLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // Rejected connection attempts (e.g. learner code trying to reach the network).
    runnerVpc.addFlowLog('RejectedTraffic', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogs),
      trafficType: ec2.FlowLogTrafficType.REJECT,
    });
    const runnerSecurityGroup = new ec2.SecurityGroup(this, 'RunnerSecurityGroup', {
      vpc: runnerVpc,
      description: 'PracStack runners: no inbound and no outbound traffic.',
      allowAllOutbound: false,
    });

    const runners = {} as Record<RunnerName, lambda.DockerImageFunction>;
    for (const name of [...CODE_RUNNER_LANGUAGES, 'sql'] as const) {
      const id = `${RUNNER_IDS[name]}Runner`;
      const runnerLogs = new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      // Logs, plus the network-interface permissions Lambda needs to attach to the VPC.
      // The runner never uses these: its entrypoint removes the credentials (see services/runners).
      const role = new iam.Role(this, `${id}Role`, {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description: `PracStack ${RUNNER_IDS[name]} runner: no access to any AWS data.`,
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaVPCAccessExecutionRole',
          ),
        ],
      });
      runnerLogs.grantWrite(role);
      runners[name] = new lambda.DockerImageFunction(this, id, {
        description: `PracStack ${RUNNER_IDS[name]} runner: executes learner ${name === 'sql' ? 'SQL' : 'code'} in isolation. No network, no permissions.`,
        code: lambda.DockerImageCode.fromImageAsset(props.assets.runners[name], {
          platform: Platform.LINUX_AMD64,
        }),
        architecture: lambda.Architecture.X86_64,
        memorySize: RUNNER_SIZES[name].memoryMb,
        timeout: Duration.seconds(RUNNER_SIZES[name].timeoutS),
        ...(props.runnerConcurrency !== undefined
          ? { reservedConcurrentExecutions: props.runnerConcurrency }
          : {}),
        role,
        logGroup: runnerLogs,
        vpc: runnerVpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [runnerSecurityGroup],
      });
    }

    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      description: 'PracStack API: progress, scoring, question serving. Never runs learner code.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(props.assets.lambda),
      memorySize: 512,
      // Long enough for a Java submission with a cold runner; API Gateway's limit is 30 s.
      timeout: Duration.seconds(29),
      role: functionRole,
      logGroup: functionLogs,
      environment: {
        TABLE_NAME: table.tableName,
        JWT_ISSUER: issuer,
        JWT_AUDIENCE: client.userPoolClientId,
        NODE_OPTIONS: '--enable-source-maps',
        RUNNER_TYPESCRIPT_FUNCTION: runners.typescript.functionName,
        RUNNER_JAVA_FUNCTION: runners.java.functionName,
        RUNNER_CSHARP_FUNCTION: runners.csharp.functionName,
        RUNNER_SQL_FUNCTION: runners.sql.functionName,
      },
    });
    // The API may invoke the runners, and nothing else.
    functionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: Object.values(runners).map((runner) => runner.functionArn),
      }),
    );

    const apiAccessLogs = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new HttpStage(this, 'ApiStage', {
      httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: API_THROTTLE,
      accessLogSettings: {
        destination: new LogGroupLogDestination(apiAccessLogs),
        // No query strings, headers or bodies: nothing personal or secret.
        format: AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            time: '$context.requestTime',
            method: '$context.httpMethod',
            route: '$context.routeKey',
            status: '$context.status',
            latencyMs: '$context.responseLatency',
            user: '$context.authorizer.claims.sub',
            authError: '$context.authorizer.error',
          }),
        ),
      },
    });
    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFunction),
      // API Gateway verifies the ID token's signature, expiry, issuer and audience.
      authorizer: new HttpJwtAuthorizer('CognitoAuthorizer', issuer, {
        jwtAudience: [client.userPoolClientId],
      }),
    });

    // ---------------------------------------------------------------- deploy the web app
    const hashed = new s3deploy.BucketDeployment(this, 'DeployWebAssets', {
      sources: [s3deploy.Source.asset(props.assets.webImmutable)],
      destinationBucket: webBucket,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      // Old hashed files stay, so pages loaded before a deploy keep working.
      prune: false,
      memoryLimit: 512,
    });
    const revalidated = new s3deploy.BucketDeployment(this, 'DeployWebPages', {
      sources: [
        s3deploy.Source.asset(props.assets.webRevalidate),
        // Public settings only (see apps/web/src/app/core/config/runtime-config.ts).
        s3deploy.Source.jsonData(
          'config.json',
          webConfig(cognitoOrigin, client.userPoolClientId, signInProviders, CODE_RUNNER_LANGUAGES),
        ),
      ],
      destinationBucket: webBucket,
      cacheControl: [s3deploy.CacheControl.fromString('no-cache')],
      prune: false,
      memoryLimit: 512,
      distribution,
      distributionPaths: [
        '/index.html',
        '/config.json',
        '/content/*',
        '/favicon.ico',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/monaco.css',
      ],
    });
    // New pages must never reference files that are not uploaded yet.
    revalidated.node.addDependency(hashed);

    // ---------------------------------------------------------------- cost guardrail
    const budget = new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `pracstack-${props.stage}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        { type: 'ACTUAL', threshold: 50 },
        { type: 'ACTUAL', threshold: 100 },
        { type: 'FORECASTED', threshold: 100 },
      ].map(({ type, threshold }) => ({
        notification: {
          notificationType: type,
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
      })),
    });

    // Kill switch: when actual spend passes the budget, AWS Budgets attaches this
    // policy to the API function's role. Learner code and SQL then stop running
    // ("busy"); browsing, sign-in and progress keep working. Undo: docs/aws.md.
    const stopRunners = new iam.ManagedPolicy(this, 'StopRunnersPolicy', {
      description:
        'Attached automatically by the PracStack budget action: stops all runner invocations.',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: ['lambda:InvokeFunction'],
          resources: Object.values(runners).map((runner) => runner.functionArn),
        }),
      ],
    });
    const budgetActionRole = new iam.Role(this, 'BudgetActionRole', {
      assumedBy: new iam.ServicePrincipal('budgets.amazonaws.com'),
      description:
        'Lets AWS Budgets attach the stop-runners policy to the API function role, and nothing else.',
    });
    budgetActionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:AttachRolePolicy', 'iam:DetachRolePolicy'],
        resources: [functionRole.roleArn],
        conditions: { ArnEquals: { 'iam:PolicyARN': stopRunners.managedPolicyArn } },
      }),
    );
    const killSwitch = new budgets.CfnBudgetsAction(this, 'StopRunnersOverBudget', {
      budgetName: budget.ref,
      notificationType: 'ACTUAL',
      actionType: 'APPLY_IAM_POLICY',
      actionThreshold: { type: 'PERCENTAGE', value: 100 },
      approvalModel: 'AUTOMATIC',
      executionRoleArn: budgetActionRole.roleArn,
      definition: {
        iamActionDefinition: {
          policyArn: stopRunners.managedPolicyArn,
          roles: [functionRole.roleName],
        },
      },
      subscribers: [{ type: 'EMAIL', address: props.alertEmail }],
    });
    killSwitch.node.addDependency(budgetActionRole);

    // ---------------------------------------------------------------- alarms
    // Emails when something is failing. Six alarms: within CloudWatch's 10 free alarms.
    // (CloudWatch cannot publish to a topic encrypted with the free AWS-managed key.)
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: `PracStack ${props.stage} alarms`,
      enforceSSL: true,
    });
    alarmTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    const alarm = (
      id: string,
      metric: cloudwatch.IMetric,
      threshold: number,
      description: string,
    ) =>
      new cloudwatch.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: description,
      }).addAlarmAction(new cwActions.SnsAction(alarmTopic));
    const fiveMinutes = { period: Duration.minutes(5), statistic: 'Sum' };

    alarm(
      'ApiErrorsAlarm',
      apiFunction.metricErrors(fiveMinutes),
      5,
      'The API function failed 5+ times in 5 minutes (unexpected errors; see its logs).',
    );
    alarm(
      'Api5xxAlarm',
      httpApi.metricServerError(fiveMinutes),
      10,
      'The API returned 10+ server errors (5xx) in 5 minutes.',
    );
    alarm(
      'LambdaThrottlesAlarm',
      new cloudwatch.Metric({ namespace: 'AWS/Lambda', metricName: 'Throttles', ...fiveMinutes }),
      1,
      'Lambda throttled requests: the account concurrency limit was reached (see docs/aws.md).',
    );
    for (const [name, runner] of Object.entries(runners)) {
      alarm(
        `${name[0]?.toUpperCase()}${name.slice(1)}RunnerErrorsAlarm`,
        runner.metricErrors(fiveMinutes),
        5,
        `The ${name} runner failed 5+ times in 5 minutes (the supervisor itself, not learner code).`,
      );
    }

    // ---------------------------------------------------------------- outputs
    new CfnOutput(this, 'SiteUrl', { value: siteUrl });
    new CfnOutput(this, 'SignInDomain', { value: cognitoOrigin });
    if (custom) {
      // DNS records to create at the DNS host ("DNS only", not proxied).
      new CfnOutput(this, 'SiteDnsTarget', {
        value: distribution.distributionDomainName,
        description: `CNAME (flattened at the apex) for ${[custom.domainName, ...custom.redirectNames].join(', ')}`,
      });
      if (authDomain)
        new CfnOutput(this, 'AuthDnsTarget', {
          value: authDomain.cloudFrontEndpoint,
          description: `CNAME for ${custom.authDomainName}`,
        });
    }
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    // The manual kill switch: attach this policy to this role to stop all runners at once.
    new CfnOutput(this, 'ApiFunctionRoleName', { value: functionRole.roleName });
    new CfnOutput(this, 'StopRunnersPolicyArn', { value: stopRunners.managedPolicyArn });
    new CfnOutput(this, 'SignUp', {
      value: signUpGate ? 'allowlist (invite-only)' : 'open to anyone',
    });
    for (const [name, runner] of Object.entries(runners))
      new CfnOutput(this, `${name[0]?.toUpperCase()}${name.slice(1)}RunnerName`, {
        value: runner.functionName,
      });

    this.acknowledgeReviewedFindings({
      distribution,
      webBucket,
      accessLogs,
      alarmTopic,
      userPool,
      apiFunction,
      runners,
      signUpGate,
      customDomain: custom !== undefined,
    });
  }

  /**
   * Private-beta sign-up gate: a Cognito pre-sign-up trigger that refuses
   * self sign-up unless the email (or its domain) is on the allowlist.
   * Returns undefined, and creates nothing, when the allowlist is empty.
   */
  private signUpAllowlistTrigger(
    userPool: cognito.UserPool,
    allowlist: readonly string[],
  ): lambda.Function | undefined {
    const entries = normalizeAllowlist(allowlist);
    if (entries.length === 0) return undefined;
    const logGroup = new logs.LogGroup(this, 'SignUpGateLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const role = new iam.Role(this, 'SignUpGateRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'PracStack sign-up allowlist trigger: its own log group only.',
    });
    logGroup.grantWrite(role);
    const fn = new lambda.Function(this, 'SignUpGate', {
      description: 'PracStack: allows self sign-up only for allowlisted emails or domains.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromInline(SIGN_UP_GATE_SOURCE),
      memorySize: 128,
      timeout: Duration.seconds(5),
      role,
      logGroup,
      environment: { ALLOWLIST: JSON.stringify(entries) },
    });
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, fn);
    return fn;
  }

  /** The GitHub OIDC bridge function and route, and GitHub as a Cognito OIDC provider. */
  private githubSignIn(
    userPool: cognito.UserPool,
    httpApi: HttpApi,
    redirectUris: readonly string[],
    issuer: string,
    github: NonNullable<PracStackProps['github']>,
    assets: PracStackAssets,
  ): cognito.UserPoolIdentityProviderOidc {
    if (!assets.githubOidc) throw new Error('GitHub sign-in needs the githubOidc asset.');
    const logGroup = new logs.LogGroup(this, 'GithubOidcLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const role = new iam.Role(this, 'GithubOidcRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'PracStack GitHub sign-in bridge: its log group and its signing key only.',
    });
    logGroup.grantWrite(role);
    const keyParameterArn = this.formatArn({
      service: 'ssm',
      resource: 'parameter',
      resourceName: github.signingKeyParameter.replace(/^\//, ''),
    });
    role.addToPolicy(
      new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [keyParameterArn] }),
    );
    // SecureString with the AWS-managed key: decrypt only through SSM.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    );
    const fn = new lambda.Function(this, 'GithubOidcFunction', {
      description: 'PracStack: GitHub sign-in as an OpenID Connect provider for Cognito.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(assets.githubOidc),
      memorySize: 256,
      timeout: Duration.seconds(15),
      role,
      logGroup,
      environment: {
        OIDC_ISSUER: issuer,
        OIDC_REDIRECT_URIS: JSON.stringify(redirectUris),
        SIGNING_KEY_PARAMETER: github.signingKeyParameter,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    const routes = httpApi.addRoutes({
      path: '/oidc/github/{proxy+}',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: new HttpLambdaIntegration('GithubOidcIntegration', fn),
    });
    const ack = (scope: Construct, id: string, reason: string) =>
      Validations.of(scope).acknowledge({ id: `AwsSolutions::AwsSolutions-${id}`, reason });
    for (const route of routes)
      ack(
        route,
        'APIG4',
        'Sign-in endpoints of an OpenID Connect provider: Cognito and the browser call them before anyone is signed in. /authorize redirects only to Cognito; /token needs the GitHub app credentials and a GitHub code.',
      );
    ack(
      fn,
      'L1',
      'Node.js 22 (supported by Lambda until 2027), the same runtime as the API function.',
    );
    ack(
      role,
      'IAM5[Resource::*]',
      'kms:Decrypt only through SSM (kms:ViaService) for the SecureString signing key, which uses the AWS-managed aws/ssm key; its ARN is not known in advance.',
    );
    return new cognito.UserPoolIdentityProviderOidc(this, 'GitHubSignIn', {
      userPool,
      name: 'GitHub',
      clientId: github.clientId,
      // A CloudFormation dynamic reference: resolved by CloudFormation, never in the template.
      clientSecret: SecretValue.secretsManager(github.clientSecretName).unsafeUnwrap(),
      issuerUrl: issuer,
      endpoints: {
        authorization: `${issuer}/authorize`,
        token: `${issuer}/token`,
        userInfo: `${issuer}/userinfo`,
        jwksUri: `${issuer}/jwks.json`,
      },
      scopes: ['openid', 'email', 'profile'],
      attributeRequestMethod: cognito.OidcAttributeRequestMethod.GET,
      attributeMapping: {
        email: cognito.ProviderAttribute.other('email'),
        emailVerified: cognito.ProviderAttribute.other('email_verified'),
        fullname: cognito.ProviderAttribute.other('name'),
        preferredUsername: cognito.ProviderAttribute.other('preferred_username'),
      },
    });
  }

  private securityHeaders(id: string, csp: string): cloudfront.ResponseHeadersPolicy {
    return new cloudfront.ResponseHeadersPolicy(this, id, {
      comment: `PracStack ${id} (see packages/web-security)`,
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(730),
          includeSubdomains: true,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
            override: true,
          },
          { header: 'Cross-Origin-Opener-Policy', value: 'same-origin', override: true },
        ],
      },
    });
  }

  /**
   * cdk-nag (AWS Solutions) findings that were reviewed and accepted, each on
   * the construct it concerns and with its reason. Anything new fails synthesis.
   */
  private acknowledgeReviewedFindings(r: {
    distribution: cloudfront.Distribution;
    webBucket: s3.Bucket;
    accessLogs: s3.Bucket;
    alarmTopic: sns.Topic;
    userPool: cognito.UserPool;
    apiFunction: lambda.Function;
    runners: Record<RunnerName, lambda.DockerImageFunction>;
    signUpGate: lambda.Function | undefined;
    customDomain: boolean;
  }): void {
    const ack = (scope: Construct, findings: Record<string, string>) => {
      for (const [id, reason] of Object.entries(findings))
        Validations.of(scope).acknowledge({ id: `AwsSolutions::AwsSolutions-${id}`, reason });
    };
    ack(r.distribution, {
      CFR1: 'A learning platform open to everyone: no geographic restriction is wanted.',
      CFR2: 'AWS WAF (about $8–10/month) was declined for now (Phase 9). API Gateway throttling, per-user and global rate limits, and the budget kill switch apply.',
    });
    if (!r.customDomain)
      ack(r.distribution, {
        CFR4: 'The default *.cloudfront.net certificate cannot enforce TLS 1.2; stages with a custom domain use a TLS 1.2 minimum.',
      });
    ack(r.accessLogs, {
      S1: 'This is the access-log bucket; logging its own access would be circular.',
    });
    ack(r.alarmTopic, {
      SNS2: 'Alarm notifications only. CloudWatch cannot publish to a topic encrypted with the free AWS-managed key, and a customer key costs $1/month.',
    });
    ack(r.webBucket, {
      S1: 'Holds only public build output, readable only through CloudFront (Origin Access Control).',
    });
    ack(r.userPool, {
      COG2: 'MFA (authenticator app) is available to every learner but not forced on a learning site.',
      COG8: 'The Plus plan (threat protection) is paid per active user; Essentials (10,000 MAU free) is used.',
    });
    ack(r.apiFunction, {
      L1: 'Node.js 22 (supported by Lambda until 2027) is the version the API bundle is built for and tested on.',
    });
    if (r.signUpGate)
      ack(r.signUpGate, {
        L1: 'Node.js 22 (supported by Lambda until 2027), the same runtime as the API function.',
      });
    for (const runner of Object.values(r.runners)) {
      if (!runner.role) continue;
      ack(runner.role, {
        'IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole]':
          'Lambda needs these network-interface permissions to attach the runner to its isolated VPC. The runner never holds them at run time: its entrypoint removes the credentials before the runtime starts, which the runner tests check.',
      });
    }
    // CDK's helper function that copies the web build into the bucket.
    for (const child of this.node.children) {
      if (!child.node.id.startsWith('Custom::CDKBucketDeployment')) continue;
      ack(child, {
        L1: 'Runtime chosen by the CDK for its BucketDeployment helper; updated with aws-cdk-lib.',
        'IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]':
          'CDK BucketDeployment helper: logging permissions only.',
        ...Object.fromEntries(
          [
            'Action::s3:GetObject*',
            'Action::s3:GetBucket*',
            'Action::s3:List*',
            'Action::s3:DeleteObject*',
            'Action::s3:Abort*',
            `Resource::<${this.getLogicalId(r.webBucket.node.defaultChild as s3.CfnBucket)}.Arn>/*`,
            `Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`,
            'Resource::*',
          ].map((finding) => [
            `IAM5[${finding}]`,
            'CDK BucketDeployment helper: reads the CDK asset bucket, writes this stack’s web bucket, and creates CloudFront invalidations (which do not support resource-level permissions).',
          ]),
        ),
      });
    }
  }
}

/**
 * The web app's /config.json (see apps/web/src/app/core/config/runtime-config.ts).
 * Public values only: it is served to every visitor.
 */
export function webConfig(
  cognitoOrigin: string,
  clientId: string,
  providers: readonly string[] = [],
  codeLanguages: readonly string[] = CODE_RUNNER_LANGUAGES,
) {
  return {
    // Languages with a runner function here; the app offers only these (Python and
    // Swift run only in local Docker until their functions are added and verified).
    codeLanguages: [...codeLanguages],
    auth: {
      mode: 'cognito',
      domain: cognitoOrigin,
      clientId,
      // Social sign-in buttons the app shows (Cognito identity provider names).
      ...(providers.length > 0 ? { providers } : {}),
    },
  } as const;
}

/**
 * Validates and normalizes sign-up allowlist entries: lower-case full emails
 * (`ada@example.com`), domains (`@example.com`) or GitHub accounts by numeric
 * user ID (`github:39500954`; IDs never change, unlike usernames, which can be
 * renamed and reclaimed by someone else). Throws on anything else, so a typo
 * cannot silently open or close sign-up.
 */
export function normalizeAllowlist(entries: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of entries) {
    const entry = raw.trim().toLowerCase();
    if (entry === '') continue;
    if (entry.startsWith('github:')) {
      if (!/^github:[1-9][0-9]{0,11}$/.test(entry))
        throw new Error(
          `Invalid sign-up allowlist entry "${raw}": use github:<numeric user ID>, not a username.`,
        );
      out.add(entry);
      continue;
    }
    if (!/^[^@\s,]*@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(entry))
      throw new Error(
        `Invalid sign-up allowlist entry "${raw}": use ada@example.com or @example.com.`,
      );
    out.add(entry);
  }
  return [...out].sort();
}

/**
 * Cognito pre-sign-up trigger (Node.js, CommonJS inline). Administrator-created
 * accounts pass; self sign-up passes only for an allowlisted email or domain.
 * The error message is shown on the sign-up page.
 */
export const SIGN_UP_GATE_SOURCE = `const allow = new Set(JSON.parse(process.env.ALLOWLIST || '[]'));
exports.handler = async (event) => {
  if (event.triggerSource === 'PreSignUp_AdminCreateUser') return event;
  // GitHub accounts by their numeric user ID: Cognito names federated users
  // <provider>_<subject>, and the bridge's subject is GitHub's permanent user ID.
  if (event.triggerSource === 'PreSignUp_ExternalProvider') {
    const github = /^GitHub_([0-9]{1,12})$/.exec(String(event.userName || ''));
    if (github && allow.has('github:' + github[1])) return event;
  }
  const email = String((event.request && event.request.userAttributes && event.request.userAttributes.email) || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at > 0 && (allow.has(email) || allow.has(email.slice(at)))) return event;
  throw new Error('PracStack is invite-only for now. Ask for an invitation.');
};`;

/** A short, stable, non-reversible suffix that makes the sign-in domain globally unique. */
function stableSuffix(account: string, region: string): string {
  if (Token.isUnresolved(account) || Token.isUnresolved(region)) {
    throw new Error(
      'The stack needs an explicit account and region (env) to name its sign-in domain.',
    );
  }
  return createHash('sha256').update(`${account}/${region}`).digest('hex').slice(0, 8);
}

/**
 * CloudFront Function (cloudfront-js-2.0): client-side routes such as
 * /challenges/pangram get index.html; real files (with an extension) pass.
 */
export const SPA_REWRITE_SOURCE = spaRewriteSource();

/**
 * With a canonical host, other names (e.g. www.) get a permanent redirect to it,
 * keeping the path and query string.
 */
export function spaRewriteSource(canonicalHost?: string): string {
  if (canonicalHost !== undefined && !/^[a-z0-9.-]+$/.test(canonicalHost))
    throw new Error(`Invalid canonical host "${canonicalHost}"`);
  const redirect = canonicalHost
    ? `
  var host = request.headers.host && request.headers.host.value;
  if (host && host !== '${canonicalHost}') {
    var qs = Object.keys(request.querystring).map(function (k) {
      var v = request.querystring[k];
      return v.value === '' ? k : k + '=' + v.value;
    }).join('&');
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://${canonicalHost}' + request.uri + (qs ? '?' + qs : '') } },
    };
  }`
    : '';
  return `function handler(event) {
  var request = event.request;${redirect}
  var last = request.uri.split('/').pop();
  if (last.indexOf('.') === -1) request.uri = '/index.html';
  return request;
}`;
}
