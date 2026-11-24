import type { QuestionSource } from '@pracstack/content-model';
import { plain, ts, yaml } from '../helpers';
import { scenarioFamily, selectAllFamily } from './builders';

/*
 * AWS Lambda: the handler model and execution environment reuse, timeouts and
 * memory, concurrency, event sources and their retry semantics, idempotency,
 * configuration and secrets, VPC networking and observability. Handler code is
 * Node.js/TypeScript shown for reading; it is not compiled.
 */

const reportLine = (extra: string): string =>
  `REPORT RequestId: 3f1c9a2e-7d41-4b0e-9a55-0c2f6e1d8b77  Duration: 9214.52 ms  Billed Duration: 9215 ms  Memory Size: 128 MB  Max Memory Used: 91 MB${extra}`;

export const lambdaFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'aws-lambda-init',
    2,
    'An execution environment is created once and then serves many invocations, one after another. What runs once, and what runs every time?',
    [
      {
        key: 'client-outside-handler',
        question:
          'Why is the DynamoDB client in this Node.js function created outside the handler?',
        code: ts(`import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

export const handler = async (event: { orderId: string }) => {
  const result = await client.send(
    new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: { S: event.orderId } },
    }),
  );
  return result.Item;
};`),
        correct:
          'Code outside the handler runs once when the execution environment initializes, so later invocations in that environment reuse the client and its connections',
        wrong: [
          'Lambda requires every SDK client to be global; creating one inside the handler fails',
          'The client is then shared by every execution environment of the function across all machines',
          'Module-level code runs before every invocation, so it is just a style choice',
        ],
        why: 'Initialization (imports and module-level code) runs once per execution environment, during a cold start. Warm invocations then reuse whatever it created: SDK clients, open connections, parsed configuration. Creating the client inside the handler works but pays the setup cost on every call. Each environment has its own copy, though; nothing is shared between environments.',
      },
      {
        key: 'init-duration',
        difficulty: 3,
        question:
          'Most REPORT lines for a function look like the first one below, but a few look like the second. What does the extra field mean?',
        code: plain(`REPORT RequestId: 8a0d...  Duration: 41.20 ms  Billed Duration: 42 ms  Memory Size: 512 MB  Max Memory Used: 118 MB
REPORT RequestId: c71e...  Duration: 44.87 ms  Billed Duration: 45 ms  Memory Size: 512 MB  Max Memory Used: 117 MB  Init Duration: 812.34 ms`),
        correct:
          'That invocation had a cold start: Lambda created a new execution environment and ran the initialization code first, which took about 0.8 seconds',
        wrong: [
          'The handler waited 812 ms for a DynamoDB response',
          'The invocation was retried after an 812 ms timeout',
          'API Gateway spent 812 ms authorizing the request',
        ],
        why: '`Init Duration` appears only when a new environment was initialized for the request: runtime start-up plus your module-level code. Warm invocations skip it. Heavy imports and slow start-up work show up here, which is why trimming dependencies or using provisioned concurrency reduces cold-start latency.',
      },
      {
        key: 'state-leak',
        difficulty: 4,
        question:
          'Under load, some responses from this function include user ids from other people’s requests. Why?',
        code: ts(`const seen: string[] = [];

export const handler = async (event: { userId: string }) => {
  seen.push(event.userId);
  return { statusCode: 200, body: JSON.stringify({ processedFor: seen }) };
};`),
        correct:
          'Module-level variables live as long as the execution environment, so `seen` keeps the ids of every earlier invocation that environment served',
        wrong: [
          'The array is shared by all execution environments of the function, across every machine',
          'API Gateway caches responses and returns other users’ cached bodies',
          'JSON.stringify reads memory from other processes when the array grows',
        ],
        why: 'Reuse of the execution environment is a performance feature, but it means module-level state survives between invocations. Per-request data must live inside the handler. Each environment has its own copy, so the leak looks random: it depends on which environment served which request, which makes it easy to miss in testing.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-lambda-limits',
    2,
    'Read the log line closely: is it about time, memory or CPU?',
    [
      {
        key: 'default-timeout',
        difficulty: 1,
        question:
          'A new function calls a partner API that usually answers in about 5 seconds. The function was created with default settings. Every invocation logs the line below. What is happening?',
        code: plain('2026-11-23T09:14:07.512Z 5b2d1c0e-... Task timed out after 3.00 seconds'),
        correct:
          'The function hit its timeout, which defaults to 3 seconds; raise the timeout to fit the call (and give the HTTP client its own shorter timeout)',
        wrong: [
          'The function ran out of memory after 3 seconds',
          'The partner API rejected the request after 3 seconds',
          'Lambda throttled the function because it was invoked too often',
        ],
        why: 'A new Lambda function’s timeout is 3 seconds unless you set it, and when it is reached Lambda stops the invocation and logs “Task timed out after N seconds”. Set the timeout from the real work the function does, and set a client timeout below it so the code can fail cleanly with a useful error instead of being killed.',
      },
      {
        key: 'out-of-memory',
        question:
          'A function that builds a large CSV in memory starts failing on bigger exports. The logs show the lines below. What is the cause?',
        code: plain(`Error: Runtime exited with error: signal: killed
Runtime.ExitError
REPORT RequestId: 9e41...  Duration: 4210.11 ms  Billed Duration: 4211 ms  Memory Size: 512 MB  Max Memory Used: 512 MB`),
        correct:
          'The function used all of its configured memory and the runtime was killed; increase memory or stream the export instead of holding it all in memory',
        wrong: [
          'The function reached its timeout',
          'The execution role lost permission to write the file',
          'Another invocation killed it to free up concurrency',
        ],
        why: '`Max Memory Used` equal to `Memory Size`, followed by the runtime being killed, is the signature of running out of memory. More memory buys time; streaming (for example, multipart upload to S3 as rows are produced) fixes the growth. A timeout would say “Task timed out” instead.',
      },
      {
        key: 'memory-cpu',
        difficulty: 3,
        question:
          'A CPU-heavy image-resizing function is configured with 128 MB. It takes about 9 seconds per image, as in the REPORT line below, and never uses more than about 90 MB. Would raising memory to 1024 MB be likely to help?',
        code: plain(reportLine('')),
        correct:
          'Yes: Lambda allocates CPU in proportion to configured memory, so more memory gives the function more CPU and should shorten the run',
        wrong: [
          'No: it only uses 91 MB, so extra memory would sit unused',
          'No: CPU is fixed for every function; only provisioned concurrency changes speed',
          'Yes, but only because the extra memory is used as a disk cache for images',
        ],
        why: 'Memory is Lambda’s single performance dial: CPU (and network bandwidth) scale with it. A CPU-bound function often runs much faster with more memory, and because you pay for memory multiplied by duration, it can cost about the same or less. “Max Memory Used is low, so memory doesn’t matter” is the common misreading.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-lambda-concurrency',
    4,
    'Reserved concurrency caps (and guarantees) how many environments a function can use. Provisioned concurrency keeps environments initialized in advance.',
    [
      {
        key: 'provisioned-for-latency',
        difficulty: 3,
        question:
          'A checkout API on Lambda has a sharp traffic spike every morning, and the first requests of the spike are slow because of long initialization. Which setting addresses that latency?',
        correct:
          'Provisioned concurrency, so a number of execution environments are already initialized before the spike',
        wrong: [
          'Reserved concurrency, which pre-warms the reserved number of environments',
          'A longer function timeout, so slow requests do not fail',
          'Putting an SQS queue in front of the API',
        ],
        why: 'Provisioned concurrency initializes environments ahead of time, so requests served by them skip the cold start. Reserved concurrency does not pre-warm anything: it sets aside capacity and caps the function at that number. A longer timeout hides nothing from the user, and a queue makes a synchronous API asynchronous.',
      },
      {
        key: 'protect-database',
        question:
          'A Lambda function behind an API writes to a relational database that accepts a limited number of connections. During a traffic spike Lambda scales to hundreds of concurrent environments and the database starts refusing connections. What addresses this?',
        correct:
          'Cap the function with reserved concurrency and use RDS Proxy to pool database connections',
        wrong: [
          'Enable provisioned concurrency, which limits how many environments can run',
          'Increase the function timeout so connections wait longer',
          'Give the function more memory so each environment opens fewer connections',
        ],
        why: 'Every execution environment opens its own connections, so Lambda’s scaling can overwhelm a database. Reserved concurrency sets a hard ceiling (extra requests are throttled), and RDS Proxy shares a smaller pool of connections among many environments. Provisioned concurrency only pre-initialises environments; it is not a cap.',
      },
      {
        key: 'async-throttled',
        difficulty: 5,
        question:
          'A function processes S3 upload events (asynchronous invocation with default settings). During maintenance someone set its reserved concurrency to 0 for 20 minutes, then restored it. Uploads continued during that window. What happened to those events?',
        correct:
          'Lambda kept them in its asynchronous event queue and retried the throttled invocations, so they were processed after concurrency was restored',
        wrong: [
          'They were lost: a throttled asynchronous invocation is dropped immediately',
          'S3 kept the events and re-sent them after 20 minutes',
          'They went straight to the function’s dead-letter queue without any retry',
        ],
        why: 'For asynchronous invocations, Lambda queues events itself and retries throttling errors with backoff for up to the maximum event age (6 hours by default) before sending them to a failure destination or discarding them. S3 hands the event to Lambda once and is not involved again. Reserved concurrency 0 is a common way to pause a function; for synchronous callers it would mean immediate throttling errors instead.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-lambda-event-sources',
    3,
    'Who invokes the function: a caller waiting for the answer (synchronous), Lambda’s own async queue, or an event source mapping polling a queue?',
    [
      {
        key: 'api-gateway-sync',
        difficulty: 2,
        question:
          'An API Gateway HTTP API invokes a Lambda function, and the function throws an unhandled error. What happens next?',
        correct:
          'The invocation is synchronous: nothing retries automatically and the client receives an error response',
        wrong: [
          'Lambda retries the invocation twice before API Gateway responds',
          'API Gateway places the request in a queue and retries it later',
          'The request goes to the function’s dead-letter queue and the client gets 202 Accepted',
        ],
        why: 'With synchronous invocation the caller (here API Gateway, and ultimately the client) receives the error and decides whether to retry. Lambda’s built-in retries and dead-letter queues apply to asynchronous invocation, not to request/response APIs.',
      },
      {
        key: 's3-async-retry',
        question:
          'An S3 `ObjectCreated` notification invokes a function (asynchronously, default settings), and the function throws every time for one particular file. What happens to that event?',
        correct:
          'Lambda retries it twice more, then discards it unless an on-failure destination or a dead-letter queue is configured',
        wrong: [
          'S3 retries the notification every hour until the function succeeds',
          'Lambda retries it forever, blocking all later events',
          'It is not retried; asynchronous events are always delivered only once',
        ],
        why: 'Asynchronous invocations get two retries by default (configurable from 0 to 2), after which the event goes to an on-failure destination or DLQ if you configured one, otherwise it is dropped. Configure a destination so permanently failing events are kept for investigation. Other events are not blocked by one failing event.',
      },
      {
        key: 'partial-batch',
        difficulty: 4,
        question:
          'An SQS-triggered function receives batches of 10 messages. When one message is invalid, the handler below throws and all 10 messages come back later, so the 9 good ones are processed again. What is the right fix?',
        code: ts(`import type { SQSEvent } from 'aws-lambda';

export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    await processOrder(JSON.parse(record.body)); // throws for invalid orders
  }
};`),
        correct:
          'Enable `ReportBatchItemFailures` on the event source mapping, catch errors per record, and return `{ batchItemFailures: [{ itemIdentifier: record.messageId }] }` for the failed ones only',
        wrong: [
          'Set the batch size to 1000 so a failure affects a smaller fraction of messages',
          'Catch the error and return normally, so the whole batch counts as successful',
          'Delete the invalid message from the queue before throwing, so the retry contains only good messages',
        ],
        why: 'By default an event source mapping treats a batch as one unit: any thrown error makes every message visible again. With partial batch responses, the function reports exactly which message ids failed and only those return to the queue. Swallowing the error would delete the bad message without it ever reaching a DLQ, and a bigger batch makes reprocessing worse, not better.',
      },
      {
        key: 'partial-batch-not-enabled',
        difficulty: 5,
        question:
          'The handler collects failed records and returns `{ batchItemFailures: failures }`. The SAM template is below. When a message fails, it never shows up again or in the DLQ. Why?',
        code: yaml(`OrdersFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: index.handler
    Runtime: nodejs22.x
    Events:
      Orders:
        Type: SQS
        Properties:
          Queue: !GetAtt OrdersQueue.Arn
          BatchSize: 10`),
        correct:
          'The event source mapping does not have `FunctionResponseTypes: [ReportBatchItemFailures]`, so the returned object is ignored, the batch counts as successful, and every message is deleted',
        wrong: [
          'SAM does not support SQS triggers, so the events come from a different mapping',
          'Failed messages go to Lambda’s asynchronous event queue instead of SQS',
          'The batch size of 10 is too large for partial batch responses',
        ],
        why: 'Partial batch responses must be switched on in the event source mapping. Without it, Lambda only looks at whether the handler threw; a normal return means “all succeeded”, so Lambda deletes the whole batch, including the messages you meant to report. This bug loses data silently, which is why it is worth a test that checks failed messages really come back.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-lambda-idempotency',
    3,
    'Assume every event can arrive more than once. What would make the second delivery harmless?',
    [
      {
        key: 'choose-key',
        question:
          'A function handles `OrderPaid` events and sends a receipt email. Duplicates happen. Which value should it use as the idempotency key to detect an event it has already handled?',
        correct:
          'A business identifier carried in the event, such as the order id plus the event type',
        wrong: [
          'A random UUID generated at the start of the handler',
          'The current timestamp, rounded to the second',
          'The Lambda request id of the invocation',
        ],
        why: 'An idempotency key must be the same on every delivery of the same event, so it has to come from the event itself. A UUID or the Lambda request id is new on each invocation, so duplicates look new; timestamps collide for different events and differ for retries.',
      },
      {
        key: 'double-charge',
        difficulty: 4,
        question:
          'An SQS-triggered payment function charged a customer twice. The logs show the same message id handled by two invocations a minute apart. What is the right fix?',
        correct:
          'Make the handler idempotent: record the payment’s idempotency key with a conditional write and skip (or return the earlier result) if it already exists',
        wrong: [
          'Switch to a FIFO queue, which guarantees each message is processed exactly once',
          'Set the queue’s maxReceiveCount to 0 so messages are never redelivered',
          'Increase the batch size so duplicates land in the same batch and cancel out',
        ],
        why: 'SQS delivers at least once, and a message also comes back when processing takes longer than the visibility timeout or fails after the charge. Only the consumer can make duplicates harmless. FIFO deduplication drops duplicate sends within a time window; it does not stop a message being processed twice if the consumer fails before deleting it. Payment providers usually accept an idempotency key too, which protects the external call itself.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-lambda-vpc',
    4,
    'A function attached to a VPC uses that VPC’s networking. How do private subnets reach AWS service endpoints?',
    [
      {
        key: 'secrets-timeout',
        question:
          'A function was attached to private subnets so it can reach an RDS database. Since then, its call to Secrets Manager hangs until the function times out. There is no NAT gateway and no VPC endpoint. What is the fix?',
        correct:
          'Add a VPC interface endpoint for Secrets Manager (or route the subnets through a NAT gateway) so the function can reach the service from the VPC',
        wrong: [
          'Move the function to a public subnet so it gets a public IP address',
          'Add `secretsmanager:GetSecretValue` to the execution role',
          'Increase the function’s timeout so the call has time to complete',
        ],
        why: 'Once attached to a VPC, the function’s traffic goes through your subnets. Private subnets without a NAT gateway or endpoints cannot reach public service endpoints, so the connection just hangs. Lambda’s network interfaces never get public IPs, so a public subnet does not help. A permission problem would fail fast with AccessDenied, not hang.',
      },
      {
        key: 'dynamodb-gateway',
        difficulty: 5,
        question:
          'The same in-VPC function now also needs DynamoDB, and the team wants to avoid a NAT gateway. Which option gives it access?',
        correct:
          'A gateway VPC endpoint for DynamoDB, associated with the route tables of the function’s subnets',
        wrong: [
          'A security group rule allowing outbound HTTPS to 0.0.0.0/0, which is enough on its own',
          'An internet gateway attached to the VPC, with the function staying in private subnets',
          'A Lambda function URL on the function',
        ],
        why: 'S3 and DynamoDB offer gateway endpoints, which add routes to your route tables and keep traffic on the AWS network; most other services use interface endpoints. Security groups only permit traffic, they do not provide a route. An internet gateway only serves subnets that route to it and resources with public IPs. A function URL is for calling into the function, not out of it.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-lambda-observability',
    1,
    'Logs record what happened, metrics count it, traces show where the time went across services.',
    [
      {
        key: 'where-logs-go',
        question:
          'A Node.js function writes `console.log("order saved", orderId)`. Where does that line end up by default?',
        correct:
          'In CloudWatch Logs, in the function’s log group (by default `/aws/lambda/<function-name>`), provided the execution role can write logs',
        wrong: [
          'In AWS CloudTrail, alongside API calls',
          'In the API Gateway response body',
          'Nowhere: Lambda discards standard output',
        ],
        why: 'Lambda captures stdout and stderr and sends them to CloudWatch Logs. If logs are missing, the first thing to check is the execution role (the `AWSLambdaBasicExecutionRole` managed policy grants the log permissions). CloudTrail records AWS API calls, not application output.',
      },
      {
        key: 'trace-latency',
        difficulty: 3,
        question:
          'An endpoint is slow. The handler calls DynamoDB, then an internal HTTP service, then SQS. Which tool shows how long each of those calls took within a single request?',
        correct: 'AWS X-Ray tracing, with the function’s SDK clients instrumented',
        wrong: [
          'AWS CloudTrail, which logs each API call with its duration',
          'AWS Config, which records resource changes',
          'The function’s `Duration` metric in CloudWatch',
        ],
        why: 'X-Ray (with active tracing enabled and instrumented clients) records a trace per request with a segment for each downstream call, so you can see which one dominates. The Duration metric gives only the total. CloudTrail is an audit log of management and data events, not a latency profiler; Config tracks configuration.',
      },
    ],
  ),
  ...selectAllFamily(
    'aws-lambda-configuration',
    2,
    'Environment variables are visible to anyone who can view the function configuration and change only on redeploy.',
    [
      {
        key: 'env-vars',
        question: 'Which of these belong in the Lambda function’s environment variables?',
        right: [
          'The name of the DynamoDB table for this stage, e.g. `TABLE_NAME=orders-prod`',
          'The log level, e.g. `LOG_LEVEL=info`',
        ],
        wrong: [
          'The production database password, as plain text',
          'An IAM user’s access key for the function’s own calls to AWS',
        ],
        why: 'Non-secret, per-environment configuration (resource names, log levels, feature flags) is exactly what environment variables are for. Secrets belong in Secrets Manager or Parameter Store and are fetched at runtime by the execution role; plaintext values in environment variables are visible in the console and in infrastructure templates. AWS credentials for the function come from its execution role, never from keys.',
      },
    ],
  ),
];
