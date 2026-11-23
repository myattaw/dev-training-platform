import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { scenarioFamily } from './builders';

/*
 * Azure Service Bus: queues and topics, receive modes, settlement, locks and
 * redelivery, duplicate detection, sessions, dead-lettering, the outbox pattern
 * and idempotent consumers. C# using Azure.Messaging.ServiceBus is shown as plain
 * text: the C# runner does not reference that package.
 */

const processorCode = (handlerBody: string): string => `// C# (Azure.Messaging.ServiceBus)
var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    AutoCompleteMessages = false,
});

processor.ProcessMessageAsync += async args =>
{
${handlerBody}
};`;

export const serviceBusFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'az-sb-queue-topic',
    1,
    'Does each message go to one receiver, or does every interested party need its own copy?',
    [
      {
        key: 'fan-out',
        question:
          'When an order is placed, billing, shipping and analytics must each receive their own copy of the event. Which Service Bus setup fits?',
        correct: 'A topic with one subscription per consuming service',
        wrong: [
          'One queue that all three services receive from',
          'Three senders writing to the same queue',
          'A queue with sessions, one session per service',
        ],
        why: 'A topic copies each message into every subscription, and each service reads from its own subscription at its own pace. Receivers on one queue compete: each message goes to only one of them.',
      },
      {
        key: 'work-queue',
        question:
          'Four worker instances share the job of resizing uploaded images. Each job must be processed by exactly one worker. Which setup fits?',
        correct: 'One queue, with all four workers receiving from it as competing consumers',
        wrong: [
          'A topic with four subscriptions, one per worker',
          'Four queues, with the uploader choosing one at random',
          'A topic with a single subscription per image size',
        ],
        why: 'Competing consumers on a queue spread work: each message is locked by one receiver at a time. A topic with a subscription per worker would give every worker a copy, so each image would be resized four times.',
      },
      {
        key: 'subscription-filter',
        difficulty: 2,
        question:
          'Messages on the `orders` topic carry an application property `region`. The EU warehouse only wants EU orders. What is the right design?',
        correct:
          "Give the EU warehouse’s subscription a filter on `region = 'EU'`, so only matching messages are copied into it",
        wrong: [
          'Let the warehouse receive everything and complete non-EU messages without processing them',
          'Create a separate topic for each region and have publishers send every order to all topics',
          'Use a queue and let the EU warehouse peek messages until it finds an EU one',
        ],
        why: 'Subscription filters (SQL or correlation filters on message properties) decide which messages a subscription receives, so filtering happens in the broker. Receiving and discarding wastes work and hides bugs; peeking does not remove messages and would not scale.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-sb-receive-modes',
    2,
    'In peek-lock the message stays in the queue until it is settled; in receive-and-delete it is gone as soon as it is handed over.',
    [
      {
        key: 'receive-and-delete-crash',
        question:
          'A consumer uses ReceiveAndDelete mode. It receives a message and the process crashes before finishing. What happens to the message?',
        correct: 'It is lost: it was removed from the queue when it was received',
        wrong: [
          'It becomes available again when the lock expires',
          'It is moved to the dead-letter queue',
          'It is redelivered once to the same consumer when it restarts',
        ],
        why: 'ReceiveAndDelete gives at-most-once delivery: the broker deletes the message as it hands it over, so a crash loses it. Locks, redelivery and dead-lettering only exist in PeekLock mode.',
      },
      {
        key: 'peek-lock-crash',
        question:
          'A consumer uses PeekLock mode. It receives a message and crashes before completing it. What happens to the message?',
        correct:
          'When the lock expires it becomes available again, and its delivery count goes up by one',
        wrong: [
          'It is lost, because it was delivered once',
          'It is immediately moved to the dead-letter queue',
          'It stays locked until an administrator releases it',
        ],
        why: 'PeekLock keeps the message in the queue but invisible to others until it is completed, abandoned, dead-lettered or the lock expires. On lock expiry it is delivered again, which is why consumers must tolerate duplicates.',
      },
      {
        key: 'abandon',
        question:
          'A consumer calls `AbandonMessageAsync` on a message it received in PeekLock mode. What happens?',
        correct:
          'The lock is released so the message can be received again right away, and its delivery count goes up',
        wrong: [
          'The message is deleted from the queue',
          'The message is moved to the dead-letter queue immediately',
          'The message is delayed until the queue’s time-to-live has passed',
        ],
        why: 'Abandon gives the message back without waiting for the lock to expire. Repeated abandons still count as deliveries, so a message that always fails ends in the dead-letter queue once it exceeds the max delivery count.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-sb-settlement',
    3,
    'Trace each path through the handler and ask which settlement call (if any) happens on it.',
    [
      {
        key: 'invalid-order',
        question: 'With this C# handler, what happens to a message whose order has no lines?',
        code: plain(
          processorCode(`    var order = JsonSerializer.Deserialize<Order>(args.Message.Body.ToString());
    if (order is null || order.Lines.Count == 0)
    {
        await args.DeadLetterMessageAsync(args.Message, "InvalidOrder", "Order has no lines");
        return;
    }
    await orders.SaveAsync(order);
    await args.CompleteMessageAsync(args.Message);`),
        ),
        correct:
          'It moves to the dead-letter subqueue straight away with reason InvalidOrder, without being retried',
        wrong: [
          'It is retried until the max delivery count is reached, then dead-lettered',
          'It is completed, because the handler returned without an exception',
          'It is abandoned and returns to the front of the queue',
        ],
        why: 'Explicit dead-lettering is right for messages that can never succeed: retrying bad data only wastes deliveries. The reason and description are stored on the message, so whoever inspects the dead-letter queue knows why.',
      },
      {
        key: 'save-throws',
        question:
          'With the same handler, `SaveAsync` throws a transient database exception for a valid order. What happens to the message?',
        code: plain(
          processorCode(`    var order = JsonSerializer.Deserialize<Order>(args.Message.Body.ToString());
    if (order is null || order.Lines.Count == 0)
    {
        await args.DeadLetterMessageAsync(args.Message, "InvalidOrder", "Order has no lines");
        return;
    }
    await orders.SaveAsync(order);
    await args.CompleteMessageAsync(args.Message);`),
        ),
        correct:
          'It is not completed, so it becomes available again and is retried; if it keeps failing it is dead-lettered once it exceeds the max delivery count',
        wrong: [
          'It is lost, because the handler threw',
          'It is dead-lettered with reason InvalidOrder',
          'It is completed, because the order was valid',
        ],
        why: 'Completion is the only thing that removes the message, and it never runs. The message comes back (after an abandon or when its lock expires) with a higher delivery count. That is the retry mechanism for transient failures.',
      },
      {
        key: 'complete-too-early',
        question: 'What is wrong with this C# handler?',
        code: plain(
          processorCode(`    await args.CompleteMessageAsync(args.Message);
    var order = JsonSerializer.Deserialize<Order>(args.Message.Body.ToString())!;
    await orders.SaveAsync(order);`),
        ),
        correct:
          'It completes the message before doing the work, so if `SaveAsync` fails the message is already gone and the order is lost',
        wrong: [
          'Messages must be deserialised before they can be completed',
          'Completing a message in the handler causes it to be processed twice',
          'Nothing; completing early only improves throughput',
        ],
        why: 'Settle after the work succeeds. Completing first turns PeekLock back into at-most-once delivery: any failure afterwards drops the message silently.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-sb-lock-duplicates',
    4,
    'Separate duplicates created by the sender from redeliveries of the same message to the receiver.',
    [
      {
        key: 'lock-lost',
        question:
          'The `reports` queue has a lock duration of 60 seconds, and automatic lock renewal is turned off. What explains this log, and what fixes it?',
        code: plain(`10:00:00 Received message 7f3c (DeliveryCount=1)
10:01:20 Report generated for 7f3c
10:01:20 ServiceBusException: The lock supplied is invalid. Either the lock expired,
         or the message has already been removed from the queue. (MessageLockLost)
10:01:21 Received message 7f3c (DeliveryCount=2)
10:02:40 Report generated for 7f3c`),
        correct:
          'Processing takes longer than the lock, so the message is released and redelivered; renew the lock while working (or shorten the work) and make the handler idempotent',
        wrong: [
          'Enable duplicate detection on the queue so the second delivery is dropped',
          'Raise the max delivery count so the message is not dead-lettered',
          'Switch to ReceiveAndDelete so the lock can never expire',
        ],
        why: 'The lock expired at 10:01:00, so the completion at 10:01:20 fails and the message is delivered again: the report is built twice. Lock renewal keeps ownership during long work. Duplicate detection only filters duplicate sends, not redeliveries, and ReceiveAndDelete would lose messages on a crash.',
      },
      {
        key: 'duplicate-detection-scope',
        question:
          'A queue has duplicate detection enabled. A consumer still processes the same message twice: same MessageId, DeliveryCount 1 then 2. Why?',
        correct:
          'Duplicate detection drops repeated sends with the same MessageId; redelivering an unsettled message is the same message, not a new send, so the consumer must be idempotent',
        wrong: [
          'Duplicate detection only works when sessions are enabled',
          'The duplicate detection window was shorter than the lock duration',
          'Duplicate detection only applies to topics, not queues',
        ],
        why: 'Duplicate detection protects against a sender that sends the same message twice (for example after a timeout). It cannot know whether a receiver finished its work, so at-least-once redelivery still requires an idempotent consumer.',
      },
      {
        key: 'sender-new-message-id',
        question:
          'The `payments` queue has duplicate detection enabled, yet duplicates appear after send timeouts. Here is the sender’s C# retry loop. What is the fix?',
        code: plain(`// C# (Azure.Messaging.ServiceBus)
for (var attempt = 1; attempt <= 3; attempt++)
{
    try
    {
        var message = new ServiceBusMessage(BinaryData.FromObjectAsJson(payment))
        {
            MessageId = Guid.NewGuid().ToString(),
        };
        await sender.SendMessageAsync(message);
        break;
    }
    catch (ServiceBusException ex) when (ex.IsTransient) { }
}`),
        correct:
          'Derive the MessageId from the business identity (such as the payment ID) so every retry sends the same MessageId',
        wrong: [
          'Lengthen the duplicate detection window',
          'Remove the `IsTransient` filter so all exceptions are retried',
          'Create the sender inside the loop so each attempt uses a new connection',
        ],
        why: 'A timeout does not mean the send failed; the first message may have arrived. Duplicate detection compares MessageIds, and a new GUID per attempt makes every retry look like a different message. A stable, business-derived MessageId makes retries detectable.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-sb-sessions',
    4,
    'Ordering is per session, and a queue’s session support is chosen when the queue is created.',
    [
      {
        key: 'order-per-account',
        question:
          'Events for each bank account must be processed in order, but different accounts should be processed in parallel. Which approach fits?',
        correct:
          'A session-enabled queue with SessionId set to the account ID, consumed by a session processor',
        wrong: [
          'A normal queue with one consumer and a concurrency of 1',
          'Scheduled messages, with each event scheduled one second after the previous one',
          'A topic with one subscription per account',
        ],
        why: 'Sessions give first-in, first-out processing within a session and let different sessions be handled concurrently, since each session is locked to one receiver at a time. A single consumer preserves order but throws away parallelism; scheduling by time is not a guarantee; a subscription per account does not scale.',
      },
      {
        key: 'queue-not-session-enabled',
        question:
          'The sender sets SessionId to the customer ID, and the consumer uses a normal processor with MaxConcurrentCalls = 16. Events for a customer are sometimes handled out of order. The queue was created without sessions. What is the fix?',
        correct:
          'Create a session-enabled queue (session support is set at creation) and consume it with a session processor',
        wrong: [
          'Set MaxConcurrentCalls to 32 so events finish faster',
          'Enable duplicate detection so events stay in order',
          'Nothing: setting SessionId on each message is enough for ordering',
        ],
        why: 'On a queue without sessions, SessionId is just a property; 16 concurrent handlers take messages in whatever order they finish. Ordering needs a session-enabled queue and a session receiver, and that setting cannot be switched on for an existing queue.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-sb-outbox',
    5,
    'Two systems (the database and the broker) cannot be updated in one transaction; decide what happens between the two writes.',
    [
      {
        key: 'dual-write',
        question:
          'This C# code occasionally leaves orders in the database that no downstream service ever hears about. Which design fixes that?',
        code: plain(`// C#
await using var tx = await db.Database.BeginTransactionAsync();
db.Orders.Add(order);
await db.SaveChangesAsync();
await tx.CommitAsync();

// the process can stop here
await sender.SendMessageAsync(new ServiceBusMessage(BinaryData.FromObjectAsJson(order)));`),
        correct:
          'Transactional outbox: save the order and an outbox row in the same database transaction, and have a relay publish outbox rows to Service Bus and mark them sent',
        wrong: [
          'Send the message before committing the transaction',
          'Wrap the send in a retry loop with exponential backoff',
          'Use ReceiveAndDelete on the consumer side',
        ],
        why: 'A crash or broker outage between commit and send loses the event; sending first instead can announce orders that then fail to commit. Retrying does not help if the process dies. The outbox makes “order saved” and “event recorded” one atomic write, and publishing becomes a retryable background job.',
      },
      {
        key: 'relay-duplicates',
        question:
          'An outbox relay sends a row’s message to Service Bus, then crashes before marking the row as sent. What happens next, and how should the system cope?',
        correct:
          'The relay sends the row again after restart; use a deterministic MessageId (such as the outbox row ID) with duplicate detection, and keep consumers idempotent',
        wrong: [
          'Nothing; Service Bus knows the message came from an outbox and ignores it',
          'The row is lost and must be recreated by hand',
          'The relay must delete each outbox row before sending it',
        ],
        why: 'The outbox gives at-least-once publishing, not exactly-once. A stable MessageId lets duplicate detection drop the repeat within its window, and idempotent consumers handle anything that slips through. Deleting before sending reintroduces the lost-message problem.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-sb-dead-letter-ops',
    5,
    'Dead-lettered messages stay put until someone deals with them, and some reasons for dead-lettering are optional features.',
    [
      {
        key: 'resubmit-after-outage',
        question:
          'During a two-hour outage of a downstream API, 3,000 messages on `orders` were dead-lettered with reason MaxDeliveryCountExceeded. The API is fixed. What should the team do?',
        correct:
          'Receive the messages from `orders/$deadletterqueue`, send copies back to `orders`, and complete each dead-lettered message once its copy is sent',
        wrong: [
          'Wait: Service Bus moves dead-lettered messages back automatically when they expire',
          'Raise the queue’s max delivery count; dead-lettered messages are then retried',
          'Delete and recreate the queue to reset all delivery counts',
        ],
        why: 'The dead-letter subqueue is a holding area: messages there are not retried and do not expire on their own. Resubmitting means sending new messages to the main queue (with a tool or a small program). Changing queue settings does not affect messages already dead-lettered, and recreating the queue deletes them.',
      },
      {
        key: 'expired-messages-vanish',
        question:
          'Messages on a queue have a time-to-live. Some expire before being processed and disappear without a trace. The team wants to keep them for investigation. What should they change?',
        correct: 'Enable dead-lettering on message expiration for the queue',
        wrong: [
          'Increase the max delivery count',
          'Enable duplicate detection',
          'Switch the consumer to ReceiveAndDelete',
        ],
        why: 'By default expired messages are simply removed. With dead-lettering on expiration enabled, they move to the dead-letter subqueue instead, where they can be inspected and resubmitted. Max delivery count is about failed deliveries, not expiry.',
      },
    ],
  ),
];
