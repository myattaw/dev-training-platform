import type { QuestionSource } from '@pracstack/content-model';
import { json, plain } from '../helpers';
import { scenarioFamily, selectAllFamily } from './builders';

/*
 * Messaging and events: SQS standard and FIFO queues, visibility timeouts and
 * dead-letter queues, SNS fan-out, Amazon EventBridge event patterns,
 * idempotent consumers, and Step Functions orchestration versus choreography.
 */

const orderPattern = json(`{
  "source": ["com.acme.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": {
    "total": [{ "numeric": [">=", 1000] }],
    "country": ["DE", "FR"]
  }
}`);

const chargeState = json(`"ChargeCard": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": { "FunctionName": "charge-card", "Payload.$": "$" },
  "Retry": [
    {
      "ErrorEquals": ["PaymentGatewayTimeout"],
      "IntervalSeconds": 2,
      "MaxAttempts": 3,
      "BackoffRate": 2
    }
  ],
  "Catch": [
    { "ErrorEquals": ["States.ALL"], "Next": "ReleaseStock" }
  ],
  "Next": "ShipOrder"
}`);

export const messagingFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'aws-sqs-queue-types',
    2,
    'Standard queues: at-least-once, best-effort order. FIFO queues: order within a message group, deduplication of sends.',
    [
      {
        key: 'standard-duplicates',
        difficulty: 1,
        question:
          'A consumer of a standard SQS queue occasionally processes the same message twice. Nothing is misconfigured. Is that expected?',
        correct:
          'Yes: standard queues deliver at least once, so consumers must tolerate duplicates',
        wrong: [
          'No: SQS guarantees exactly-once delivery for all queues',
          'No: duplicates only happen when the queue has a dead-letter queue',
          'Yes, but only if the messages are larger than 64 KB',
        ],
        why: 'Standard queues trade strict guarantees for very high throughput: a message can occasionally be delivered more than once and out of order. The consumer has to be idempotent. FIFO queues add ordering and send-side deduplication, but consumers should still handle redelivery after failures.',
      },
      {
        key: 'per-account-order',
        question:
          'Bank transactions must be applied in order for each account, while different accounts should be processed in parallel. Which setup fits?',
        correct: 'A FIFO queue with `MessageGroupId` set to the account id',
        wrong: [
          'A standard queue, which keeps messages in the order they were sent',
          'A FIFO queue with the same `MessageGroupId` on every message, so accounts are processed in parallel',
          'A standard queue with a delay of one second between messages',
        ],
        why: 'In a FIFO queue, ordering is per message group: messages with the same group id are delivered in order, one batch at a time, while different groups can be consumed in parallel. One group id for everything would keep order but serialise all accounts. Standard queues only attempt ordering, and delays do not create it.',
      },
      {
        key: 'dedup-window',
        difficulty: 4,
        question:
          'A FIFO queue has content-based deduplication enabled. A producer sends an `OrderPlaced` message, retries the identical send 2 minutes later after a network timeout, and (because of a bug) sends the identical body again 10 minutes after the first send. What reaches the queue?',
        correct:
          'Two messages: the 2-minute retry is deduplicated, but the 10-minute send is outside the 5-minute deduplication interval and is accepted as new',
        wrong: [
          'One message: identical bodies are deduplicated forever on FIFO queues',
          'Three messages: content-based deduplication only applies to messages in different groups',
          'One message, and the third send fails with a DuplicateMessage error',
        ],
        why: 'FIFO deduplication (by `MessageDeduplicationId` or a hash of the body) protects against producer retries within a 5-minute interval. It is not a permanent uniqueness check, so business-level duplicates must still be handled by the consumer or by a conditional write. Duplicate sends inside the window are accepted without error but not delivered twice.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-sqs-visibility-dlq',
    3,
    'A received message is hidden for the visibility timeout. If it is not deleted by then, it becomes visible again and its receive count goes up.',
    [
      {
        key: 'visibility-too-short',
        question:
          'Workers poll a queue with the default 30-second visibility timeout. Processing a message takes 45 to 60 seconds. The team sees each message processed twice by different workers. What is the fix?',
        correct:
          'Make the visibility timeout longer than the processing time (or have the worker extend it with ChangeMessageVisibility while it works)',
        wrong: [
          'Lower the visibility timeout so messages are processed faster',
          'Turn on long polling, which locks messages until they are deleted',
          'Add a dead-letter queue, which prevents duplicates',
        ],
        why: 'While a message is invisible no other consumer can receive it; if the worker has not deleted it when the timeout ends, it reappears and another worker takes it. The timeout has to cover the worst-case processing time. Long polling only affects how receive calls wait for messages; DLQs catch repeated failures, not slow successes.',
      },
      {
        key: 'max-receive',
        question:
          'A queue has the redrive policy below. One message always makes the consumer throw. What happens to it?',
        code: json(`{
  "deadLetterTargetArn": "arn:aws:sqs:eu-west-1:123456789012:orders-dlq",
  "maxReceiveCount": 5
}`),
        correct:
          'It is received and fails 5 times; once its receive count exceeds 5, SQS moves it to `orders-dlq`',
        wrong: [
          'It is moved to the DLQ after the first failure',
          'It is deleted after 5 failures and never stored anywhere',
          'It stays in the queue for ever, retried every 30 seconds',
        ],
        why: 'Every receive increments the message’s receive count. When the count exceeds `maxReceiveCount`, SQS moves the message to the dead-letter queue instead of delivering it again, so a poison message stops blocking consumers and is kept for investigation. Someone should alarm on the DLQ depth.',
      },
      {
        key: 'lambda-visibility-check',
        difficulty: 4,
        question:
          'A SAM deployment that connects an SQS queue to a Lambda function fails with the message below. The function legitimately needs up to 5 minutes. What is the right change?',
        code: plain(
          'Queue visibility timeout: 30 seconds is less than Function timeout: 300 seconds',
        ),
        correct:
          'Raise the queue’s visibility timeout above the function timeout (AWS recommends at least six times the function timeout)',
        wrong: [
          'Lower the function timeout to 30 seconds',
          'Set the batch size to 1, which removes the check',
          'Switch the queue to FIFO, which has no visibility timeout',
        ],
        why: 'If the queue made a message visible again while the function was still working on it, another invocation would process it at the same time. Lambda therefore refuses a mapping where visibility is shorter than the function timeout, and the recommended margin also leaves room for retries when the function is throttled. Cutting the timeout would make legitimate work fail.',
      },
      {
        key: 'max-receive-one',
        difficulty: 4,
        question:
          'To “fail fast”, a team sets `maxReceiveCount` to 1 on the source queue of a Lambda function. Soon the DLQ fills with perfectly valid orders. Why?',
        correct:
          'Any single failure, even a transient one such as a throttled downstream call, now sends the message straight to the DLQ; a higher count gives transient errors a retry',
        wrong: [
          'With maxReceiveCount 1, SQS moves every message to the DLQ before it is delivered',
          'Lambda ignores maxReceiveCount and uses its own retry limit of 1',
          'DLQs only accept messages from FIFO queues, so the setting corrupts messages',
        ],
        why: 'A message reaches the DLQ after it has been received more than `maxReceiveCount` times without being deleted. With 1, one failed attempt is enough. Transient failures (throttling, timeouts, brief outages) are normal, so set the count high enough for retries to absorb them and keep the DLQ for messages that genuinely cannot be processed.',
      },
      {
        key: 'dlq-retention',
        difficulty: 5,
        question:
          'A standard queue keeps messages for 4 days, and its DLQ also keeps messages for 4 days. A message that failed for 3 days before reaching the DLQ disappears from the DLQ about a day later, before anyone looked at it. Why?',
        correct:
          'For standard queues, expiry is based on the message’s original enqueue time, which moving it to the DLQ does not reset; the DLQ’s retention should be longer than the source queue’s',
        wrong: [
          'DLQs delete messages as soon as an alarm fires',
          'Messages in a DLQ are deleted after 24 hours regardless of settings',
          'The consumer received it from the DLQ by mistake and deleted it',
        ],
        why: 'A message moved to a standard queue’s DLQ keeps its original enqueue timestamp, so time spent failing in the source queue counts against the DLQ’s retention. Setting the DLQ’s retention period longer than the source queue’s gives people time to inspect and redrive failures.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-sns-fanout',
    1,
    'SNS pushes a copy of each message to every subscription; SQS queues let each consumer work at its own pace.',
    [
      {
        key: 'fan-out',
        question:
          'When an order is placed, billing, shipping and analytics each need their own copy of the event, and each must be able to fall behind or fail without affecting the others. Which setup fits?',
        correct: 'An SNS topic with one SQS queue per service subscribed to it',
        wrong: [
          'One SQS queue that all three services poll',
          'Three Lambda functions that each call the others when they finish',
          'One SQS queue per service, with the producer deleting messages once the slowest service is done',
        ],
        why: 'SNS fan-out copies each message to every subscription; a queue per subscriber buffers it so each service retries, scales and recovers independently. Consumers polling one queue compete, so each message would reach only one service.',
      },
      {
        key: 'filter-policy',
        difficulty: 2,
        question:
          'The shipping queue’s subscription has the filter policy below (applied to message attributes). Which messages reach the shipping queue?',
        code: json(`{
  "region": ["EU"],
  "type": ["OrderPlaced", "OrderCancelled"]
}`),
        correct:
          'Only messages whose `region` attribute is `EU` and whose `type` attribute is `OrderPlaced` or `OrderCancelled`',
        wrong: [
          'Messages whose `region` is `EU` or whose `type` is one of the two values',
          'All messages; filter policies only affect the order of delivery',
          'Only messages that have no attributes',
        ],
        why: 'Within a filter policy, the keys are combined with AND and the values listed for one key with OR. Messages that do not match are not delivered to that subscription, so filtering happens in SNS instead of in consumer code.',
      },
    ],
  ),
  ...selectAllFamily(
    'aws-eventbridge-match',
    3,
    'Every field in the pattern must match; values listed in an array are alternatives; extra fields in the event are ignored.',
    [
      {
        key: 'numeric-and-list',
        question: 'An EventBridge rule has the pattern shown. Which events match it?',
        code: orderPattern,
        right: [
          'Source `com.acme.orders`, detail-type `OrderPlaced`, detail `{ "total": 1500, "country": "DE" }`',
          'Source `com.acme.orders`, detail-type `OrderPlaced`, detail `{ "total": 1000, "country": "FR", "channel": "web" }`',
        ],
        wrong: [
          'Source `com.acme.orders`, detail-type `OrderPlaced`, detail `{ "total": 999, "country": "FR" }`',
          'Source `com.acme.orders`, detail-type `OrderPlaced`, detail `{ "total": 2000, "country": "US" }`',
          'Source `com.acme.billing`, detail-type `OrderPlaced`, detail `{ "total": 5000, "country": "DE" }`',
        ],
        why: 'All conditions must hold: the source, the detail-type, a total of at least 1000 (`>=` includes 1000) and a country of DE or FR. Fields not mentioned in the pattern, like `channel`, do not matter. An event from another source never matches, whatever its detail.',
      },
      {
        key: 'anything-but',
        difficulty: 5,
        question:
          'A rule uses the pattern `{ "source": ["com.acme.orders"], "detail": { "status": [{ "anything-but": ["CANCELLED"] }] } }`. Which events from `com.acme.orders` match?',
        right: ['detail `{ "status": "SHIPPED" }`', 'detail `{ "status": "cancelled" }`'],
        wrong: [
          'detail `{ "status": "CANCELLED" }`',
          'detail `{ "orderId": "9001" }` (no status field)',
        ],
        why: '`anything-but` matches any value except those listed, but the field still has to be present: an event without `status` does not match (use `exists` to test presence). Matching is case-sensitive, so lowercase `cancelled` is a different value and matches; normalise values in producers or use the `equals-ignore-case` operator when case should not matter.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-eventbridge-array-values',
    4,
    'When the value in the event is an array, how does EventBridge compare it with the values in the pattern?',
    [
      {
        key: 'array-field',
        question:
          'A rule’s pattern contains `"detail": { "tags": ["priority"] }`. An event arrives with `"detail": { "tags": ["gift", "priority"] }`. Does it match?',
        correct:
          'Yes: when the event value is an array, the pattern matches if any element matches',
        wrong: [
          'No: the event array must equal the pattern array exactly',
          'No: patterns cannot match array fields at all',
          'Only if `priority` is the first element of the array',
        ],
        why: 'EventBridge treats an array in the event as a set of values: the field matches if any element is one of the pattern’s values. This lets one rule pick out events tagged “priority” without caring about other tags or their order.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-idempotent-consumers',
    4,
    'The same event can arrive twice. What makes the second delivery a no-op, atomically?',
    [
      {
        key: 'stock-decrement',
        question:
          'An SQS consumer decrements stock with `UpdateItem ... SET stock = stock - :qty` for each `OrderPlaced` event. After a redelivery, stock was decremented twice. What is the most robust fix?',
        correct:
          'In one DynamoDB transaction, put a record keyed by the event id with `attribute_not_exists` and decrement the stock; a duplicate fails the condition and changes nothing',
        wrong: [
          'Check a processed-events table first, then decrement in a separate call if the event is new',
          'Set the queue’s visibility timeout to zero so messages are never redelivered',
          'Switch the decrement to `SET stock = :newStock`, computed from a value read earlier',
        ],
        why: 'Recording “I processed this event” and applying its effect must succeed or fail together; `TransactWriteItems` does that. A check followed by a separate write has a race and can crash between the two steps. A visibility timeout of zero causes more redelivery, not less, and writing a value computed from an earlier read loses concurrent updates.',
      },
      {
        key: 'dedup-key',
        difficulty: 5,
        question:
          'A producer calls EventBridge `PutEvents` and, on a timeout, retries the call. Consumers deduplicate events. Which identifier detects duplicates from both EventBridge redelivery and the producer’s retry?',
        correct:
          'A business id the producer puts in `detail` (for example the order id and event type, or an event id it generates once and reuses on retry)',
        wrong: [
          'The top-level `id` field EventBridge adds to the event',
          'The `time` field of the event',
          'The Lambda request id of the consumer invocation',
        ],
        why: 'EventBridge assigns the top-level `id` to each entry it accepts, so a retried PutEvents call creates a new event with a new id: deduplicating on it misses producer-side duplicates. An identifier the producer controls stays the same across retries. Timestamps and consumer request ids change on every attempt.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-orchestration',
    3,
    'Does one place need to control the order of steps and the compensation, or do independent consumers simply react? In Step Functions, Retry is matched first and Catch handles what retries do not.',
    [
      {
        key: 'orchestrate-order',
        question:
          'Fulfilling an order means: reserve stock, charge the card, then ship. If charging fails, the reservation must be released. Support staff need to see where each order is in this process. Which design fits?',
        correct:
          'A Step Functions state machine with a task per step, Retry for transient errors and a Catch that runs a release-stock step',
        wrong: [
          'Three Lambda functions publishing events to each other, with no record of overall progress',
          'One Lambda function doing all three steps, with a 15-minute timeout',
          'An SNS topic fanning the order out to all three steps at once',
        ],
        why: 'When steps run in order, depend on each other and need compensation on failure, orchestration fits: the workflow is explicit, each execution’s history shows where an order is, and retries and error handling are declared. A single function hides progress and loses everything on a crash; parallel fan-out ignores the ordering.',
      },
      {
        key: 'choreography',
        question:
          'When an order is placed, the loyalty, email and analytics teams each want to react in their own way. None of them depends on the others, and new teams will join later. Which design fits?',
        correct:
          'Publish an `OrderPlaced` event to an EventBridge bus; each team owns a rule and target for it (choreography)',
        wrong: [
          'A Step Functions state machine owned by the orders team that calls each team’s service in turn',
          'The orders service calls each team’s API directly and retries until all succeed',
          'One shared Lambda function containing all three teams’ code',
        ],
        why: 'When reactions are independent, choreography keeps the publisher unaware of its consumers: teams add rules without changing the orders service, and a failing consumer does not block the others. A central orchestrator would have to change for every new team and would couple their availability to the order flow.',
      },
      {
        key: 'declined-not-retried',
        difficulty: 4,
        question:
          'In this state, the Lambda function fails with error type `CardDeclined`. What happens?',
        code: chargeState,
        correct:
          'It is not retried: no Retry entry matches, so the Catch for `States.ALL` sends the execution to `ReleaseStock` immediately',
        wrong: [
          'It is retried 3 times, because every Task retries all errors by default',
          'The execution fails, because `CardDeclined` is not listed anywhere',
          'It continues to `ShipOrder`, because the error was caught',
        ],
        why: 'Retry rules only apply to the errors they list. `CardDeclined` is permanent, so retrying it would be wrong anyway; it falls through to Catch, whose `States.ALL` matches any error and routes to the compensation step instead of `Next`.',
      },
      {
        key: 'timeout-retried',
        difficulty: 5,
        question:
          'In the same state, the function fails with `PaymentGatewayTimeout` on every attempt. What happens?',
        code: chargeState,
        correct:
          'It is retried 3 times after waits of about 2, 4 and 8 seconds; after the last failure, the Catch sends the execution to `ReleaseStock`',
        wrong: [
          'It is attempted 3 times in total, then the execution fails',
          'It is retried forever with a 2-second delay',
          'It goes to `ReleaseStock` immediately, because Catch is checked before Retry',
        ],
        why: '`MaxAttempts` is the number of retries after the first attempt, the first wait is `IntervalSeconds`, and each later wait is multiplied by `BackoffRate`. Once retries are exhausted the error goes to Catch, which here routes to compensation rather than failing the execution.',
      },
    ],
  ),
];
