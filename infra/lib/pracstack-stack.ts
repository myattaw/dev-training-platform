import { createHash } from 'node:crypto';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
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

export interface PracStackAssets {
  /** Content-hashed web files: cached for a year. */
  readonly webImmutable: string;
  /** index.html, content/, etc.: revalidated on every load. */
  readonly webRevalidate: string;
  /** The bundled API function (services/api/dist/lambda). */
  readonly lambda: string;
  /** Docker build contexts of the runner functions (services/runners/dist/*). */
  readonly runners: Readonly<Record<RunnerName, string>>;
}

export type RunnerName = 'typescript' | 'java' | 'sql';

/** Memory (MB) and timeout (s) per runner function. Timeouts include a cold start. */
export const RUNNER_SIZES: Readonly<Record<RunnerName, { memoryMb: number; timeoutS: number }>> = {
  typescript: { memoryMb: 1024, timeoutS: 20 },
  java: { memoryMb: 1024, timeoutS: 25 },
  sql: { memoryMb: 1536, timeoutS: 10 },
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
      featurePlan: cognito.FeaturePlan.LITE,
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
    const domainPrefix = `pracstack-${props.stage}-${stableSuffix(this.account, this.region)}`;
    const domain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix },
      managedLoginVersion: cognito.ManagedLoginVersion.CLASSIC_HOSTED_UI,
    });
    const cognitoOrigin = `https://${domainPrefix}.auth.${this.region}.amazoncognito.com`;

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
      code: cloudfront.FunctionCode.fromInline(SPA_REWRITE_SOURCE),
    });

    const appHeaders = this.securityHeaders(
      'AppHeaders',
      appContentSecurityPolicy({ connectOrigins: [cognitoOrigin], https: true }),
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
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
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
    const siteUrl = `https://${distribution.distributionDomainName}`;

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
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
    });
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;

    // ---------------------------------------------------------------- runners (learner code + SQL)
    // An isolated VPC: no internet gateway, no NAT, no endpoints, no routes out.
    const runnerVpc = new ec2.Vpc(this, 'RunnerVpc', {
      natGateways: 0,
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
    for (const name of ['typescript', 'java', 'sql'] as const) {
      const id = `${name[0]?.toUpperCase()}${name.slice(1)}Runner`;
      const runnerLogs = new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      // Logs, plus the network-interface permissions Lambda needs to attach to the VPC.
      // The runner never uses these: its entrypoint removes the credentials (see services/runners).
      const role = new iam.Role(this, `${id}Role`, {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description: `PracStack ${name} runner: no access to any AWS data.`,
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaVPCAccessExecutionRole',
          ),
        ],
      });
      runnerLogs.grantWrite(role);
      runners[name] = new lambda.DockerImageFunction(this, id, {
        description: `PracStack ${name} runner: executes learner ${name === 'sql' ? 'SQL' : 'code'} in isolation. No network, no permissions.`,
        code: lambda.DockerImageCode.fromImageAsset(props.assets.runners[name], {
          platform: Platform.LINUX_AMD64,
        }),
        architecture: lambda.Architecture.X86_64,
        memorySize: RUNNER_SIZES[name].memoryMb,
        timeout: Duration.seconds(RUNNER_SIZES[name].timeoutS),
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
        RUNNER_SQL_FUNCTION: runners.sql.functionName,
      },
    });
    // The API may invoke the three runners, and nothing else.
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
        s3deploy.Source.jsonData('config.json', webConfig(cognitoOrigin, client.userPoolClientId)),
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
        '/monaco.css',
      ],
    });
    // New pages must never reference files that are not uploaded yet.
    revalidated.node.addDependency(hashed);
    void domain;

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
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'TableName', { value: table.tableName });
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
  }): void {
    const ack = (scope: Construct, findings: Record<string, string>) => {
      for (const [id, reason] of Object.entries(findings))
        Validations.of(scope).acknowledge({ id: `AwsSolutions::AwsSolutions-${id}`, reason });
    };
    ack(r.distribution, {
      CFR1: 'A learning platform open to everyone: no geographic restriction is wanted.',
      CFR2: 'AWS WAF (about $8–10/month) was declined for now (Phase 9). API Gateway throttling, per-user and global rate limits, and the budget kill switch apply.',
      CFR4: 'The default *.cloudfront.net certificate cannot enforce TLS 1.2; a custom domain with a TLS 1.2 policy was deferred until there is a domain (Phase 9).',
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
      COG8: 'The Plus plan (threat protection) is paid per active user; the free Lite plan is used.',
    });
    ack(r.apiFunction, {
      L1: 'Node.js 22 (supported by Lambda until 2027) is the version the API bundle is built for and tested on.',
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
export function webConfig(cognitoOrigin: string, clientId: string) {
  return { auth: { mode: 'cognito', domain: cognitoOrigin, clientId } } as const;
}

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
export const SPA_REWRITE_SOURCE = `function handler(event) {
  var request = event.request;
  var last = request.uri.split('/').pop();
  if (last.indexOf('.') === -1) request.uri = '/index.html';
  return request;
}`;
