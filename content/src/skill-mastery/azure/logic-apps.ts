import type { QuestionSource } from '@pracstack/content-model';
import { json } from '../helpers';
import { scenarioFamily } from './builders';

/*
 * Azure Logic Apps and integration: triggers, actions and connectors, run-after
 * error handling with scopes, retry policies, loops, Standard vs Consumption,
 * choosing between Logic Apps, Functions and Service Bus, and integration patterns.
 */

const tryCatchFinally = (cleanupRunAfter: string): string => `{
  "actions": {
    "Try": {
      "type": "Scope",
      "actions": { "Call_ERP": { "type": "Http", "inputs": { "method": "POST", "uri": "..." } } }
    },
    "Catch": {
      "type": "Scope",
      "runAfter": { "Try": ["Failed", "TimedOut"] },
      "actions": { "Post_alert": { "type": "ApiConnection", "inputs": { "...": "..." } } }
    },
    "Cleanup": {
      "type": "Http",
      "runAfter": { "Catch": ${cleanupRunAfter} },
      "inputs": { "method": "DELETE", "uri": "..." }
    }
  }
}`;

export const logicAppsFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'az-la-triggers-actions',
    1,
    'A workflow starts with one trigger; everything after it is an action.',
    [
      {
        key: 'trigger-and-actions',
        question:
          'A workflow must start when a new email arrives in a shared mailbox, then save the attachment to SharePoint and post a Teams message. How is that modeled?',
        correct:
          'An Outlook “when a new email arrives” trigger, followed by a SharePoint action and a Teams action',
        wrong: [
          'Three triggers, one per connector, all in the same workflow',
          'A Recurrence trigger for each connector',
          'A SharePoint trigger that calls the mailbox and Teams as bindings',
        ],
        why: 'Each workflow has one trigger that starts a run; the remaining steps are actions, many of them provided by managed connectors. Connectors can offer both triggers and actions, but only one trigger starts this workflow.',
      },
      {
        key: 'request-response',
        question:
          'A caller sends an HTTP request to a workflow and must get a JSON result back in the same HTTP exchange. Which pair of operations does that?',
        correct: 'The Request trigger (“When an HTTP request is received”) and a Response action',
        wrong: [
          'A Recurrence trigger and an HTTP action',
          'An HTTP action at the start and a Terminate action at the end',
          'A Request trigger alone; the run history is returned to the caller',
        ],
        why: 'The Request trigger gives the workflow an endpoint, and the Response action sends the reply to the waiting caller. Without a Response action the caller gets an acknowledgment, not the result. The HTTP action makes outbound calls.',
      },
      {
        key: 'polling-trigger',
        difficulty: 2,
        question:
          'A workflow uses an SFTP “when a file is added” trigger that polls every five minutes. A file lands one minute after the last check. When does the run start?',
        correct: 'At the next poll, about four minutes later',
        wrong: [
          'Immediately, because the SFTP server notifies Logic Apps',
          'Five minutes after the file was added',
          'Only after a second poll confirms the file is still there',
        ],
        why: 'A polling trigger checks the source on its interval, so latency is up to one interval. Push (webhook) triggers start runs when the source notifies them. Choose the interval based on how fresh the data must be and how often you can afford to poll.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-la-standard-consumption',
    2,
    'Compare hosting model, networking, how many workflows share an app, and how you develop.',
    [
      {
        key: 'needs-standard',
        question:
          'A team needs several related workflows deployed together, access to resources behind private endpoints in their VNet, and local development in VS Code. Which Logic Apps option fits?',
        correct: 'Logic Apps Standard (single-tenant)',
        wrong: [
          'Logic Apps Consumption (multitenant), one resource per workflow',
          'Either; the two options have the same features',
          'Neither; workflows cannot reach private endpoints',
        ],
        why: 'Standard runs on a single-tenant runtime, hosts several workflows in one app, supports VNet integration, and is developed locally like a Functions project. Consumption is one workflow per resource in a shared environment, which suits simple, occasional workflows.',
      },
      {
        key: 'needs-consumption',
        question:
          'A single workflow runs a few times a day to copy a form submission into a spreadsheet. It needs no private networking and the team wants to pay only when it runs. Which option fits?',
        correct: 'Logic Apps Consumption (multitenant)',
        wrong: [
          'Logic Apps Standard, because it is required for managed connectors',
          'A Durable Functions app on a Premium plan',
          'An Azure DevOps pipeline on a schedule',
        ],
        why: 'Consumption bills per execution and needs no hosting plan, which fits a low-volume workflow. Managed connectors are available in both Standard and Consumption. A Premium Functions plan or a pipeline adds cost and code for no benefit.',
      },
      {
        key: 'stateless-workflow',
        difficulty: 3,
        question:
          'In Logic Apps Standard, a request-response workflow must answer within a second and run history is not needed. Which workflow type fits?',
        correct:
          'A stateless workflow, which keeps data in memory rather than persisting each step',
        wrong: [
          'A stateful workflow, which is always faster because it caches results',
          'A Consumption workflow, which is the only type that supports Response actions',
          'A stateful workflow with retries disabled',
        ],
        why: 'Stateful workflows persist inputs, outputs and state for each step, which gives run history and resilience but adds latency. Stateless workflows skip that persistence, so they are faster for short request-response work, at the cost of history and recovery after an interruption.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-la-run-after',
    3,
    'An action runs only if its predecessor ended in one of the statuses listed in its runAfter.',
    [
      {
        key: 'catch-when-try-succeeds',
        question:
          'In this workflow definition, `Call_ERP` succeeds. What happens to the `Catch` scope?',
        code: json(tryCatchFinally('["Succeeded"]')),
        correct: 'It is skipped, because `Try` did not end in Failed or TimedOut',
        wrong: [
          'It runs, because scopes always run',
          'It fails, because its run-after condition is not met',
          'It waits until `Try` times out',
        ],
        why: 'runAfter lists the predecessor statuses that allow an action to run. `Try` succeeded, which is not listed, so `Catch` gets the status Skipped. That is the try/catch pattern working as intended.',
      },
      {
        key: 'cleanup-skipped',
        difficulty: 4,
        question:
          'With the same definition, `Cleanup` must run whether or not the ERP call fails. On successful runs it never runs. Why?',
        code: json(tryCatchFinally('["Succeeded"]')),
        correct:
          '`Cleanup` runs after `Catch` only if `Catch` succeeded; on good runs `Catch` is Skipped, so `Cleanup` is skipped too. Its runAfter must also allow Skipped (and Failed, TimedOut)',
        wrong: [
          '`Cleanup` is inside the `Catch` scope, so it only runs on errors',
          'HTTP DELETE actions are skipped when the run has no errors',
          'Actions after a scope never run unless the scope contains a Terminate action',
        ],
        why: 'Skipped propagates: an action that only runs after a Succeeded predecessor is skipped when that predecessor was skipped. A “finally” step needs runAfter `["Succeeded", "Skipped", "Failed", "TimedOut"]` on the catch scope.',
      },
      {
        key: 'mark-run-failed',
        question:
          'The `Catch` scope posts an alert, and the run then shows Succeeded in the run history, which hides failures from the operations dashboard. What makes the run show Failed?',
        code: json(tryCatchFinally('["Succeeded", "Skipped", "Failed", "TimedOut"]')),
        correct: 'Add a Terminate action with status Failed at the end of `Catch`',
        wrong: [
          'Remove the runAfter from `Catch` so the error propagates',
          'Set the retry policy of `Call_ERP` to none',
          'Add a Response action with status code 500',
        ],
        why: 'Handling an error with run-after lets the run continue and finish successfully. If the run should still count as failed, end the error path with Terminate (status Failed), optionally with an error code and message. Removing runAfter would stop the alert from running at the right time.',
      },
      {
        key: 'error-details',
        difficulty: 5,
        question:
          'The alert in `Catch` should include the error message of whichever action inside `Try` failed. Which expression gives access to that?',
        code: json(tryCatchFinally('["Succeeded", "Skipped", "Failed", "TimedOut"]')),
        correct:
          "`result('Try')`, filtered to the items whose status is Failed, then reading their outputs or error",
        wrong: [
          "`actions('Catch')?['error']`",
          "`triggerBody()?['error']`",
          "`workflow()?['run']?['error']`",
        ],
        why: '`result()` returns the results of the actions inside a scope, including status, outputs and error details, so a Filter array on status Failed finds the failing step. `Catch` itself has not failed, the trigger body is the original input, and the workflow object describes the run, not each action.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-la-retry',
    3,
    'Retry policies are for transient failures, and retrying a non-idempotent call can repeat its effect.',
    [
      {
        key: 'bad-request-not-retried',
        question:
          'An HTTP action has an exponential retry policy with four retries. The target returns 400 Bad Request. How many requests are sent?',
        correct: 'One: 400 is not treated as transient, so it is not retried',
        wrong: [
          'Five: the first attempt plus four retries',
          'Four',
          'Requests repeat until the run times out',
        ],
        why: 'Retry policies apply to intermittent failures: 408, 429, 5xx responses and connectivity errors. A 400 means the request itself is wrong, and sending it again would fail the same way.',
      },
      {
        key: 'duplicate-invoices',
        difficulty: 4,
        question:
          'An HTTP action POSTs to an invoicing API with the default retry policy. Sometimes the API creates the invoice but the gateway in front of it returns 504. Customers then receive two invoices. What is the best fix?',
        correct:
          'Send an idempotency key (such as the order ID) that the API uses to ignore repeats, or make the endpoint idempotent another way',
        wrong: [
          'Change the retry policy to exponential with more retries',
          'Switch the action’s method from POST to GET',
          'Move the action into a scope',
        ],
        why: '504 is treated as transient, so the action retries, but the first request already took effect. Retries are only safe for idempotent operations; an idempotency key makes a POST safe to repeat. Disabling retries is the fallback when the API cannot support that, at the cost of failing on real transient errors.',
      },
    ],
  ),
  ...scenarioFamily('az-la-foreach', 4, 'For each loops run iterations concurrently by default.', [
    {
      key: 'variable-race',
      question:
        'A For each loop over 200 order lines uses Set variable to compute a running total (`total = total + line amount`). The final total is different on every run. What fixes it?',
      correct:
        'Set the loop’s concurrency control to one, so iterations run one after another (or compute the sum without a shared variable)',
      wrong: [
        'Initialize the variable inside the loop',
        'Add a retry policy to the Set variable action',
        'Increase the loop’s degree of parallelism',
      ],
      why: 'Iterations run in parallel by default, so several of them read the same old total and overwrite each other. Running sequentially makes the read-modify-write safe; aggregating without shared state (for example with an expression over the array) avoids the problem. Variables can only be initialized at the top level of a workflow.',
    },
    {
      key: 'order-dependent-rows',
      question:
        'Each row of a ledger file must be posted after the previous one, because each posting checks the balance left by the last. Postings are sometimes rejected even though the file is valid. What is the likely cause?',
      correct:
        'The For each loop processes rows in parallel by default, so later rows can be posted before earlier ones; make it sequential',
      wrong: [
        'For each loops process rows in reverse order',
        'The trigger delivers rows in random order unless Split On is enabled',
        'Rows are skipped when a previous iteration succeeds',
      ],
      why: 'Parallel iterations have no ordering guarantee. When each step depends on the result of the previous one, set concurrency to one (sequential). Parallelism is only safe for independent items.',
    },
  ]),
  ...scenarioFamily(
    'az-la-choose-service',
    3,
    'Low-code orchestration across SaaS systems, custom compute, and durable buffering between systems are different jobs.',
    [
      {
        key: 'saas-glue',
        question:
          'When a deal closes in the CRM, a contract should be generated in SharePoint and sent for manager approval by email. Business analysts will maintain the flow. What fits best?',
        correct: 'Logic Apps, using managed connectors and an approval email action',
        wrong: [
          'An Azure Function with hand-written REST calls to each system',
          'A Service Bus topic with one subscription per system',
          'An Azure DevOps pipeline triggered by the CRM',
        ],
        why: 'Logic Apps is designed for orchestrating SaaS systems with connectors and a visual designer that non-developers can maintain, including waiting for approvals. A Function means owning auth and API code for every system; Service Bus moves messages but does not call SaaS APIs or run approvals.',
      },
      {
        key: 'compute-heavy',
        question:
          'Thousands of uploaded images per minute must be analyzed with a custom C# library, and the team wants full control over the code and its tests. What fits best?',
        correct: 'Azure Functions running the custom code',
        wrong: [
          'A Logic Apps workflow with one action per image operation',
          'A Service Bus queue on its own',
          'A Logic Apps Consumption workflow with a For each loop',
        ],
        why: 'Functions run custom code, scale with load and are unit-testable like any .NET project. A workflow per image adds overhead and gives little control over the algorithm; a queue can feed the functions but does no processing itself.',
      },
      {
        key: 'buffer-slow-erp',
        question:
          'The web shop must accept orders even when the ERP system is slow or offline for maintenance, and no order may be lost. What should sit between them?',
        correct:
          'A Service Bus queue that the shop writes to and an ERP-facing consumer reads from at its own pace',
        wrong: [
          'A synchronous HTTP call with a longer timeout',
          'A Logic Apps Request trigger that calls the ERP directly',
          'An Azure Function that retries the ERP call in a loop inside the web request',
        ],
        why: 'A durable queue decouples availability: the shop only needs Service Bus to be up, and the consumer catches up when the ERP is back. Every synchronous option still fails, or holds the customer’s request open, when the ERP is down.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-integration-patterns',
    5,
    'Name the problem first: message size, matching replies, or who gets a copy.',
    [
      {
        key: 'claim-check',
        question:
          'Scanned contracts of up to 30 MB must flow through Service Bus to a processing service, but they exceed the message size limit. Which pattern fits?',
        correct:
          'Claim check: store the file in Blob Storage and send a message containing only a reference to it',
        wrong: [
          'Split each file across many messages and reassemble them on the other side',
          'Compress the file and send it in the message body',
          'Use a topic instead of a queue, since topics allow larger messages',
        ],
        why: 'A claim check keeps messages small and puts the large payload in storage designed for it; the receiver fetches it using the reference. Splitting needs reassembly, ordering and cleanup logic; compression may still not fit; topics and queues share the same message size limits.',
      },
      {
        key: 'request-reply-correlation',
        question:
          'Service A sends requests to a `quotes-requests` queue and receives replies from a shared `quotes-replies` queue. Several requests are in flight at once. How does A match each reply to its request?',
        correct:
          'A sets ReplyTo on each request; the responder copies the request’s MessageId into the reply’s CorrelationId, which A uses to match them',
        wrong: [
          'Replies arrive in the same order as requests were sent',
          'Service Bus links them automatically because both queues share a namespace',
          'A peeks the replies queue and takes the newest message',
        ],
        why: 'Asynchronous request-reply relies on correlation: the reply carries an identifier of the request. Ordering across independent requests is not guaranteed. When a requester needs only its own replies on a shared queue, ReplyToSessionId with a session-enabled reply queue is the variant to use.',
      },
      {
        key: 'second-consumer-on-queue',
        difficulty: 4,
        question:
          'The billing team added their own receiver to the existing `orders` queue so they also get every order. Now shipping sees only about half of the orders. What went wrong, and what is the fix?',
        correct:
          'Receivers on one queue compete for messages; publish to a topic with a subscription for shipping and another for billing',
        wrong: [
          'Billing’s receiver uses PeekLock; switching it to ReceiveAndDelete restores shipping’s orders',
          'The queue needs sessions so both receivers get every message',
          'Shipping’s lock duration is too short; increase it',
        ],
        why: 'A queue delivers each message to exactly one receiver, so adding a second receiver splits the stream. Publish-subscribe needs a topic, where each subscription gets its own copy. Receive mode, sessions and lock duration do not create copies.',
      },
    ],
  ),
];
