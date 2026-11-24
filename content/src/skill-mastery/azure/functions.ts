import type { QuestionSource } from '@pracstack/content-model';
import { json, plain } from '../helpers';
import { scenarioFamily } from './builders';

/*
 * Azure Functions (isolated worker model): triggers and bindings, configuration,
 * idempotency, retries and poison messages, hosting and cold starts, Durable
 * Functions determinism and monitoring. C# that uses the Functions or Azure SDK
 * packages is shown as plain text: the C# runner does not reference those packages.
 */

export const functionsFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'az-fn-trigger-binding',
    1,
    'A trigger starts a function; bindings connect it to data without client code.',
    [
      {
        key: 'one-trigger',
        question: 'How many triggers and bindings can one Azure Function have?',
        correct:
          'Exactly one trigger, and any number of input and output bindings (including none)',
        wrong: [
          'Any number of triggers, and exactly one output binding',
          'Exactly one trigger and exactly one output binding',
          'No trigger is required if the function has an input binding',
        ],
        why: 'The trigger defines how the function is invoked, so there is exactly one. Bindings are optional conveniences for reading and writing data. To react to two event sources, write two functions that share code.',
      },
      {
        key: 'nightly-job',
        question:
          'A cleanup job must run every night at 02:00 without anyone calling it. Which trigger fits?',
        correct: 'A timer trigger with a schedule expression',
        wrong: ['An HTTP trigger', 'A blob trigger', 'A Queue storage trigger'],
        why: 'A timer trigger runs on a schedule. The other triggers react to something happening (a request, a new blob, a message); using them for a schedule means building an external scheduler to poke the function.',
      },
      {
        key: 'output-binding',
        question:
          'This C# function (isolated worker model) accepts an order over HTTP. What does the `QueueOutput` attribute do with the returned string?',
        code: plain(`// C# (Microsoft.Azure.Functions.Worker packages)
public class SubmitOrder
{
    [Function("SubmitOrder")]
    [QueueOutput("orders", Connection = "OrdersStorage")]
    public async Task<string> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req)
    {
        var body = await req.ReadAsStringAsync();
        return body ?? "";
    }
}`),
        correct:
          'The return value is written as a message to the `orders` queue in the storage account named by the `OrdersStorage` setting',
        wrong: [
          'The function is triggered by messages in the `orders` queue',
          'The string is returned to the HTTP caller as the response body',
          'It creates a queue called `OrdersStorage` and writes the body there',
        ],
        why: 'An output binding writes the function’s result to a target without SDK code. The trigger is the HTTP attribute; `QueueOutput` only describes where the return value goes. `Connection` names an app setting (or setting prefix), not the queue.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-fn-ncrontab',
    2,
    'Function timer schedules have six fields, starting with seconds.',
    [
      {
        key: 'weekday-morning',
        question: 'When does a timer trigger with this schedule run?',
        code: plain('0 30 9 * * 1-5'),
        correct: 'At 09:30:00 every Monday to Friday (in UTC unless a time zone is configured)',
        wrong: [
          'At 00:30 on the 9th day of every month',
          'Every 30 minutes between 09:00 and 17:00',
          'At 09:30 on the 1st to 5th of each month',
        ],
        why: 'The fields are second, minute, hour, day of month, month, day of week. So: second 0, minute 30, hour 9, any day, any month, days of week 1–5. Reading it as a five-field Unix cron shifts every field by one.',
      },
      {
        key: 'every-five-seconds',
        question:
          'A developer meant to run a job every five minutes and wrote this schedule. What actually happens?',
        code: plain('*/5 * * * * *'),
        correct: 'It runs every five seconds',
        wrong: [
          'It runs every five minutes, as intended',
          'It runs every five hours',
          'It is rejected because the expression has six fields',
        ],
        why: 'The first field is seconds, so `*/5` there means every fifth second. Every five minutes is `0 */5 * * * *`. Five-field cron habits are the source of this bug.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-fn-config',
    2,
    'Local and cloud configuration come from different places, and the isolated worker is an ordinary .NET process.',
    [
      {
        key: 'local-settings-not-deployed',
        question:
          "A function reads the setting `OrdersDb`. It works locally, but after deployment it fails with `ArgumentNullException: Value cannot be null. (Parameter 'connectionString')`. The developer’s local.settings.json is shown. What is missing?",
        code: json(`{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "OrdersDb": "Server=localhost;Database=orders;Trusted_Connection=True"
  }
}`),
        correct:
          'An `OrdersDb` app setting on the function app in Azure: local.settings.json is only used by local tooling and is not deployed',
        wrong: [
          'The `IsEncrypted` flag must be true for values to be read in Azure',
          'Settings must be moved out of `Values` into a `ConnectionStrings` section to be deployed',
          'The `FUNCTIONS_WORKER_RUNTIME` value must be `dotnet` for custom settings to load',
        ],
        why: 'local.settings.json is for local development and is not part of the deployment. In Azure, settings come from the app’s application settings (ideally with secrets as Key Vault references or replaced by managed identity). `dotnet-isolated` is the correct worker runtime here.',
      },
      {
        key: 'isolated-worker-meaning',
        question:
          'An app sets `FUNCTIONS_WORKER_RUNTIME` to `dotnet-isolated`. What does the isolated worker model mean for the code?',
        correct:
          'Functions run in a separate .NET worker process from the Functions host, so the app controls its own .NET version and dependencies and configures DI and middleware in Program.cs',
        wrong: [
          'Functions run inside the host process and must use the same assembly versions as the host',
          'Each function invocation starts a new process, so static fields are always reset',
          'The app is isolated from the network and cannot make outbound calls',
        ],
        why: 'In the isolated worker model the host and your code communicate across a process boundary, which removes assembly conflicts with the host and gives you a normal .NET app startup. Sharing the host process was the older in-process model. Worker processes are reused across invocations, so static state persists.',
      },
      {
        key: 'missing-registration',
        difficulty: 3,
        question:
          "Every invocation of `ProcessOrder` fails with `Unable to resolve service for type 'IOrderRepository'`. Given this C# Program.cs and constructor, what is the fix?",
        code: plain(`// C# — Program.cs
var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddSingleton<IOrderStore, SqlOrderStore>();
    })
    .Build();
host.Run();

// C# — ProcessOrder.cs
public class ProcessOrder(IOrderRepository repository)
{
    [Function("ProcessOrder")]
    public Task Run([QueueTrigger("orders")] string message) => repository.SaveAsync(message);
}`),
        correct:
          'Register an implementation of `IOrderRepository` in `ConfigureServices`; the function class is created through dependency injection',
        wrong: [
          'Mark the constructor parameter `[FromServices]`',
          'Make the `Run` method static so no constructor is needed',
          'Add `IOrderRepository` as an app setting',
        ],
        why: 'In the isolated worker model, function classes are built by the standard .NET DI container configured in Program.cs. Only `IOrderStore` is registered, so the container cannot build `ProcessOrder`. A static method would compile, but `repository` would no longer exist.',
      },
      {
        key: 'identity-based-connection',
        difficulty: 4,
        question:
          'A Service Bus trigger uses `Connection = "ServiceBus"`. The team removed the connection string and added the app setting below to use the app’s managed identity instead. Triggers now fail with an unauthorized error. What else is needed?',
        code: plain(`ServiceBus__fullyQualifiedNamespace = sb-orders.servicebus.windows.net`),
        correct:
          'Grant the function app’s managed identity a Service Bus data role that allows receiving (such as Azure Service Bus Data Receiver) on the namespace or queue',
        wrong: [
          'Add the shared access connection string back next to the namespace setting',
          'Nothing; knowing the namespace name is enough for the platform to authorize',
          'Give the identity Reader on the Service Bus namespace',
        ],
        why: 'The `__fullyQualifiedNamespace` setting tells the extension to connect with a Microsoft Entra token from the managed identity instead of a key, but the identity still needs a data-plane role. Reader is a control-plane role and does not allow receiving messages. Adding the connection string back undoes the point of the change.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-fn-idempotency',
    3,
    'Assume every message can be delivered more than once, and make a second run harmless.',
    [
      {
        key: 'double-charge',
        question:
          'A Service Bus–triggered C# function charges a card and then saves the order. Occasionally a customer is charged twice. What is the right fix?',
        code: plain(`// C# (isolated worker)
[Function("ChargeOrder")]
public async Task Run([ServiceBusTrigger("orders", Connection = "ServiceBus")] OrderPlaced evt)
{
    await payments.ChargeAsync(evt.CustomerId, evt.Amount);   // calls the payment provider
    await db.SaveChargeAsync(evt.OrderId);                    // sometimes times out
}`),
        correct:
          'Make the work idempotent: pass the order ID as an idempotency key to the payment provider and skip orders already recorded as charged',
        wrong: [
          'Set the queue’s max delivery count to 1 so messages are never redelivered',
          'Catch every exception and return normally so the message is always completed',
          'Increase the function timeout so `SaveChargeAsync` always finishes',
        ],
        why: 'Service Bus triggers deliver at least once: when `SaveChargeAsync` fails after the charge, the message is retried and the charge repeats. Only idempotency fixes that. A delivery count of 1 dead-letters messages on any transient error; swallowing exceptions loses failed orders; a longer timeout reduces but does not remove redelivery.',
      },
      {
        key: 'duplicate-key-on-retry',
        question:
          'A queue-triggered function inserts a shipment row and then calls a carrier API. When the carrier call fails, the retry fails forever with a duplicate key error on the insert. What design fixes this?',
        correct:
          'Make the write idempotent, for example an upsert or insert-if-absent on the shipment’s natural key, so a retry can continue where the last attempt stopped',
        wrong: [
          'Generate a new random primary key on every attempt',
          'Delete the database row in a `finally` block',
          'Disable retries for the queue trigger',
        ],
        why: 'The retry repeats work that already succeeded. Keying the write on a stable business identifier lets a rerun detect it and move on. A random key creates duplicate shipments; deleting rows in `finally` loses data on success; disabling retries turns every transient carrier error into a lost shipment.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-fn-poison',
    3,
    'Each trigger has its own way of giving up on a message, and it only kicks in when the function reports failure.',
    [
      {
        key: 'storage-queue-poison',
        question:
          'A Queue storage–triggered function throws for a message whose JSON is malformed. With this host.json, what happens to that message?',
        code: json(`{
  "version": "2.0",
  "extensions": {
    "queues": { "maxDequeueCount": 5 }
  }
}`),
        correct:
          'It is retried until it has been dequeued five times, then moved to a queue named `<queue-name>-poison`',
        wrong: [
          'It is deleted after the first failure',
          'It is retried forever, blocking the queue',
          'It is moved to a dead-letter subqueue of the same queue',
        ],
        why: 'The Queue storage trigger counts dequeues; after `maxDequeueCount` failed attempts it moves the message to a poison queue named after the original. Storage queues have no dead-letter subqueue: that is the Service Bus mechanism. Other messages keep flowing meanwhile.',
      },
      {
        key: 'service-bus-dlq',
        question:
          'A Service Bus–triggered function throws for one message every time. The queue’s max delivery count is 10. What happens?',
        correct:
          'Each failure releases the message and its delivery count goes up; after 10 deliveries Service Bus moves it to the queue’s dead-letter subqueue',
        wrong: [
          'The Functions runtime moves it to a `-poison` queue after five attempts',
          'The message is deleted after the first exception',
          'The function app stops processing the queue until the message is removed',
        ],
        why: 'With Service Bus, the broker does the counting: every delivery increments the delivery count, and exceeding the max delivery count dead-letters the message with reason MaxDeliveryCountExceeded. The `-poison` queue is the Queue storage trigger’s mechanism.',
      },
      {
        key: 'swallowed-exception',
        difficulty: 4,
        question:
          'Failed messages never show up in the poison queue, and some orders are silently lost. Why, given this C# function?',
        code: plain(`// C# (isolated worker)
[Function("ImportOrder")]
public async Task Run([QueueTrigger("orders")] string message)
{
    try
    {
        await importer.ImportAsync(message);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Import failed");
    }
}`),
        correct:
          'Because the function returns normally, the runtime treats the invocation as successful and deletes the message; rethrow after logging so retries and the poison queue work',
        wrong: [
          '`LogError` moves the message to the poison queue only when Application Insights is enabled',
          'Queue triggers never retry, so a poison queue is never used',
          'The poison queue only receives messages that exceed the maximum message size',
        ],
        why: 'Retry and poison handling are driven by the function’s outcome. Catching and logging hides the failure, so the message is removed as processed. Log for context, then rethrow (or explicitly move the message somewhere safe).',
      },
    ],
  ),
  ...scenarioFamily(
    'az-fn-hosting',
    4,
    'Think about what the platform does when there are no instances running, and what limits the HTTP front end imposes.',
    [
      {
        key: 'cold-start',
        question:
          'An HTTP API on the Consumption plan is fast most of the day, but the first request after a quiet period takes several seconds. What explains it, and what addresses it?',
        correct:
          'The app scaled to zero and the first request waits for an instance to start (a cold start); a plan with always-ready or pre-warmed instances avoids it',
        wrong: [
          'The function timeout is too low; raise `functionTimeout` in host.json',
          'Application Insights sampling delays the first request; disable sampling',
          'The authorization level is `Function`; switching to `Anonymous` removes the delay',
        ],
        why: 'Consumption hosting releases instances when idle, so a new request must wait for one to be allocated and the worker to start. Plans that keep instances warm (such as Premium, or always-ready instances on Flex Consumption) trade cost for latency. Timeouts and sampling do not affect startup.',
      },
      {
        key: 'long-http-request',
        question:
          'An HTTP-triggered function builds a report that takes many minutes. Clients get a timeout error even though the function keeps running and finishes. What is the right design?',
        correct:
          'Accept the request quickly (202 Accepted), do the work in the background via a queue or Durable Functions, and let the client poll a status endpoint',
        wrong: [
          'Raise `functionTimeout` in host.json so the HTTP response can wait longer',
          'Scale the plan up to a larger instance size',
          'Have the client retry the same request until it succeeds',
        ],
        why: 'HTTP requests through the Functions front end have a response time limit independent of `functionTimeout`, so long synchronous requests fail regardless of plan. The asynchronous request-reply pattern frees the client immediately. Retrying starts the report again each time.',
      },
      {
        key: 'timer-scale-out',
        question:
          'A function app with a timer-triggered function has scaled out to five instances because of HTTP load. How many times does the timer function run per scheduled occurrence?',
        correct: 'Once: the timer trigger uses a lock so only one instance runs each occurrence',
        wrong: [
          'Five times, once per instance',
          'It depends on which instance started first, at least twice',
          'Zero: timer triggers are disabled while an app is scaled out',
        ],
        why: 'The timer trigger takes a lock in the app’s storage account so a schedule fires on a single instance.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-fn-monitoring',
    4,
    'Telemetry in Application Insights is not necessarily every event; and it is correlated by operation.',
    [
      {
        key: 'sampling',
        question:
          'Over an hour, 120,000 Service Bus messages were processed successfully, but Application Insights shows about 9,000 function requests. Nothing is failing. What explains the gap?',
        correct:
          'Adaptive sampling, enabled by default in host.json, keeps only a representative share of telemetry; tune or exclude types in `samplingSettings` if exact counts matter',
        wrong: [
          'Most invocations failed silently and were not logged',
          'Application Insights only records HTTP-triggered functions',
          'The other messages were processed by a different function app',
        ],
        why: 'Sampling reduces telemetry volume and cost, so raw counts of sampled telemetry are lower than the real number of executions. If an exact request count matters, exclude Request from sampling or count from the source of truth (such as Service Bus metrics). Requests from non-HTTP triggers are recorded too.',
      },
      {
        key: 'operation-id',
        question:
          'In Application Insights you have found one failed function request and want every trace and dependency call from that same invocation. Which field links them?',
        correct: '`operation_Id`',
        wrong: ['`cloud_RoleInstance`', '`timestamp`', '`resultCode`'],
        why: 'Telemetry from one logical operation shares an `operation_Id`, so you query traces, dependencies and exceptions with the request’s `operation_Id`. The role instance only identifies the machine, which runs many invocations at once; timestamps overlap for concurrent work.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-durable-determinism',
    5,
    'An orchestrator is replayed from its history many times; every replay must make the same decisions.',
    [
      {
        key: 'current-time',
        question:
          'A reviewer says this C# Durable Functions orchestrator breaks the orchestrator code constraints. What is the problem?',
        code: plain(`// C# (Durable Functions, isolated worker)
[Function(nameof(RemindOrchestrator))]
public static async Task RemindOrchestrator([OrchestrationTrigger] TaskOrchestrationContext context)
{
    var deadline = DateTime.UtcNow.AddHours(24);
    await context.CreateTimer(deadline, CancellationToken.None);
    await context.CallActivityAsync("SendReminder", context.GetInput<string>());
}`),
        correct:
          '`DateTime.UtcNow` returns a different value on each replay; use `context.CurrentUtcDateTime` so replays compute the same deadline',
        wrong: [
          '`CreateTimer` cannot be used with `CancellationToken.None`',
          'Activities must be called before timers in an orchestrator',
          'Orchestrators must be instance methods, not static',
        ],
        why: 'The orchestrator re-executes from the start each time it wakes, rebuilding its state from history. Nondeterministic calls such as `DateTime.UtcNow`, `Guid.NewGuid()` or random numbers produce different values on replay. The context provides deterministic replacements recorded in history.',
      },
      {
        key: 'io-in-orchestrator',
        question:
          'An orchestrator calls an external pricing API directly with `HttpClient` before calling activities. Logs show the API is called several times per orchestration. Why, and what is the fix?',
        code: plain(`// C# (Durable Functions, isolated worker)
var price = await httpClient.GetFromJsonAsync<decimal>("https://pricing.example/api/sku/42");
await context.CallActivityAsync("ReserveStock", 42);
await context.CallActivityAsync("CreateInvoice", price);`),
        correct:
          'The orchestrator code runs again on every replay, repeating the call; move the HTTP call into an activity so its result is recorded in history',
        wrong: [
          '`HttpClient` retries automatically inside orchestrators',
          'Each `CallActivityAsync` starts a new orchestration instance',
          'The orchestrator runs once per activity in parallel',
        ],
        why: 'After each awaited activity completes, the orchestrator replays from the top; completed activities return their recorded results instead of running again, but direct I/O runs every time and may return different values. I/O belongs in activities.',
      },
      {
        key: 'replay-logging',
        question:
          'A single orchestration instance with three activities writes “Starting order 42” to the logs several times. Nothing is wrong with the results. What is happening, and how do you get one log line?',
        code: plain(`// C# (Durable Functions, isolated worker)
var logger = executionLogger; // an ILogger injected into the function class
logger.LogInformation("Starting order {OrderId}", orderId);
await context.CallActivityAsync("Reserve", orderId);
await context.CallActivityAsync("Charge", orderId);
await context.CallActivityAsync("Ship", orderId);`),
        correct:
          'The line runs on every replay; use a replay-safe logger from `context.CreateReplaySafeLogger(...)`, which suppresses logging during replay',
        wrong: [
          'The orchestration really started several times because the start request was retried',
          'Each activity runs a copy of the orchestrator’s code before its own',
          'Application Insights duplicates log lines when sampling is enabled',
        ],
        why: 'Code in an orchestrator before an await executes again each time the orchestrator replays after an activity completes. Logging is a side effect, so use the replay-safe logger (or check `context.IsReplaying`). The instance itself started once.',
      },
    ],
  ),
];
