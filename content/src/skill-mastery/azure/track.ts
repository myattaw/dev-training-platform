import type { TrackSource } from '@pracstack/content-model';
import { functionsFamilies } from './functions';
import { identitySecurityFamilies } from './identity-security';
import { logicAppsFamilies } from './logic-apps';
import { pipelinesFamilies } from './pipelines';
import { serviceBusFamilies } from './service-bus';

/**
 * Azure for developers. Questions are scenario reasoning over realistic artifacts
 * (configuration, YAML, logs, C# shown as text); nothing runs against Azure, so
 * every answer key is reviewed by hand rather than machine-checked.
 */
export const azureTrack: TrackSource = {
  id: 'azure',
  name: 'Azure for developers',
  category: 'cloud',
  description:
    'Scenario-based questions on building and shipping applications on Azure: identity and RBAC, managed identities and Key Vault, Azure Functions, Service Bus, Logic Apps and Azure DevOps Pipelines. You reason over configuration, code, pipeline YAML and logs; no Azure account is needed.',
  topics: [
    {
      id: 'az-identity-security-topic',
      name: 'Identity and security',
      description:
        'Who can do what, where secrets live, and how to investigate when something goes wrong.',
      skills: [
        {
          id: 'az-identity-security',
          name: 'Identity, access and secrets',
          description:
            'Scopes and RBAC inheritance, Microsoft Entra ID, least privilege, managed identities, Key Vault references, DefaultAzureCredential, private endpoints and logging for incident response.',
          questions: identitySecurityFamilies,
        },
      ],
    },
    {
      id: 'az-serverless-messaging',
      name: 'Serverless and messaging',
      description: 'Event-driven code, reliable messaging and workflow integration.',
      skills: [
        {
          id: 'az-functions',
          prerequisites: ['az-identity-security'],
          name: 'Azure Functions',
          description:
            'Triggers and bindings, the isolated worker model, configuration, idempotency, retries and poison messages, hosting and cold starts, Durable Functions and monitoring.',
          questions: functionsFamilies,
        },
        {
          id: 'az-service-bus',
          prerequisites: ['az-functions'],
          name: 'Azure Service Bus',
          description:
            'Queues and topics, peek-lock and settlement, locks and redelivery, dead-lettering, duplicate detection, sessions, idempotent consumers and the outbox pattern.',
          questions: serviceBusFamilies,
        },
        {
          id: 'az-logic-apps-integration',
          prerequisites: ['az-service-bus'],
          name: 'Logic Apps and integration patterns',
          description:
            'Triggers, actions and connectors, run-after error handling with scopes, retry policies, Standard versus Consumption, choosing between services, and integration patterns.',
          questions: logicAppsFamilies,
        },
      ],
    },
    {
      id: 'az-delivery',
      name: 'Delivery',
      description: 'Build, test and deploy safely with Azure DevOps.',
      skills: [
        {
          id: 'az-devops-pipelines',
          prerequisites: ['az-identity-security'],
          name: 'Azure DevOps Pipelines',
          description:
            'YAML stages, jobs and steps, triggers and PR validation, dependencies and conditions, variables and secrets, artifacts, environments and approvals, deployment strategies and service connections.',
          questions: pipelinesFamilies,
        },
      ],
    },
  ],
};
