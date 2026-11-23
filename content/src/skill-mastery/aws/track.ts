import type { TrackSource } from '@pracstack/content-model';
import { apiDataFamilies } from './api-data';
import { iacDeliveryFamilies } from './iac-delivery';
import { iamSecurityFamilies } from './iam-security';
import { lambdaFamilies } from './lambda-serverless';
import { messagingFamilies } from './messaging-events';

/**
 * AWS for developers. Questions are scenario reasoning over realistic artifacts
 * (IAM policies, SAM and workflow YAML, CDK and handler code, CloudWatch logs,
 * error messages, HTTP exchanges); nothing runs against AWS, so every answer key
 * is reviewed by hand rather than machine-checked.
 */
export const awsTrack: TrackSource = {
  id: 'aws',
  name: 'AWS for developers',
  description:
    'Scenario-based questions on building and shipping applications on AWS: IAM and secrets, Lambda, API Gateway, DynamoDB and S3, SQS, SNS, EventBridge and Step Functions, and delivery with CloudFormation, the AWS CDK and GitHub Actions. You reason over policies, templates, code, logs and error messages; no AWS account is needed.',
  topics: [
    {
      id: 'aws-security-identity',
      name: 'Security and identity',
      description:
        'Who can call what, where credentials come from, where secrets live, and how to read an AccessDenied.',
      skills: [
        {
          id: 'aws-iam-security',
          name: 'IAM, credentials and secrets',
          description:
            'Users, roles and IAM Identity Center, policy evaluation and permissions boundaries, least privilege, roles for Lambda and ECS, STS and GitHub Actions OIDC, Secrets Manager and Parameter Store, KMS basics and debugging AccessDenied errors.',
          questions: iamSecurityFamilies,
        },
      ],
    },
    {
      id: 'aws-serverless-apis-data',
      name: 'Serverless APIs and data',
      description: 'Lambda functions, the APIs in front of them and the data stores behind them.',
      skills: [
        {
          id: 'aws-lambda-serverless',
          prerequisites: ['aws-iam-security'],
          name: 'AWS Lambda',
          description:
            'The handler model and cold starts, timeouts and memory, concurrency, event sources and their retry and batch behaviour, idempotency, configuration and secrets, Lambda in a VPC and observability.',
          questions: lambdaFamilies,
        },
        {
          id: 'aws-api-data',
          prerequisites: ['aws-lambda-serverless'],
          name: 'API Gateway, DynamoDB and S3',
          description:
            'HTTP versus REST APIs, authorizers, throttling and CORS; DynamoDB key design from access patterns, Query versus Scan, secondary indexes, conditional writes, hot partitions and TTL; private S3 buckets, presigned URLs and Block Public Access.',
          questions: apiDataFamilies,
        },
      ],
    },
    {
      id: 'aws-events-delivery',
      name: 'Events and delivery',
      description:
        'Reliable messaging between services, and getting infrastructure and code to production safely.',
      skills: [
        {
          id: 'aws-messaging-events',
          prerequisites: ['aws-lambda-serverless'],
          name: 'Messaging and events',
          description:
            'SQS standard and FIFO queues, visibility timeouts and dead-letter queues, SNS fan-out, EventBridge event patterns, idempotent consumers, and Step Functions orchestration versus choreography.',
          questions: messagingFamilies,
        },
        {
          id: 'aws-iac-delivery',
          prerequisites: ['aws-iam-security'],
          name: 'Infrastructure as code and delivery',
          description:
            'CloudFormation change sets, drift and rollback, the AWS CDK v2 workflow, logical ids and replacement, removal policies, GitHub Actions deployments with OIDC, canary releases with Lambda aliases, and cost guardrails.',
          questions: iacDeliveryFamilies,
        },
      ],
    },
  ],
};
